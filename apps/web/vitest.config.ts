import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Tests run in Node; stores that persist to localStorage need a stand-in.
    setupFiles: ["src/test/setup.ts"],
  },
});
