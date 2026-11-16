import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareSampleCounters } from "./sample-counters";

let sales: { textContent: string };
let transactions: { textContent: string };
let frames: Map<number, FrameRequestCallback>;
let root: HTMLElement;
beforeEach(() => {
  sales = { textContent: "Kz 2.48M" };
  transactions = { textContent: "126" };
  root = { querySelector: (selector: string) => selector === "[data-sample-sales]" ? sales : transactions } as unknown as HTMLElement;
  frames = new Map();
  let id = 0;
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frames.set(++id, callback); return id; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((frame: number) => frames.delete(frame)));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function paint(time: number) {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach(callback => callback(time));
}
it("prepares zero values but does not count before the chart starts", () => {
  prepareSampleCounters(root);
  expect(sales.textContent).toBe("Kz 0.00M");
  expect(transactions.textContent).toBe("0");
  expect(frames.size).toBe(0);
});
it("uses one frame loop for both values, easing out to exact final values at 800ms", () => {
  const counters = prepareSampleCounters(root);
  counters.start();
  expect(frames.size).toBe(1);
  paint(400);
  expect(sales.textContent).toBe("Kz 2.17M");
  expect(transactions.textContent).toBe("110");
  expect(frames.size).toBe(1);
  paint(800);
  expect(sales.textContent).toBe("Kz 2.48M");
  expect(transactions.textContent).toBe("126");
  expect(frames.size).toBe(0);
  counters.start();
  expect(frames.size).toBe(0);
});
it("clamps a late frame to exact final values without another frame", () => {
  prepareSampleCounters(root).start();
  paint(2000);
  expect(sales.textContent).toBe("Kz 2.48M");
  expect(transactions.textContent).toBe("126");
  expect(frames.size).toBe(0);
});
it("cancels on unmount or reduced motion and immediately restores final values", () => {
  const counters = prepareSampleCounters(root);
  counters.start(); paint(200);
  const pending = [...frames.values()][0];
  counters.cancel();
  expect(frames.size).toBe(0);
  pending(300);
  counters.start();
  expect(frames.size).toBe(0);
  expect(sales.textContent).toBe("Kz 2.48M");
  expect(transactions.textContent).toBe("126");
});
it("does not schedule anything for the signup illustration or missing counters", () => {
  root = { querySelector: () => null } as unknown as HTMLElement;
  const counters = prepareSampleCounters(root);
  counters.start(); counters.cancel();
  expect(frames.size).toBe(0);
});
