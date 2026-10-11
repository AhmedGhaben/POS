import { pbkdf2, timingSafeEqual } from "node:crypto";
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

export class PinLockout {
  private readonly tries = new Map<string, { failed: number; lockedUntil: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  isLocked(userId: string): boolean {
    return (this.tries.get(userId)?.lockedUntil ?? 0) > this.now();
  }

  failed(userId: string) {
    const entry = this.tries.get(userId) ?? { failed: 0, lockedUntil: 0 };
    entry.failed++;
    if (entry.failed >= MAX_TRIES) {
      entry.failed = 0;
      entry.lockedUntil = this.now() + LOCK_MS;
    }
    this.tries.set(userId, entry);
  }

  succeeded(userId: string) {
    this.tries.delete(userId);
  }
}
