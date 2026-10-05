import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const useExternalBaseURL = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const testDir = process.env.PLAYWRIGHT_TEST_DIR || './e2e';

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Against the live site, cap concurrency. The default is one worker per core,
  // which turns a gate run into a load test: sixteen simultaneous page loads,
  // each fanning out several API calls, exceeds what the deployment serves
  // cleanly and returns 500s. The pages then render error states and the gates
  // report overflow and rendering failures that do not exist. The same suite
  // passes 52/52 serially against the same deployment. Two workers was still
  // enough to produce phantom overflow failures, so a live run is serial.
  workers: process.env.CI || useExternalBaseURL ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: useExternalBaseURL
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
