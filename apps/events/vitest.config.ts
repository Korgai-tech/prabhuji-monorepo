import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Ryuk (testcontainers' reaper) is pulled from Docker Hub and has no ECR Public
// mirror; a CodeBuild host is discarded after each build, so it has nothing to reap.
if (process.env.CODEBUILD_BUILD_ID) process.env.TESTCONTAINERS_RYUK_DISABLED ??= 'true';

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ['apps/events/tsconfig.app.json', 'apps/events/tsconfig.spec.json'],
    }),
  ],
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['apps/events/src/**/__tests__/**/*.test.ts'],
          exclude: ['**/*.integration.test.ts'],
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['apps/events/src/**/__tests__/**/*.integration.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          passWithNoTests: true,
        },
      },
    ],
  },
});
