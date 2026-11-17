import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileLockoutStore, LOCK_MS, MAX_TRIES, PinLockout, verifyPin, type LockoutState, type LockoutStore } from "./pin-check";

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

});

/** A wrong PIN as till.ts handles it: the try is counted first. */
function wrongTry(lockout: PinLockout, userId: string) {
  return lockout.begin(userId);
}

/** A folder like the till's user-data folder, with a config.json in it. */
function tillFolder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pin-lockout-"));
  const config = JSON.stringify({ serverUrl: "https://pos.example", terminal: { id: "t1", code: "POS-001" }, terminalKey: "protected" });
  fs.writeFileSync(path.join(dir, "config.json"), config);
  return { dir, file: path.join(dir, "pin-lockout.json"), config };
}

describe("offline PIN lockout", () => {
  it("locks after five wrong tries in a row, for five minutes", () => {
    let now = 1_000_000;
    const lockout = new PinLockout(() => now);
    for (let i = 0; i < MAX_TRIES - 1; i++) assert.equal(wrongTry(lockout, "u1"), true);
    assert.equal(lockout.isLocked("u1"), false);
    wrongTry(lockout, "u1");
    assert.equal(lockout.isLocked("u1"), true);
    assert.equal(lockout.isLocked("u2"), false);
    now += LOCK_MS + 1;
    assert.equal(lockout.isLocked("u1"), false);
  });

  it("a right PIN clears the count, even on the fifth try", () => {
    const lockout = new PinLockout();
    for (let i = 0; i < MAX_TRIES - 1; i++) wrongTry(lockout, "u1");
    lockout.begin("u1");
    lockout.succeeded("u1");
    assert.equal(lockout.isLocked("u1"), false);
    wrongTry(lockout, "u1");
    assert.equal(lockout.isLocked("u1"), false);
  });
});

describe("offline PIN lockout across restarts (pin-lockout.json)", () => {
  it("a lockout survives closing and reopening the app", () => {
    let now = 1_000_000;
    const { file } = tillFolder();
    const first = new PinLockout(() => now, fileLockoutStore(() => file));
    for (let i = 0; i < MAX_TRIES; i++) wrongTry(first, "u1");
    const restarted = new PinLockout(() => now, fileLockoutStore(() => file));
    assert.equal(restarted.isLocked("u1"), true);
    now += LOCK_MS + 1;
    assert.equal(restarted.isLocked("u1"), false);
  });

  it("each try is kept before the PIN is checked: a restart mid-check doesn't give it back", () => {
    const { file } = tillFolder();
    for (let run = 0; run < MAX_TRIES; run++) {
      // One try per run of the app, the app closed before the check finished.
      new PinLockout(Date.now, fileLockoutStore(() => file)).begin("u1");
    }
    assert.equal(new PinLockout(Date.now, fileLockoutStore(() => file)).isLocked("u1"), true);
  });

  it("a new till (no file yet) starts with no count", () => {
    const { file } = tillFolder();
    assert.equal(new PinLockout(Date.now, fileLockoutStore(() => file)).isLocked("u1"), false);
    assert.equal(fs.existsSync(file), false);
  });

  it("a corrupt file locks everyone for five minutes, and that lock is kept across a restart", () => {
    let now = 1_000_000;
    const { file } = tillFolder();
    fs.writeFileSync(file, "{ not json");
    const lockout = new PinLockout(() => now, fileLockoutStore(() => file));
    assert.equal(lockout.isLocked("anyone"), true);
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as LockoutState;
    assert.equal(saved.lockedAllUntil, now + LOCK_MS);
    // Restarting doesn't lift it.
    assert.equal(new PinLockout(() => now, fileLockoutStore(() => file)).isLocked("anyone"), true);
    now += LOCK_MS + 1;
    assert.equal(new PinLockout(() => now, fileLockoutStore(() => file)).isLocked("anyone"), false);
  });

  it("well-formed JSON with bad counts counts as corrupt", () => {
    const { file } = tillFolder();
    for (const bad of ['{"entries":{"u1":{"failed":-3,"lockedUntil":0}}}', '{"entries":[]}', "null", '{"entries":{"u1":{"failed":"x"}}}']) {
      fs.writeFileSync(file, bad);
      assert.equal(new PinLockout(Date.now, fileLockoutStore(() => file)).isLocked("u2"), true, bad);
    }
  });

  it("a file that can't be read or written: locked, then no PIN check at all (never fresh tries)", () => {
    let now = 1_000_000;
    const { dir } = tillFolder();
    // A folder where the file should be: reading and writing both fail.
    const file = path.join(dir, "pin-lockout.json");
    fs.mkdirSync(file);
    const lockout = new PinLockout(() => now, fileLockoutStore(() => file));
    assert.equal(lockout.isLocked("u1"), true);
    now += LOCK_MS + 1;
    assert.equal(lockout.isLocked("u1"), false);
    assert.equal(lockout.begin("u1"), false, "a try that can't be kept is refused");
    // Each restart starts locked again.
    assert.equal(new PinLockout(() => now, fileLockoutStore(() => file)).isLocked("u1"), true);
  });

  it("when saving starts failing, tries are refused instead of counted in memory only", () => {
    let failing = false;
    let saved: LockoutState | null = null;
    const store: LockoutStore = {
      load: () => saved,
      save: (s) => {
        if (failing) throw new Error("disk full");
        saved = JSON.parse(JSON.stringify(s));
      },
    };
    const lockout = new PinLockout(Date.now, store);
    assert.equal(lockout.begin("u1"), true);
    failing = true;
    assert.equal(lockout.begin("u1"), false);
    // What was kept still stands after a restart.
    assert.equal(saved!.entries.u1.failed, 1);
  });

  it("a clock turned back can't lock someone out for longer than five minutes", () => {
    const now = 1_000_000;
    const { file } = tillFolder();
    fs.writeFileSync(file, JSON.stringify({ entries: { u1: { failed: 0, lockedUntil: now + 365 * 24 * 3600_000 } } }));
    const lockout = new PinLockout(() => now, fileLockoutStore(() => file));
    assert.equal(lockout.isLocked("u1"), true);
    assert.equal(new PinLockout(() => now + LOCK_MS + 1, fileLockoutStore(() => file)).isLocked("u1"), false);
  });

  it("never touches config.json (server address, till, key) and never stores a PIN", () => {
    const { dir, file, config } = tillFolder();
    fs.writeFileSync(file, "garbage");
    const lockout = new PinLockout(Date.now, fileLockoutStore(() => file));
    lockout.isLocked("u1");
    lockout.begin("u2");
    lockout.succeeded("u2");
    assert.equal(fs.readFileSync(path.join(dir, "config.json"), "utf8"), config);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["config.json", "pin-lockout.json"]);
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as LockoutState;
    for (const e of Object.values(saved.entries)) assert.deepEqual(Object.keys(e).sort(), ["failed", "lockedUntil"]);
  });
});
