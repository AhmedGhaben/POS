import { createSign } from "node:crypto";
import { safeStorage } from "electron";
import { getConfig, updateConfig } from "./config";
import { log } from "./logging";
import { hasTerminalKey, serverFetch } from "./till";

/**
 * The till signs every fiscal document as it issues it (docs/plans/ANGOLA.md,
 * phase 8): RSA-SHA1 over "InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal;
 * previous hash" along its own series, online or offline, so the receipt
 * carries its 4 hash characters straight away.
 *
 * - The key comes only from the server, to a registered till, asked with the
 *   till's key (never through the page, which can only ask for signatures).
 * - It is kept encrypted with Windows' protection (DPAPI via safeStorage),
 *   never in plain text: without DPAPI the till doesn't keep it at all.
 * - It has a version (HashControl once certified), so it can be rotated: a
 *   refresh picks up a new one.
 * - A till whose access was withdrawn gets 401 and drops the key.
 */

export interface SigningStatus {
  hasKey: boolean;
  keyVersion: string | null;
  /** What to print as HashControl: "0" until the software is certified. */
  hashControl: string | null;
  /** DPAPI is available, so the key can be kept. */
  secureStorage: boolean;
}

function readKey(): string | null {
  const stored = getConfig().signingKey;
  if (!stored || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(stored, "base64"));
  } catch (err) {
    log.warn(`[signing] couldn't read the signing key: ${(err as Error).message}`);
    return null;
  }
}

export function signingStatus(): SigningStatus {
  const config = getConfig();
  const hasKey = !!readKey();
  return {
    hasKey,
    keyVersion: hasKey ? (config.signingKeyVersion ?? null) : null,
    hashControl: hasKey ? (config.signingHashControl ?? "0") : null,
    secureStorage: safeStorage.isEncryptionAvailable(),
  };
}

export function clearSigningKey(reason: string) {
  if (getConfig().signingKey) log.info(`[signing] key removed: ${reason}`);
  updateConfig({ signingKey: null, signingKeyVersion: null, signingHashControl: null });
}

/** Fetches (or rotates) the signing key; drops it if the server no longer knows this till. */
export async function refreshSigningKey(): Promise<SigningStatus & { ok: boolean }> {
  if (!hasTerminalKey()) {
    clearSigningKey("this till isn't registered");
    return { ok: false, ...signingStatus() };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn("[signing] Windows data protection isn't available: the signing key can't be kept on this computer");
    return { ok: false, ...signingStatus() };
  }
  try {
    const res = await serverFetch("/fiscal-documents/signing-key");
    if (res.status === 401 || res.status === 403) {
      clearSigningKey("the server withdrew this till's access");
      return { ok: false, ...signingStatus() };
    }
    if (!res.ok) return { ok: false, ...signingStatus() };
    const body = (await res.json()) as { privateKeyPem?: unknown; keyVersion?: unknown; hashControl?: unknown };
    if (typeof body.privateKeyPem !== "string" || typeof body.keyVersion !== "string") return { ok: false, ...signingStatus() };
    const before = getConfig().signingKeyVersion;
    updateConfig({
      signingKey: safeStorage.encryptString(body.privateKeyPem).toString("base64"),
      signingKeyVersion: body.keyVersion,
      signingHashControl: typeof body.hashControl === "string" ? body.hashControl : "0",
    });
    if (before !== body.keyVersion) log.info(`[signing] key version ${body.keyVersion} installed`);
    return { ok: true, ...signingStatus() };
  } catch {
    // Offline: keep using the key we have.
    return { ok: false, ...signingStatus() };
  }
}

/** Signs one document's hash message; the key never leaves this process. */
export function signDocument(message: string): { hash: string; keyVersion: string } {
  const key = readKey();
  const keyVersion = getConfig().signingKeyVersion;
  if (!key || !keyVersion) throw new Error("This till has no signing key");
  return { hash: createSign("RSA-SHA1").update(message, "utf8").sign(key, "base64"), keyVersion };
}
