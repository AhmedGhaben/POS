import * as React from "react";
import { useAuthStore } from "@/features/auth/store";
import { useDeviceStore } from "@/features/desktop/bridge";
import { rotateTerminalKey } from "@/features/desktop/api";
import { useOfflineStore } from "@/features/pos/offline-store";
import { useLockStore, useTillMode } from "./lock-store";
import { resumeOfflineSession } from "./session";

/**
 * Keeps PIN sign-in working on a till: gives an older till its key when a
 * manager is signed in, refreshes the staff list, picks up a server session
 * after an offline PIN sign-in, and locks the till after it's been idle.
 */
export function useTillUpkeep() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const offline = useAuthStore((s) => s.offline);
  const role = useAuthStore((s) => s.user?.role);
  const terminal = useDeviceStore((s) => s.terminal);
  const hasKey = useDeviceStore((s) => s.hasKey);
  const loaded = useDeviceStore((s) => s.loaded);
  const server = useOfflineStore((s) => s.server);

  // Tills registered before keys existed get one from a signed-in manager.
  const keyRequested = React.useRef(false);
  React.useEffect(() => {
    if (!loaded || !terminal || hasKey || !accessToken || keyRequested.current) return;
    if (role !== "OWNER" && role !== "MANAGER") return;
    keyRequested.current = true;
    void rotateTerminalKey(terminal.id)
      .then(() => useDeviceStore.getState().refreshTill(true))
      .catch(() => {
        keyRequested.current = false;
      });
  }, [loaded, terminal, hasKey, accessToken, role]);

  // A fresh staff list whenever the server is reachable with a session.
  React.useEffect(() => {
    if (loaded && accessToken && server !== "down") void useDeviceStore.getState().refreshTill(true);
  }, [loaded, accessToken, server]);

  // Signed in offline: get the server session as soon as it answers.
  React.useEffect(() => {
    if (offline && server === "up") void resumeOfflineSession();
  }, [offline, server]);

  useAutoLock();
}

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

function useAutoLock() {
  const minutes = useDeviceStore((s) => s.autoLockMinutes);
  const tillMode = useTillMode();
  const locked = useLockStore((s) => s.locked);

  React.useEffect(() => {
    if (!tillMode || !minutes || locked) return;
    let timer = setTimeout(lock, minutes * 60_000);
    function lock() {
      useLockStore.getState().lock();
    }
    function activity() {
      clearTimeout(timer);
      timer = setTimeout(lock, minutes * 60_000);
    }
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, activity, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, activity);
    };
  }, [tillMode, minutes, locked]);
}
