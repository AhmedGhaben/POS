import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const passListeners: ((r: unknown, before: number) => void)[] = [];
vi.mock("./sync", () => ({
  onSyncPassEnd: (l: (r: unknown, before: number) => void) => {
    passListeners.push(l);
    return () => passListeners.splice(passListeners.indexOf(l), 1);
  },
}));
vi.mock("@/features/desktop/bridge", () => ({
  desktop: { app: { info: () => Promise.resolve({ version: "0.3.0", platform: "win32", logFile: "" }) } },
  useDeviceStore: { getState: () => ({ loaded: true, load: async () => {}, terminal: { id: "t1", name: "Caixa 1", code: "POS-001", storeId: "s1" } }) },
}));

import { HEARTBEAT_EVERY_MS, heartbeatDue, passWasClean, reportAfterPass, startHeartbeat } from "./heartbeat";
import { useOfflineStore } from "./offline-store";
import { useAuthStore } from "@/features/auth/store";

const ok = { synced: 0, failed: 0, interrupted: false };

describe("heartbeat rules", () => {
  it("is up to date only when the pass ends with nothing pending and nothing failed", () => {
    expect(passWasClean(ok, 0, 0)).toBe(true);
    expect(passWasClean(ok, 2, 0)).toBe(false);
    expect(passWasClean(ok, 0, 1)).toBe(false);
    expect(passWasClean({ ...ok, interrupted: true }, 0, 0)).toBe(false);
    expect(passWasClean(null, 0, 0)).toBe(false);
  });

  it("reports right after a pass only if it uploaded something or the count changed", () => {
    expect(reportAfterPass({ ...ok, synced: 2 }, 2, 0)).toBe(true);
    expect(reportAfterPass(ok, 3, 1)).toBe(true);
    expect(reportAfterPass(ok, 0, 0)).toBe(false);
    expect(reportAfterPass(null, 1, 1)).toBe(false);
  });

  it("the regular one goes once a minute", () => {
    expect(heartbeatDue(null, 0)).toBe(true);
    expect(heartbeatDue(1000, 1000 + HEARTBEAT_EVERY_MS - 1)).toBe(false);
    expect(heartbeatDue(1000, 1000 + HEARTBEAT_EVERY_MS)).toBe(true);
  });
});

describe("startHeartbeat", () => {
  const fetchMock = vi.fn();
  let online = true;
  /** The request goes out after reading the queue size (a microtask). */
  const flush = () => vi.advanceTimersByTimeAsync(0);

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    online = true;
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", { get onLine() { return online; } });
    // The queue lives in IndexedDB; here the counts are set directly.
    useOfflineStore.setState({ internet: true, server: "up", pendingCount: 0, failedCount: 0, refreshPendingCount: async () => {} });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

  it("sends the count once a minute while online, and nothing while offline", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const stop = startHeartbeat();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/terminals/me/heartbeat");
    expect(bodies()[0]).toMatchObject({ pendingCount: 0, syncedOk: false, appVersion: "0.3.0" });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    online = false;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    stop();
  });

  it("keeps going with nobody signed in (till on the PIN screen between cashiers, shift open)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    useAuthStore.setState({ user: null, accessToken: null });
    // The sync engine isn't running then: its idea of the server may be stale.
    useOfflineStore.setState({ server: "unknown" });
    const stop = startHeartbeat();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    // It authenticates with the till key the desktop app adds, never a session.
    for (const [, init] of fetchMock.mock.calls) expect(JSON.stringify((init as RequestInit).headers)).not.toMatch(/authorization/i);
    stop();
  });

  it("reports at once on reconnect, and after a pass that uploaded sales", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    useOfflineStore.setState({ server: "down", pendingCount: 3 });
    const stop = startHeartbeat();
    useOfflineStore.setState({ server: "up" });
    await flush();
    expect(bodies()).toEqual([expect.objectContaining({ pendingCount: 3, syncedOk: false })]);

    useOfflineStore.setState({ pendingCount: 0 });
    passListeners.forEach((l) => l({ synced: 3, failed: 0, interrupted: false }, 3));
    await flush();
    expect(bodies()[1]).toMatchObject({ pendingCount: 0, syncedOk: true });

    // Nothing moved: no extra request; the minute heartbeat still says it's up to date.
    passListeners.forEach((l) => l(ok, 0));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_EVERY_MS);
    expect(bodies()[2]).toMatchObject({ pendingCount: 0, syncedOk: true });

    // A sale queued since then: no longer up to date.
    useOfflineStore.setState({ pendingCount: 1 });
    await vi.advanceTimersByTimeAsync(HEARTBEAT_EVERY_MS);
    expect(bodies()[3]).toMatchObject({ pendingCount: 1, syncedOk: false });
    stop();
  });

  it("a server that errors or never answers holds nothing up", async () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // never settles
    const stop = startHeartbeat();
    useOfflineStore.setState({ pendingCount: 1 });
    // The pass listener returns at once even though the request hangs.
    const started = Date.now();
    passListeners.forEach((l) => l({ synced: 1, failed: 0, interrupted: false }, 2));
    expect(Date.now() - started).toBeLessThan(50);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A 5 s timeout is set on it; no retries.
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);

    fetchMock.mockRejectedValue(new Error("502"));
    await vi.advanceTimersByTimeAsync(HEARTBEAT_EVERY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    stop();
  });

  it("the customer display window (same app, second screen) sends nothing", async () => {
    vi.stubGlobal("window", { ...globalThis, location: { pathname: "/customer-display" } });
    const stop = startHeartbeat();
    await vi.advanceTimersByTimeAsync(2 * HEARTBEAT_EVERY_MS);
    expect(fetchMock).not.toHaveBeenCalled();
    stop();
  });
});
