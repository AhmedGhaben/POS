import { defineConfig } from "@playwright/test";

// Drives the real Electron app against a running local API (see e2e/README).
export default defineConfig({
  testDir: "e2e",
  // Logging-only diagnostic: hardcoded scratchpad path, no assertions or safe teardown.
  // Preserve it for investigation; exclude it from regression/sign-off counts.
  testIgnore: ["**/zz-probe.spec.ts"],
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
});
