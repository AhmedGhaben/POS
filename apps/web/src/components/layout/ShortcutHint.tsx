import { commandPaletteShortcut } from "@/lib/platform";

/** "Ctrl K" on Windows/Linux, "⌘K" on a Mac: opens the command palette. */
export function ShortcutHint() {
  return (
    <kbd className="hidden items-center whitespace-nowrap rounded-md border bg-sb-chip px-1.5 py-0.5 font-sans text-[11px] font-semibold text-foreground sm:inline-flex">
      {commandPaletteShortcut()}
    </kbd>
  );
}
