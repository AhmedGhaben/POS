import type { ShiftDto } from "@pos/shared";
import { isDesktop, useDeviceStore } from "@/features/desktop/bridge";

/**
 * A Windows till works only in its own shift. It must know which till it
 * is (its terminal, read from the desktop app) before it looks up, adopts or
 * opens a shift; otherwise the server would treat it like a browser.
 */

/** Ready to deal with shifts: a browser always; the Windows app once it has read its settings. */
export function shiftsReady(desktop: boolean, deviceLoaded: boolean): boolean {
  return !desktop || deviceLoaded;
}

/**
 * Whether to carry on with a shift the server says is open: a registered
 * till only with its own; an unregistered computer or a browser with a
 * browser shift (no till), as before.
 */
export function canAdopt(open: Pick<ShiftDto, "terminalId">, terminalId: string | null): boolean {
  return (open.terminalId ?? null) === (terminalId ?? null);
}

export class TillNotReadyError extends Error {
  constructor() {
    super("This till hasn't finished reading its settings");
    this.name = "TillNotReadyError";
  }
}

/**
 * The till's id, waiting for the desktop app's settings first. Throws
 * TillNotReadyError if they can't be read (no shift is opened then).
 */
export async function tillIdForShift(): Promise<string | null> {
  const store = useDeviceStore.getState();
  if (isDesktop && !store.loaded) {
    await store.load().catch(() => undefined);
    if (!useDeviceStore.getState().loaded) throw new TillNotReadyError();
  }
  return useDeviceStore.getState().terminal?.id ?? null;
}
