import { defineConfig } from '@playwright/test';

import { mediaApiEnv } from './src/e2e-env';

// E2E for the admin SPA against the real API + Postgres + floci S3.
// Prerequisites (scripts/e2e-web.sh handles them): Postgres up + migrated, and
// floci-aws up with the media bucket + a CORS rule that allows a PUT from the
// admin origin below. Both app servers are booted by Playwright.

const API_PORT = process.env.E2E_API_PORT ?? '3210';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '4310';
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  `postgresql://postgres:postgres@localhost:${process.env.POSTGRES_PORT ?? '5432'}/app`;

export default defineConfig({
  testDir: './src',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `pnpm exec tsx --tsconfig apps/api/tsconfig.app.json apps/api/src/index.ts`,
      cwd: '../..',
      port: Number(API_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        NODE_ENV: 'development',
        HOST: '127.0.0.1',
        PORT: API_PORT,
        LOG_LEVEL: 'warn',
        DATABASE_URL,
        JWT_SECRET: 'e2e-only-secret-not-for-production',
        // Required at boot since TAM-43 (min 32 chars) — the API refuses to
        // start without it. `scripts/e2e-web.sh` is a plain bash script, not an
        // nx target, so it does NOT get the root `.env` injected the way
        // `nx serve api` does; nothing else would supply this.
        AUTH_OTP_PEPPER: 'e2e-only-otp-pepper-not-for-production',
        ENABLE_REDIS: 'false',
        // Media (floci S3) + a bootstrap admin, so the CMS upload path and the
        // admin login both work against the real stack (TAM-106). Values live in
        // src/e2e-env.ts so the specs assert against the SAME media origin and
        // log in with the SAME admin the API bootstraps.
        ...mediaApiEnv,
      },
    },
    {
      command: `pnpm exec vite --config apps/admin/vite.config.mts --port ${WEB_PORT} --strictPort`,
      cwd: '../..',
      port: Number(WEB_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        VITE_API_URL: `http://localhost:${API_PORT}`,
      },
    },
  ],
});
