import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    launchOptions: process.env.CI ? {} : { executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" }
  },
  webServer: [
    { command: "tsx scripts/e2e-server.ts", port: 8787, reuseExistingServer: !process.env.CI },
    { command: "vite --host 127.0.0.1", port: 5173, reuseExistingServer: !process.env.CI }
  ]
});
