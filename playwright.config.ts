import { defineConfig } from "@playwright/test";

const apiPort = Number(process.env.E2E_API_PORT ?? 8787);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5173);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "on-first-retry",
    launchOptions: process.env.CI ? {} : { executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" }
  },
  webServer: [
    { command: "tsx scripts/e2e-server.ts", port: apiPort, env: { PORT: String(apiPort) }, reuseExistingServer: !process.env.CI },
    { command: `vite --host 127.0.0.1 --port ${webPort}`, port: webPort, reuseExistingServer: !process.env.CI }
  ]
});
