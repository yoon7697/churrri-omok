import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 30000, workers: 1,
  use: { baseURL: process.env.TEST_URL || 'http://127.0.0.1:8080', headless: true, screenshot: 'only-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {} },
  webServer: process.env.TEST_URL ? undefined : { command:'python3 -m http.server 8080', port:8080, reuseExistingServer:true }
});
