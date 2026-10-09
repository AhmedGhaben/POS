import { defineConfig } from "@playwright/test";

// Drives the real Electron app against a running local API (see e2e/README).
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
});
