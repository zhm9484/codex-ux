import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const executablePath =
  process.env.CODEX_UX_CHROME ??
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : null);

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.browser.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5197',
    viewport: { width: 1280, height: 900 },
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm build && pnpm start',
    url: 'http://127.0.0.1:5197/api/health',
    env: { CODEX_UX_PORT: '5197', CODEX_UX_DATA_DIR: resolve('.codex-ux/browser-tests') },
    timeout: 30000,
    reuseExistingServer: false,
  },
});
