const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./test/browser",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3107",
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:3107/health",
    env: { PORT: "3107", ALLOWED_ORIGIN: "*" },
    reuseExistingServer: false,
  },
  reporter: "list",
});
