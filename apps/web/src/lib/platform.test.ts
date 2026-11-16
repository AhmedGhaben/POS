import { afterEach, describe, expect, it, vi } from "vitest";
import { commandPaletteShortcut, isCommandPaletteShortcut } from "./platform";

const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe("command palette shortcut", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is labelled Ctrl K on Windows and ⌘K only on a Mac", () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgentData: { platform: "Windows" } });
    expect(commandPaletteShortcut()).toBe("Ctrl K");
    vi.stubGlobal("navigator", { platform: "Linux x86_64" });
    expect(commandPaletteShortcut()).toBe("Ctrl K");
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    expect(commandPaletteShortcut()).toBe("⌘K");
  });

  it("the Windows app's own platform wins", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    vi.stubGlobal("window", { posDesktop: { app: { platform: "win32" } } });
    expect(commandPaletteShortcut()).toBe("Ctrl K");
  });

  it("opens with Ctrl+K on Windows/Linux and ⌘K on a Mac", () => {
    expect(isCommandPaletteShortcut(key("k", { ctrlKey: true }), false)).toBe(true);
    expect(isCommandPaletteShortcut(key("K", { ctrlKey: true }), false)).toBe(true);
    expect(isCommandPaletteShortcut(key("k", { metaKey: true }), false)).toBe(false);
    expect(isCommandPaletteShortcut(key("k", { metaKey: true }), true)).toBe(true);
    expect(isCommandPaletteShortcut(key("k", { ctrlKey: true }), true)).toBe(false);
    expect(isCommandPaletteShortcut(key("k", { ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(isCommandPaletteShortcut(key("j", { ctrlKey: true }), false)).toBe(false);
  });
});
