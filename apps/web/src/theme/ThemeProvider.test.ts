import { afterEach, describe, expect, it } from "vitest";
import { getInitialPreference, resolveTheme } from "./theme-preference";

describe("shared persisted appearance", () => {
  afterEach(() => localStorage.removeItem("pos-theme"));
  it.each(["light", "dark", "system"] as const)("restores the existing %s preference", (preference) => {
    localStorage.setItem("pos-theme", preference);
    expect(getInitialPreference()).toBe(preference);
  });
  it("defaults absent or invalid preferences to System", () => {
    localStorage.removeItem("pos-theme");
    expect(getInitialPreference()).toBe("system");
    localStorage.setItem("pos-theme", "invalid");
    expect(getInitialPreference()).toBe("system");
  });
  it("follows OS appearance only for System", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
