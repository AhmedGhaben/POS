import { pbkdf2, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const pbkdf2Async = promisify(pbkdf2);

/** Slow on purpose: tills keep a copy of this to check PINs offline. */
export const PIN_ROUNDS = 210_000;
const KEY_LENGTH = 32;

/** 4 to 6 digits. */
export const PIN_PATTERN = /^\d{4,6}$/;

/**
 * Stored as "pbkdf2-sha256$<rounds>$<salt hex>$<hash hex>". The Windows app
 * checks PINs offline with the same format (apps/desktop/src/staff.ts).
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await pbkdf2Async(pin, salt, PIN_ROUNDS, KEY_LENGTH, "sha256");
  return `pbkdf2-sha256$${PIN_ROUNDS}$${salt}$${hash.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, rounds, salt, hashHex] = stored.split("$");
  const iterations = Number(rounds);
  if (scheme !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 1 || !salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await pbkdf2Async(pin, salt, iterations, expected.length, "sha256");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
