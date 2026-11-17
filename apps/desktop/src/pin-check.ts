import { pbkdf2, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Offline PIN checks on the till. No Electron imports, so it's unit-tested
 * in plain Node. The stored format comes from the API
 * (apps/api/src/common/utils/pin.ts): "pbkdf2-sha256$<rounds>$<salt>$<hash>".
 */
const pbkdf2Async = promisify(pbkdf2);

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, rounds, salt, hashHex] = stored.split("$");
  const iterations = Number(rounds);
  if (scheme !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 1 || !salt || !hashHex) return false;
  if (!/^\d{4,6}$/.test(pin)) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await pbkdf2Async(pin, salt, iterations, expected.length, "sha256");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Same rule as the server: 5 wrong PINs in a row lock that person for 5 minutes. */
export const MAX_TRIES = 5;
export const LOCK_MS = 5 * 60 * 1000;

export interface LockoutEntry {
  failed: number;
  lockedUntil: number;
}

/** What's kept between runs of the app: counts and times only, never a PIN. */
export interface LockoutState {
  entries: Record<string, LockoutEntry>;
  /** Everyone is locked until then: set when the saved counts couldn't be read. */
  lockedAllUntil?: number;
}

export interface LockoutStore {
  /** null: nothing saved yet (a new till). Throws if what's saved can't be read. */
  load(): LockoutState | null;
  /** Throws if it can't be saved. */
  save(state: LockoutState): void;
}

function validEntry(e: unknown): e is LockoutEntry {
  const v = e as LockoutEntry;
  return !!v && Number.isInteger(v.failed) && v.failed >= 0 && Number.isFinite(v.lockedUntil) && v.lockedUntil >= 0;
}

function validState(s: unknown): s is LockoutState {
  const v = s as LockoutState;
  if (!v || typeof v !== "object" || !v.entries || typeof v.entries !== "object" || Array.isArray(v.entries)) return false;
  if (v.lockedAllUntil !== undefined && !Number.isFinite(v.lockedAllUntil)) return false;
  return Object.values(v.entries).every(validEntry);
}

/**
 * The offline wrong-PIN count. Fail-closed: it decides only from counts it
 * can trust and keep.
 *
 * - A try is counted, and saved, before the PIN is checked (begin). If it
 *   can't be saved, the PIN isn't checked at all: a restart would otherwise
 *   hand out fresh tries.
 * - Saved counts that can't be read (corrupt, unreadable) lock everyone
 *   for LOCK_MS; that lock is saved too where possible.
 * - A saved lock further ahead than LOCK_MS (a clock turned back) is
 *   brought back to LOCK_MS from when it's read, so it can't last for good.
 *
 * Without a store (tests, older callers) the counts live in memory only.
 */
export class PinLockout {
  private state: LockoutState | null = null;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly store?: LockoutStore,
  ) {}

  private current(): LockoutState {
    if (this.state) return this.state;
    if (!this.store) return (this.state = { entries: {} });
    try {
      const loaded = this.store.load();
      if (loaded === null) return (this.state = { entries: {} });
      if (!validState(loaded)) throw new Error("unreadable PIN lockout");
      this.state = { entries: { ...loaded.entries }, lockedAllUntil: loaded.lockedAllUntil };
      // A lock further ahead than LOCK_MS (the clock was turned back) is
      // brought back to LOCK_MS from now, and kept that way, so it ends.
      const latest = this.now() + LOCK_MS;
      let changed = false;
      if ((this.state.lockedAllUntil ?? 0) > latest) {
        this.state.lockedAllUntil = latest;
        changed = true;
      }
      for (const entry of Object.values(this.state.entries)) {
        if (entry.lockedUntil > latest) {
          entry.lockedUntil = latest;
          changed = true;
        }
      }
      if (changed) this.persist();
      return this.state;
    } catch {
      this.state = { entries: {}, lockedAllUntil: this.now() + LOCK_MS };
      this.persist();
      return this.state;
    }
  }

  /** Saves the counts; false if that failed. */
  private persist(): boolean {
    if (!this.store) return true;
    try {
      this.store.save(this.current());
      return true;
    } catch {
      return false;
    }
  }

  isLocked(userId: string): boolean {
    const state = this.current();
    const now = this.now();
    return (state.lockedAllUntil ?? 0) > now || (state.entries[userId]?.lockedUntil ?? 0) > now;
  }

  /**
   * Before checking someone's PIN: counts the try and saves it. The fifth
   * try in a row locks them (cleared again if the PIN is right). False if
   * the count couldn't be saved: then don't check the PIN.
   */
  begin(userId: string): boolean {
    const state = this.current();
    const entry = state.entries[userId] ?? { failed: 0, lockedUntil: 0 };
    entry.failed++;
    if (entry.failed >= MAX_TRIES) {
      entry.failed = 0;
      entry.lockedUntil = this.now() + LOCK_MS;
    }
    state.entries[userId] = entry;
    return this.persist();
  }

  /** The PIN was right: their count starts again (if that can't be saved, the old count stands). */
  succeeded(userId: string) {
    const state = this.current();
    if (!state.entries[userId]) return;
    delete state.entries[userId];
    this.persist();
  }
}

export interface FileLockoutOptions {
  /**
   * The file should exist (it was created before on this till). Then a
   * missing file isn't a new till: it disappeared, and counts as unreadable.
   */
  expected?: () => boolean;
  /** After each save: record that the file exists now (see expected). */
  onSaved?: () => void;
}

/**
 * The counts in their own file (pin-lockout.json beside config.json), never
 * in config.json: a failure here can't touch the server address, the till
 * or its key. Written to a temporary file, then renamed into place.
 */
export function fileLockoutStore(file: () => string, options: FileLockoutOptions = {}): LockoutStore {
  return {
    load() {
      let text: string;
      try {
        text = fs.readFileSync(file(), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        // Missing: a new (or just upgraded) till, unless it was there before.
        if (options.expected?.()) throw new Error("PIN lockout file disappeared");
        return null;
      }
      const parsed = JSON.parse(text) as unknown;
      // Only a missing file means "nothing saved"; anything else unreadable is corrupt.
      if (!parsed || typeof parsed !== "object") throw new Error("unreadable PIN lockout");
      return parsed as LockoutState;
    },
    save(state) {
      const target = file();
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const tmp = `${target}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, target);
      try {
        options.onSaved?.();
      } catch {
        // The marker is extra protection; the counts are saved either way.
      }
    },
  };
}
