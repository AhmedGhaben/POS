import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "./ThemeProvider";

// Execute provider callbacks/effects in Node; browser focus/paint remains a Chrome check.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0, effects: [] as (() => void | (() => void))[] }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.states[index], (value: unknown) => { hooks.states[index] = typeof value === "function" ? value(hooks.states[index]) : value; }];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
let systemDark = false;
beforeEach(() => {
  hooks.states = []; hooks.effects = []; hooks.cursor = 0;
  systemDark = false;
  localStorage.removeItem("pos-theme");
  vi.stubGlobal("document", { documentElement: { classList: { toggle: vi.fn() } } });
  vi.stubGlobal("matchMedia", () => ({ matches: systemDark, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.removeItem("pos-theme"); });
function render() {
  hooks.cursor = 0; hooks.effects = [];
  const provider = ThemeProvider({ children: null });
  const cleanups = hooks.effects.map((effect) => effect());
  cleanups.forEach((cleanup) => cleanup?.());
  return provider.props.value;
}
it.each([true, false])("toggles from effective System appearance (OS dark=%s) and persists the explicit result", (dark) => {
  systemDark = dark;
  localStorage.setItem("pos-theme", "system");
  const initial = render();
  expect(initial.theme).toBe(dark ? "dark" : "light");
  initial.toggleTheme();
  const next = render();
  expect(next.preference).toBe(dark ? "light" : "dark");
  expect(localStorage.getItem("pos-theme")).toBe(next.preference);
  hooks.states = [];
  expect(render().theme).toBe(next.theme);
});
it("toggles Light to Dark and back, persisting through the existing key", () => {
  localStorage.setItem("pos-theme", "light");
  render().toggleTheme();
  expect(render().theme).toBe("dark");
  expect(localStorage.getItem("pos-theme")).toBe("dark");
  render().toggleTheme();
  expect(render().theme).toBe("light");
  expect(localStorage.getItem("pos-theme")).toBe("light");
});
