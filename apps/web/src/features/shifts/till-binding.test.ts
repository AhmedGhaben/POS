import { beforeEach, describe, expect, it, vi } from "vitest";

// A Windows till whose settings (and so its terminal) are read in the background.
const { device, queued } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { create } = require("zustand") as typeof import("zustand");
  return {
    device: create<{ loaded: boolean; terminal: { id: string } | null; load: () => Promise<void> }>(() => ({
      loaded: false,
      terminal: null,
      load: async () => {},
    })),
    queued: [] as { kind: string; payload: Record<string, unknown> }[],
  };
});
vi.mock("@/features/desktop/bridge", () => ({ isDesktop: true, desktop: {}, useDeviceStore: device }));
vi.mock("@/features/desktop/device-role", () => ({ deviceRole: () => "TILL" }));
vi.mock("@/lib/offline-db", () => ({
  addToOutbox: async (e: { kind: string; payload: Record<string, unknown> }) => void queued.push(e),
  outboxCounts: async () => ({ pending: 0, syncing: 0, synced: 0, failed: 0 }),
}));
vi.mock("@/features/pos/sync", () => ({ syncOutbox: async () => ({ synced: 0, failed: 0, interrupted: false }) }));

import { useAuthStore } from "@/features/auth/store";
import { openShift } from "./api";
import { TillNotReadyError, canAdopt, shiftsReady, tillIdForShift } from "./till-binding";

describe("a till works only in its own shift", () => {
  beforeEach(() => {
    queued.length = 0;
    useAuthStore.setState({ user: { id: "u1", firstName: "Ana", lastName: "Caixa" } as never });
  });

  it("shift look-ups wait for the Windows app's settings; a browser never waits", () => {
    expect(shiftsReady(true, false)).toBe(false);
    expect(shiftsReady(true, true)).toBe(true);
    expect(shiftsReady(false, false)).toBe(true);
  });

  it("a registered till only adopts its own shift; an unregistered computer a browser shift, as before", () => {
    expect(canAdopt({ terminalId: "t1" }, "t1")).toBe(true);
    expect(canAdopt({ terminalId: null }, "t1")).toBe(false);
    expect(canAdopt({ terminalId: "t2" }, "t1")).toBe(false);
    expect(canAdopt({ terminalId: null }, null)).toBe(true);
  });

  it("opening a shift right after start waits for the till's id and sends it", async () => {
    device.setState({
      loaded: false,
      terminal: null,
      load: async () => {
        await new Promise((r) => setTimeout(r, 5));
        device.setState({ loaded: true, terminal: { id: "t1" } });
      },
    });
    await openShift("s1", 0);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: "shift-open", payload: { storeId: "s1", terminalId: "t1" } });
  });

  it("if the settings can't be read, no shift is opened", async () => {
    device.setState({ loaded: false, terminal: null, load: async () => Promise.reject(new Error("bridge down")) });
    await expect(tillIdForShift()).rejects.toBeInstanceOf(TillNotReadyError);
    await expect(openShift("s1", 0)).rejects.toBeInstanceOf(TillNotReadyError);
    expect(queued).toHaveLength(0);
  });
});
