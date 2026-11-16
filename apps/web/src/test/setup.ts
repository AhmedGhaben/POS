// Vitest runs in Node: give zustand's persist middleware a window.localStorage.
const items = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => items.get(k) ?? null,
  setItem: (k: string, v: string) => void items.set(k, v),
  removeItem: (k: string) => void items.delete(k),
  clear: () => items.clear(),
  key: (i: number) => [...items.keys()][i] ?? null,
  get length() {
    return items.size;
  },
};
(globalThis as { window?: unknown }).window ??= globalThis;

// The app opens in pt-AO on a first run; unit tests read English unless they choose otherwise.
localStorage.setItem("pos-language", "en");
