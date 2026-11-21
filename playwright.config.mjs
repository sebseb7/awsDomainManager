import { existsSync } from 'fs';
import { defineConfig } from '@playwright/test';

const systemChromePaths = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];
const detectedChrome = systemChromePaths.find((p) => existsSync(p));

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:1420',
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 2,
    ...(detectedChrome ? { launchOptions: { executablePath: detectedChrome } } : {}),
  },
  webServer: {
    command: 'npm --prefix desktop run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
