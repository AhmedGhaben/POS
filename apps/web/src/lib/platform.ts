/**
 * Is this a Mac? For keyboard hints only ("⌘K" on macOS, "Ctrl K"
 * elsewhere). The Windows app reports Node's process.platform; browsers
 * report navigator.userAgentData.platform, or the older navigator.platform.
 */
export function isMacPlatform(): boolean {
  if (typeof window === "undefined") return false;
  const desktopPlatform = (window as { posDesktop?: { platform?: string } }).posDesktop?.platform;
  if (desktopPlatform) return desktopPlatform === "darwin";
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** The command palette shortcut as it should be labelled on this computer. */
export function commandPaletteShortcut(): string {
  return isMacPlatform() ? "⌘K" : "Ctrl K";
}

/** Ctrl+K on Windows/Linux, ⌘K on macOS. */
export function isCommandPaletteShortcut(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, mac = isMacPlatform()): boolean {
  if (e.key.toLowerCase() !== "k" || e.altKey || e.shiftKey) return false;
  return mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}
