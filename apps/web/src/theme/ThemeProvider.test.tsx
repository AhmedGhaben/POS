import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { getInitialPreference, resolveTheme } from "./theme-preference";

beforeEach(() => localStorage.removeItem("pos-theme"));
it.each(["light", "dark", "system"] as const)("restores the persisted %s preference", (preference) => {
 localStorage.setItem("pos-theme", preference);
 expect(getInitialPreference()).toBe(preference);
});
it("defaults to system and resolves both OS appearances without overriding explicit choices", () => {
 expect(getInitialPreference()).toBe("system");
 expect(resolveTheme("system", true)).toBe("dark");
 expect(resolveTheme("system", false)).toBe("light");
 expect(resolveTheme("light", true)).toBe("light");
 expect(resolveTheme("dark", false)).toBe("dark");
});
it("keeps the saved preference when the application remounts", () => {
 vi.stubGlobal("matchMedia", () => ({ matches: true }));
 localStorage.setItem("pos-theme", "light");
 function ReadTheme() { const { theme, preference } = useTheme(); return <span>{preference}:{theme}</span>; }
 try {
  for (let i = 0; i < 2; i++) expect(renderToStaticMarkup(<ThemeProvider><ReadTheme /></ThemeProvider>)).toBe("<span>light:light</span>");
  expect(localStorage.getItem("pos-theme")).toBe("light");
 } finally { vi.unstubAllGlobals(); }
});
