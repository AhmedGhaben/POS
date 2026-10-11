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
