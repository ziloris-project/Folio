import { defineConfig } from "@playwright/test";

/**
 * End-to-end config. These tests exist because the unit suite cannot see the
 * failure mode that matters most here: PDFium is a wasm module, and a call it
 * dislikes traps the whole instance rather than returning an error. That is
 * invisible to vitest and fatal in a browser, so the editing paths have to be
 * exercised against a real page.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
