import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only. The e2e specs drive a browser through Playwright and
    // would otherwise be collected here, where they cannot run.
    include: ["lib/**/*.test.ts"],
  },
});
