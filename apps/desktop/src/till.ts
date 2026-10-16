import { app, net, safeStorage, session } from "electron";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getConfig, updateConfig } from "./config";
import { log } from "./logging";
import { PinLockout, verifyPin } from "./pin-check";

/**
 * The till's key and its PIN sign-in (docs/plans/TILL_ESSENTIALS.md, part 3).
 *
 * - The key comes back once when the till is registered (or re-keyed); the
 *   API forwarder takes it out of that response, so the page never sees it,
 *   and adds it to every request as X-Terminal-Key.
 * - The staff list (who may sign in here, their permissions and a PIN check
 *   value) is kept so PINs work offline. Both are encrypted with Windows'
 *   own protection (DPAPI) when it's available.
 */

const staffMemberSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(["OWNER", "MANAGER", "CASHIER"]),
  language: z.string().nullable().optional(),
  displaySize: z.number().int().nullable().optional(),
  pin: z.string(),
  permissions: z.record(z.string(), z.boolean()),
});

type StaffMember = z.infer<typeof staffMemberSchema>;

/** What the sign-in screen may see: no PIN check values. */
export type PublicStaffMember = Pick<StaffMember, "id" | "firstName" | "lastName" | "role">;

export type PinSignInResult =
  | { ok: true; mode: "online"; session: unknown }
  | { ok: true; mode: "offline"; user: Omit<StaffMember, "pin"> }
  | { ok: false; code: "wrong" | "locked" | "no-access" | "unknown-user" | "not-registered"; error: string };

const TERMINAL_KEY_HEADER = "X-Terminal-Key";
const RESUME_WINDOW_MS = 12 * 60 * 60 * 1000;

function protect(text: string): string {
  if (safeStorage.isEncryptionAvailable()) return `dpapi:${safeStorage.encryptString(text).toString("base64")}`;
  return `plain:${Buffer.from(text, "utf8").toString("base64")}`;
}

function unprotect(value: string): string | null {
  try {
    if (value.startsWith("dpapi:")) return safeStorage.decryptString(Buffer.from(value.slice(6), "base64"));
    if (value.startsWith("plain:")) return Buffer.from(value.slice(6), "base64").toString("utf8");
  } catch (err) {
    log.warn(`[till] couldn't read protected value: ${(err as Error).message}`);
  }
  return null;
}

// ---------------------------------------------------------------- key

export function getTerminalKey(): string | null {
  const stored = getConfig().terminalKey;
  return stored ? unprotect(stored) : null;
}

export function hasTerminalKey(): boolean {
  return !!getTerminalKey();
}

export function setTerminalKey(key: string | null) {
  updateConfig({ terminalKey: key ? protect(key) : null });
  if (!key) clearStaff();
  log.info(key ? "[till] key saved" : "[till] key removed");
}

/** Adds the till's key to a request going to the server. */
export function addKeyHeader(headers: Headers) {
  const key = getTerminalKey();
  if (key) headers.set(TERMINAL_KEY_HEADER, key);
}

/**
 * POST /terminals, /terminals/pair and /terminals/:id/key answer with the till's new
 * key. Keep it here and pass the rest of the answer on to the page.
 */
export function isKeyResponse(method: string, apiPath: string): boolean {
  return method === "POST" && /^\/terminals(?:\/pair|\/[^/]+\/key)?$/.test(apiPath);
}

export function takeKeyFromBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.key === "string") {
      setTerminalKey(parsed.key);
      delete parsed.key;
      return JSON.stringify(parsed);
    }
  } catch {
    // not JSON: pass it on as it is
  }
  return body;
}

// ---------------------------------------------------------------- staff

function staffPath() {
  return path.join(app.getPath("userData"), "staff.dat");
}

let staffCache: StaffMember[] | null = null;

function readStaff(): StaffMember[] {
  if (staffCache) return staffCache;
  try {
    const text = unprotect(fs.readFileSync(staffPath(), "utf8"));
    const parsed = text ? z.array(staffMemberSchema).safeParse(JSON.parse(text)) : null;
    staffCache = parsed?.success ? parsed.data : [];
  } catch {
    staffCache = [];
  }
  return staffCache;
}

function writeStaff(staff: StaffMember[]) {
  const file = staffPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, protect(JSON.stringify(staff)));
  fs.renameSync(`${file}.tmp`, file);
  staffCache = staff;
}

function clearStaff() {
  staffCache = [];
  fs.rmSync(staffPath(), { force: true });
}

export function listStaff(): PublicStaffMember[] {
  return readStaff().map(({ id, firstName, lastName, role }) => ({ id, firstName, lastName, role }));
}

export async function serverFetch(apiPath: string, init: { method?: string; body?: unknown } = {}) {
  const serverUrl = getConfig().serverUrl;
  if (!serverUrl) throw new Error("No server address configured");
  const headers = new Headers({ "Content-Type": "application/json" });
  addKeyHeader(headers);
  return net.fetch(`${serverUrl}${apiPath}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "include",
    signal: AbortSignal.timeout(8000),
    bypassCustomProtocolHandlers: true,
  });
}

/** Fetches who may sign in on this till and keeps it for offline use. */
export async function refreshStaff(): Promise<{ ok: boolean; count: number }> {
  if (!hasTerminalKey()) return { ok: false, count: listStaff().length };
  try {
    const res = await serverFetch("/terminals/me/staff");
    if (res.status === 401) {
      log.warn("[till] the server no longer knows this till's key");
      return { ok: false, count: listStaff().length };
    }
    if (!res.ok) return { ok: false, count: listStaff().length };
    const parsed = z.array(staffMemberSchema).safeParse(await res.json());
    if (!parsed.success) return { ok: false, count: listStaff().length };
    writeStaff(parsed.data);
    return { ok: true, count: parsed.data.length };
  } catch {
    return { ok: false, count: listStaff().length };
  }
}

// ---------------------------------------------------------------- PIN sign-in

const lockout = new PinLockout();

/** The refresh cookie belongs to whoever signed in last: drop it when someone else takes over offline. */
async function forgetRefreshCookie() {
  const serverUrl = getConfig().serverUrl;
  if (!serverUrl) return;
  const cookies = await session.defaultSession.cookies.get({ url: serverUrl, name: "refresh_token" });
  for (const c of cookies) await session.defaultSession.cookies.remove(serverUrl, c.name);
}

/**
 * Online: the server checks the PIN and starts a normal session. If the
 * server can't be reached, the PIN is checked against the saved staff list
 * and the person works offline; the server session follows when it's back
 * (resumeSession).
 */
export async function pinSignIn(userId: string, pin: string): Promise<PinSignInResult> {
  if (!hasTerminalKey()) return { ok: false, code: "not-registered", error: "This till isn't registered" };

  let res: Response | null = null;
  try {
    res = await serverFetch("/auth/pin", { method: "POST", body: { userId, pin } });
  } catch {
    res = null; // unreachable: check offline below
  }
  if (res && res.status < 500) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.ok) {
      lockout.succeeded(userId);
      updateConfig({ pinResume: null });
      void refreshStaff();
      log.info(`[till] PIN sign-in ${userId}`);
      return { ok: true, mode: "online", session: body };
    }
    // Asked in English, so the message tells the cases apart; the screen
    // shows its own words for each code.
    const error = body.message ?? "Wrong PIN";
    if (res.status === 403) return { ok: false, code: error.startsWith("Too many") ? "locked" : "no-access", error };
    if (res.status === 401 && /registered/.test(error)) return { ok: false, code: "not-registered", error };
    return { ok: false, code: "wrong", error };
  }

  // Offline (or the server is failing): use the saved list.
  const member = readStaff().find((s) => s.id === userId);
  if (!member) return { ok: false, code: "unknown-user", error: "Unknown person" };
  if (lockout.isLocked(userId)) return { ok: false, code: "locked", error: "Too many wrong PINs. Try again in a few minutes." };
  if (!(await verifyPin(pin, member.pin))) {
    lockout.failed(userId);
    return { ok: false, code: "wrong", error: "Wrong PIN" };
  }
  lockout.succeeded(userId);
  await forgetRefreshCookie();
  updateConfig({ pinResume: { userId, verifiedAt: new Date().toISOString() } });
  log.info(`[till] offline PIN sign-in ${userId}`);
  const { pin: _pin, ...user } = member;
  return { ok: true, mode: "offline", user };
}

// ---------------------------------------------------------------- manager approval (offline)

export type ApprovalCheckResult =
  | { ok: true }
  | { ok: false; code: "wrong" | "locked" | "no-access" | "unknown-user"; error: string };

/** People on this till's saved list who may approve `permission` (for the approval popup while offline). */
export function listApprovers(permission: string, exceptUserId?: string): PublicStaffMember[] {
  return readStaff()
    .filter((s) => s.permissions[permission] === true && s.id !== exceptUserId)
    .map(({ id, firstName, lastName, role }) => ({ id, firstName, lastName, role }));
}

/**
 * Offline manager override: checks the approver's PIN and permission
 * against the saved list. Nobody's signed in or out; the upload records
 * who approved it. Same lockout as signing in.
 */
export async function checkApproval(userId: string, pin: string, permission: string): Promise<ApprovalCheckResult> {
  const member = readStaff().find((s) => s.id === userId);
  if (!member) return { ok: false, code: "unknown-user", error: "Unknown person" };
  if (lockout.isLocked(userId)) return { ok: false, code: "locked", error: "Too many wrong PINs. Try again in a few minutes." };
  if (!(await verifyPin(pin, member.pin))) {
    lockout.failed(userId);
    return { ok: false, code: "wrong", error: "Wrong PIN" };
  }
  lockout.succeeded(userId);
  if (member.permissions[permission] !== true) return { ok: false, code: "no-access", error: "This person can't approve it" };
  log.info(`[till] offline approval of ${permission} by ${userId}`);
  return { ok: true };
}

export type ResumeResult =
  | { ok: true; session: unknown }
  | { ok: false; code: "unreachable" | "rejected" | "nothing"; error?: string };

/** After an offline PIN sign-in: a server session for the same person, now it's reachable. */
export async function resumeSession(userId: string): Promise<ResumeResult> {
  const pending = getConfig().pinResume;
  if (!pending || pending.userId !== userId) return { ok: false, code: "nothing" };
  if (Date.now() - Date.parse(pending.verifiedAt) > RESUME_WINDOW_MS) {
    updateConfig({ pinResume: null });
    return { ok: false, code: "rejected", error: "Sign in again with your PIN" };
  }
  let res: Response;
  try {
    res = await serverFetch("/auth/pin/resume", { method: "POST", body: pending });
  } catch {
    return { ok: false, code: "unreachable" };
  }
  if (res.status >= 500) return { ok: false, code: "unreachable" };
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    updateConfig({ pinResume: null });
    return { ok: false, code: "rejected", error: body.message };
  }
  updateConfig({ pinResume: null });
  log.info(`[till] session resumed for ${userId}`);
  return { ok: true, session: body };
}
