import { GONE_AFTER_MS, SEEN_RECENTLY_MS, latest, storeStatus, tillStatus, type TillFacts } from "./sync-status";

const NOW = new Date("2026-11-17T14:10:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const till = (facts: Partial<TillFacts>): TillFacts => ({ lastSeenAt: null, pendingCountReported: 0, syncActive: true, hasOpenShift: false, ...facts });

describe("tillStatus", () => {
  it("never: registered but never heard from", () => {
    expect(tillStatus(till({}), NOW)).toBe("never");
    expect(tillStatus(till({ hasOpenShift: true, pendingCountReported: 4 }), NOW)).toBe("never");
  });

  it("online: heard from within 2 min with nothing to upload", () => {
    expect(tillStatus(till({ lastSeenAt: ago(10_000) }), NOW)).toBe("online");
    expect(tillStatus(till({ lastSeenAt: ago(SEEN_RECENTLY_MS), hasOpenShift: true }), NOW)).toBe("online");
  });

  it("syncing: heard from within 2 min with sales to upload", () => {
    expect(tillStatus(till({ lastSeenAt: ago(30_000), pendingCountReported: 3 }), NOW)).toBe("syncing");
  });

  describe("waiting: sales saved but nobody signed in (its sync engine isn't running)", () => {
    it("heard from within 2 min with sales to upload and sync off", () => {
      expect(tillStatus(till({ lastSeenAt: ago(30_000), pendingCountReported: 3, syncActive: false, hasOpenShift: true }), NOW)).toBe("waiting");
      expect(tillStatus(till({ lastSeenAt: ago(30_000), pendingCountReported: 3, syncActive: false }), NOW)).toBe("waiting");
    });

    it("nothing saved: online, whether anyone is signed in or not", () => {
      expect(tillStatus(till({ lastSeenAt: ago(30_000), syncActive: false, hasOpenShift: true }), NOW)).toBe("online");
    });

    it("someone signs in and sync starts: syncing", () => {
      expect(tillStatus(till({ lastSeenAt: ago(5_000), pendingCountReported: 3, syncActive: true }), NOW)).toBe("syncing");
    });

    it("kept between 2 and 3 min, like the others", () => {
      expect(tillStatus(till({ lastSeenAt: ago(2.5 * MIN), pendingCountReported: 2, syncActive: false, hasOpenShift: true }), NOW)).toBe("waiting");
    });

    it("gone quiet for over 3 min: offline or inactive as usual, by its shift", () => {
      expect(tillStatus(till({ lastSeenAt: ago(GONE_AFTER_MS + 1), pendingCountReported: 2, syncActive: false, hasOpenShift: true }), NOW)).toBe("offline");
      expect(tillStatus(till({ lastSeenAt: ago(GONE_AFTER_MS + 1), pendingCountReported: 2, syncActive: false }), NOW)).toBe("inactive");
    });
  });

  it("offline: not heard from for over 3 min with a shift open", () => {
    expect(tillStatus(till({ lastSeenAt: ago(GONE_AFTER_MS + 1), hasOpenShift: true }), NOW)).toBe("offline");
    expect(tillStatus(till({ lastSeenAt: ago(60 * MIN), hasOpenShift: true, pendingCountReported: 2 }), NOW)).toBe("offline");
  });

  it("inactive: not heard from for over 3 min and no shift open (no alarm)", () => {
    expect(tillStatus(till({ lastSeenAt: ago(GONE_AFTER_MS + 1) }), NOW)).toBe("inactive");
    expect(tillStatus(till({ lastSeenAt: ago(24 * 60 * MIN), pendingCountReported: 1 }), NOW)).toBe("inactive");
  });

  describe("between 2 and 3 min: keeps the state it had (no flicker)", () => {
    it("an online till stays online, even with its shift open", () => {
      for (const ms of [SEEN_RECENTLY_MS + 1, 2.5 * MIN, GONE_AFTER_MS]) {
        expect(tillStatus(till({ lastSeenAt: ago(ms), hasOpenShift: true }), NOW)).toBe("online");
        expect(tillStatus(till({ lastSeenAt: ago(ms) }), NOW)).toBe("online");
      }
    });

    it("a syncing till stays syncing", () => {
      expect(tillStatus(till({ lastSeenAt: ago(2.5 * MIN), pendingCountReported: 2, hasOpenShift: true }), NOW)).toBe("syncing");
    });

    it("a till coming back from offline is online at once", () => {
      // Offline at 14:10 (last heard 14:05); it reconnects: the new heartbeat sets lastSeenAt to now.
      const facts = till({ lastSeenAt: ago(5 * MIN), hasOpenShift: true });
      expect(tillStatus(facts, NOW)).toBe("offline");
      expect(tillStatus({ ...facts, lastSeenAt: NOW }, NOW)).toBe("online");
    });
  });

  it("a clock slightly ahead of the server's counts as just seen", () => {
    expect(tillStatus(till({ lastSeenAt: new Date(NOW.getTime() + 5_000) }), NOW)).toBe("online");
  });
});

describe("storeStatus", () => {
  it("is the worst of its tills: offline > waiting > syncing > online > inactive > never", () => {
    expect(storeStatus(["online", "offline", "syncing"], false)).toBe("offline");
    expect(storeStatus(["waiting", "offline"], false)).toBe("offline");
    expect(storeStatus(["syncing", "waiting", "online"], false)).toBe("waiting");
    expect(storeStatus(["online", "waiting", "inactive", "never"], false)).toBe("waiting");
    expect(storeStatus(["online", "syncing", "inactive"], false)).toBe("syncing");
    expect(storeStatus(["inactive", "online", "never"], false)).toBe("online");
    expect(storeStatus(["never", "inactive"], false)).toBe("inactive");
    expect(storeStatus(["never"], false)).toBe("never");
  });

  it("a browser shift doesn't change a store that has Windows tills", () => {
    expect(storeStatus(["inactive"], true)).toBe("inactive");
  });

  it("without a Windows till: selling in a browser, or nothing set up; never offline", () => {
    expect(storeStatus([], true)).toBe("browser");
    expect(storeStatus([], false)).toBe("noTill");
  });
});

describe("latest", () => {
  it("picks the later time, ignoring missing ones", () => {
    const a = ago(MIN);
    expect(latest(a, NOW)).toBe(NOW);
    expect(latest(NOW, a)).toBe(NOW);
    expect(latest(null, a)).toBe(a);
    expect(latest(a, undefined)).toBe(a);
    expect(latest(null, null)).toBeNull();
  });
});
