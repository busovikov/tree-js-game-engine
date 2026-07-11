import { defineConfig, devices } from '@playwright/test'

const editorUrl = process.env.HAKU_EDITOR_URL ?? 'http://localhost:5174'

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: editorUrl,
    trace: 'on-first-retry',
  },
  webServer: process.env.HAKU_SKIP_WEB_SERVER
    ? undefined
    : {
        command: 'pnpm --filter @haku/editor-app dev',
        cwd: '../../..',
        url: editorUrl,
        reuseExistingServer: !process.env.CI && !process.env.HAKU_TARGET_PATH,
        timeout: 120_000,
        env: {
          ...process.env,
          HAKU_TARGET_PATH:
            process.env.HAKU_TARGET_PATH ?? '/Users/pavel/work/tmp-js-game-project',
        },
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
