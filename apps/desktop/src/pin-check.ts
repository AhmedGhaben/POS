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

export interface LockoutEntry {
  failed: number;
  lockedUntil: number;
}

/** Where the counts are kept between runs of the app (no PINs, only counts and times). */
export interface LockoutStore {
  load(): Record<string, LockoutEntry>;
  save(entries: Record<string, LockoutEntry>): void;
}

export class PinLockout {
  private tries: Map<string, LockoutEntry> | null = null;

  /**
   * With a store, the counts survive a restart of the app: closing and
   * reopening it neither clears a lockout nor the wrong tries so far.
   */
  constructor(
    private readonly now: () => number = Date.now,
    private readonly store?: LockoutStore,
  ) {}

  private entries(): Map<string, LockoutEntry> {
    if (!this.tries) {
      this.tries = new Map();
      try {
        for (const [id, e] of Object.entries(this.store?.load() ?? {})) {
          if (Number.isFinite(e?.failed) && Number.isFinite(e?.lockedUntil)) this.tries.set(id, { failed: e.failed, lockedUntil: e.lockedUntil });
        }
      } catch {
        // Unreadable: start counting again (the server keeps its own count online).
      }
    }
    return this.tries;
  }

  private persist() {
    if (!this.store) return;
    try {
      this.store.save(Object.fromEntries(this.entries()));
    } catch {
      // Saving the count must never stop a PIN check.
    }
  }

  isLocked(userId: string): boolean {
    return (this.entries().get(userId)?.lockedUntil ?? 0) > this.now();
  }

  failed(userId: string) {
    const entry = this.entries().get(userId) ?? { failed: 0, lockedUntil: 0 };
    entry.failed++;
    if (entry.failed >= MAX_TRIES) {
      entry.failed = 0;
      entry.lockedUntil = this.now() + LOCK_MS;
    }
    this.entries().set(userId, entry);
    this.persist();
  }

  succeeded(userId: string) {
    if (this.entries().delete(userId)) this.persist();
  }
}
