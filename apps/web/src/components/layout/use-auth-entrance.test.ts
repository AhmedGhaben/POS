import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { useAuthEntrance } from "./use-auth-entrance";

const hooks = vi.hoisted(() => ({ root: { dataset: {} as Record<string, string>, addEventListener: vi.fn(), removeEventListener: vi.fn() }, counters: { start: vi.fn(), cancel: vi.fn() }, effect: undefined as undefined | (() => void | (() => void)) }));
vi.mock("./sample-counters", () => ({ prepareSampleCounters: vi.fn(() => hooks.counters) }));
vi.mock("react", () => ({
  useRef: () => ({ current: hooks.root }),
  useEffect: (effect: typeof hooks.effect) => { hooks.effect = effect; },
}));

let frames: Map<number, FrameRequestCallback>;
let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
let cleanup: void | (() => void);
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("document", { readyState: "complete", fonts: { ready: Promise.resolve() } });
  vi.stubGlobal("addEventListener", vi.fn());
  vi.stubGlobal("removeEventListener", vi.fn());
  hooks.root.dataset = {};
  frames = new Map();
  let id = 0;
  media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frames.set(++id, callback); return id; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((frame: number) => frames.delete(frame)));
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });
function EntranceHarness() { useAuthEntrance(); cleanup = hooks.effect?.(); return null; }
function paint() {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(0));
}

it("starts once after load/fonts, a bounded pause and a painted frame on each mount", async () => {
  EntranceHarness();
  expect(hooks.root.dataset.authEntrance).toBe("pending");
  await vi.advanceTimersByTimeAsync(200);
  paint();
  expect(hooks.root.dataset.authEntrance).toBe("pending");
  paint();
  expect(hooks.root.dataset.authEntrance).toBe("running");
  expect(frames.size).toBe(0);
  cleanup?.();
  EntranceHarness();
  expect(hooks.root.dataset.authEntrance).toBe("pending");
  await vi.advanceTimersByTimeAsync(200);
  paint(); paint();
  expect(hooks.root.dataset.authEntrance).toBe("running");
});
it("leaves the final static design for reduced motion or hidden mobile decoration", () => {
  media.matches = false;
  EntranceHarness();
  expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 761px) and (prefers-reduced-motion: no-preference)");
  expect(hooks.root.dataset.authEntrance).toBeUndefined();
  expect(frames.size).toBe(0);
  expect(media.addEventListener).not.toHaveBeenCalled();
});
it("cancels pending work and restores static state when the media preference changes", () => {
  EntranceHarness();
  media.matches = false;
  media.addEventListener.mock.calls[0][1]();
  expect(frames.size).toBe(0);
  expect(hooks.root.dataset.authEntrance).toBeUndefined();
});
it("cancels either pending frame and removes the listener on unmount", async () => {
  EntranceHarness(); await vi.advanceTimersByTimeAsync(200); paint(); cleanup?.();
  expect(frames.size).toBe(0);
  expect(hooks.root.dataset.authEntrance).toBeUndefined();
  expect(media.removeEventListener).toHaveBeenCalledWith("change", media.addEventListener.mock.calls[0][1]);
});
it("keeps CSS animation desktop-only and uses a matching normalized chart path", () => {
  const css = readFileSync(new URL("../../styles/storbit-login.css", import.meta.url), "utf8");
  const layout = readFileSync(new URL("./LoginLayout.tsx", import.meta.url), "utf8");
  expect(css).toContain("@media(min-width:761px) and (prefers-reduced-motion:no-preference)");
  expect(css).toContain("animation:storbit-chart 700ms 450ms ease-out both");
  expect(css).toContain("stroke-dashoffset:1000");
  expect(layout).toContain('pathLength="1000"');
  expect(css).toContain("animation:none!important;transition:none!important");
  expect(css).not.toContain("infinite");
});

it("waits for the actual window load event before starting the entrance", async () => {
  Object.assign(document, { readyState: "loading" });
  EntranceHarness();
  await vi.advanceTimersByTimeAsync(1000);
  expect(frames.size).toBe(0);
  const load = vi.mocked(window.addEventListener).mock.calls.find(([event]) => event === "load")!;
  (load[1] as () => void)();
  await vi.advanceTimersByTimeAsync(200);
  paint(); paint();
  expect(hooks.root.dataset.authEntrance).toBe("running");
});
it("waits for fonts and cannot restart after cleanup while they are loading", async () => {
  let resolveFonts!: () => void;
  Object.assign(document, { fonts: { ready: new Promise<void>(resolve => { resolveFonts = resolve; }) } });
  EntranceHarness();
  await vi.advanceTimersByTimeAsync(1000);
  expect(frames.size).toBe(0);
  cleanup?.();
  resolveFonts();
  await vi.advanceTimersByTimeAsync(1000);
  expect(frames.size).toBe(0);
  expect(hooks.root.dataset.authEntrance).toBeUndefined();
});
it("cancels the bounded start delay immediately when motion is reduced", async () => {
  EntranceHarness();
  await vi.advanceTimersByTimeAsync(100);
  media.matches = false;
  media.addEventListener.mock.calls[0][1]();
  await vi.advanceTimersByTimeAsync(1000);
  expect(frames.size).toBe(0);
  expect(hooks.root.dataset.authEntrance).toBeUndefined();
});

it("starts the shared counters on the actual chart animationstart event only", () => {
  class ChartElement { matches(selector: string) { return selector === ".chart-line"; } }
  vi.stubGlobal("Element", ChartElement);
  EntranceHarness();
  const listener = hooks.root.addEventListener.mock.calls.find(([name]) => name === "animationstart")![1];
  listener({ animationName: "storbit-enter", target: new ChartElement() });
  expect(hooks.counters.start).not.toHaveBeenCalled();
  listener({ animationName: "storbit-chart", target: new ChartElement() });
  expect(hooks.counters.start).toHaveBeenCalledTimes(1);
  cleanup?.();
  expect(hooks.counters.cancel).toHaveBeenCalled();
  expect(hooks.root.removeEventListener).toHaveBeenCalledWith("animationstart", listener);
});
it("does not arm counters when reduced motion or mobile disables the entrance", () => {
  media.matches = false;
  EntranceHarness();
  expect(hooks.root.addEventListener).not.toHaveBeenCalled();
  expect(hooks.counters.start).not.toHaveBeenCalled();
  expect(hooks.root.dataset.authEntrance).toBeUndefined();
});
