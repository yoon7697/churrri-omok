import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 30000, workers: 1,
  use: { baseURL: process.env.TEST_URL || 'http://127.0.0.1:8080', headless: true, screenshot: 'only-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {} },
  webServer: process.env.TEST_URL ? undefined : [
    { command:'python3 -m http.server 8080', port:8080, reuseExistingServer:!process.env.CI },
    ...(process.env.LIVE_TEST_SERVER ? [{command:'npm run build:server && node scripts/test-server.mjs',url:'http://127.0.0.1:8787/health',reuseExistingServer:!process.env.CI,timeout:30000}] : [])
  ]
});
