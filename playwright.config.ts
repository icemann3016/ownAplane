import { generateKeyPairSync } from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const WEATHER_PORT = 4555;
const OCR_PORT = 4556;
const RAF_PORT = 4557;
const isCI = !!process.env.CI;

// CI: dummy Apple and Facebook keys (Google's are in ci.yml) show the buttons, so the redirects
// to the providers can be tested. The Apple key is a throwaway made for this run.
if (isCI) {
  process.env.APPLE_CLIENT_ID ??= "eu.ownaplane.ci";
  process.env.APPLE_TEAM_ID ??= "CITEAM0000";
  process.env.APPLE_KEY_ID ??= "CIKEY00000";
  process.env.APPLE_PRIVATE_KEY ??= generateKeyPairSync("ec", { namedCurve: "P-256" })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  process.env.FACEBOOK_CLIENT_ID ??= "ci-facebook-app";
  process.env.FACEBOOK_CLIENT_SECRET ??= "ci-facebook-secret";
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      // CI tests the production build; locally we reuse `npm run dev` if it's already running.
      command: isCI ? `npm run build && npm run start -- -p ${PORT}` : `npm run dev -- -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      // Weather, the AI reading of scans and RAF Aviation's API come from local stand-ins
      // (tests/e2e/fixtures).
      env: {
        WEATHER_API_URL: `http://127.0.0.1:${WEATHER_PORT}/api/data`,
        OCR_API_URL: `http://127.0.0.1:${OCR_PORT}/v1/messages`,
        ANTHROPIC_API_KEY: "test-key",
        OCR_MODEL: "test-model",
        RAFAVIATION_API_URL: `http://127.0.0.1:${RAF_PORT}`,
      },
    },
    {
      command: `node tests/e2e/fixtures/weather-mock.mjs`,
      port: WEATHER_PORT,
      reuseExistingServer: !isCI,
      env: { WEATHER_MOCK_PORT: String(WEATHER_PORT) },
    },
    {
      command: `node tests/e2e/fixtures/ocr-mock.mjs`,
      port: OCR_PORT,
      reuseExistingServer: !isCI,
      env: { OCR_MOCK_PORT: String(OCR_PORT) },
    },
    {
      command: `node tests/e2e/fixtures/raf-mock.mjs`,
      port: RAF_PORT,
      reuseExistingServer: !isCI,
      env: { RAF_MOCK_PORT: String(RAF_PORT) },
    },
  ],
});
