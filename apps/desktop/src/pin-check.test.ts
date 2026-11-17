import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { LOCK_MS, MAX_TRIES, PinLockout, verifyPin } from "./pin-check";

/** As the API stores it (fewer rounds, to keep the test quick). */
function stored(pin: string, rounds = 1000) {
  const salt = randomBytes(16).toString("hex");
  return `pbkdf2-sha256$${rounds}$${salt}$${pbkdf2Sync(pin, salt, rounds, 32, "sha256").toString("hex")}`;
}

describe("offline PIN check", () => {
  it("accepts the right PIN and refuses others", async () => {
    const value = stored("4821");
    assert.equal(await verifyPin("4821", value), true);
    assert.equal(await verifyPin("4820", value), false);
    assert.equal(await verifyPin("48211", value), false);
  });

  it("refuses malformed PINs and stored values", async () => {
    assert.equal(await verifyPin("12ab", stored("1234")), false);
    assert.equal(await verifyPin("1234", "plain$1234"), false);
    assert.equal(await verifyPin("1234", ""), false);
  });

  it("locks after five wrong tries, for five minutes", () => {
    let now = 1_000_000;
    const lockout = new PinLockout(() => now);
    for (let i = 0; i < MAX_TRIES - 1; i++) lockout.failed("u1");
    assert.equal(lockout.isLocked("u1"), false);
    lockout.failed("u1");
    assert.equal(lockout.isLocked("u1"), true);
    assert.equal(lockout.isLocked("u2"), false);
    now += LOCK_MS + 1;
    assert.equal(lockout.isLocked("u1"), false);
  });

  it("a right PIN clears the count", () => {
    const lockout = new PinLockout();
    for (let i = 0; i < MAX_TRIES - 1; i++) lockout.failed("u1");
    lockout.succeeded("u1");
    lockout.failed("u1");
    assert.equal(lockout.isLocked("u1"), false);
  });
});

describe("offline PIN lockout across restarts", () => {
  /** What config.json would hold between two runs of the app. */
  function memoryStore() {
    let saved: Record<string, { failed: number; lockedUntil: number }> = {};
    return {
      load: () => JSON.parse(JSON.stringify(saved)),
      save: (e: Record<string, { failed: number; lockedUntil: number }>) => {
        saved = JSON.parse(JSON.stringify(e));
      },
      get saved() {
        return saved;
      },
    };
  }

  it("a lockout survives closing and reopening the app", () => {
    let now = 1_000_000;
    const store = memoryStore();
    const first = new PinLockout(() => now, store);
    for (let i = 0; i < MAX_TRIES; i++) first.failed("u1");
    assert.equal(first.isLocked("u1"), true);
    const restarted = new PinLockout(() => now, store);
    assert.equal(restarted.isLocked("u1"), true);
    now += LOCK_MS + 1;
    assert.equal(restarted.isLocked("u1"), false);
  });

  it("wrong tries so far survive a restart (no fresh five tries per restart)", () => {
    const store = memoryStore();
    const first = new PinLockout(Date.now, store);
    for (let i = 0; i < MAX_TRIES - 1; i++) first.failed("u1");
    const restarted = new PinLockout(Date.now, store);
    assert.equal(restarted.isLocked("u1"), false);
    restarted.failed("u1");
    assert.equal(restarted.isLocked("u1"), true);
  });

  it("stores only counts and times, never a PIN; a right PIN clears it", () => {
    const store = memoryStore();
    const lockout = new PinLockout(Date.now, store);
    lockout.failed("u1");
    assert.deepEqual(Object.keys(store.saved.u1).sort(), ["failed", "lockedUntil"]);
    lockout.succeeded("u1");
    assert.deepEqual(store.saved, {});
  });

  it("an unreadable or failing store never stops the check", () => {
    const lockout = new PinLockout(Date.now, {
      load: () => {
        throw new Error("corrupt");
      },
      save: () => {
        throw new Error("disk full");
      },
    });
    for (let i = 0; i < MAX_TRIES; i++) lockout.failed("u1");
    assert.equal(lockout.isLocked("u1"), true);
  });
});
