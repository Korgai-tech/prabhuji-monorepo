import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Ryuk (testcontainers' reaper) is pulled from Docker Hub and has no ECR Public
// mirror; a CodeBuild host is discarded after each build, so it has nothing to reap.
if (process.env.CODEBUILD_BUILD_ID) process.env.TESTCONTAINERS_RYUK_DISABLED ??= 'true';

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ['apps/api/tsconfig.app.json', 'apps/api/tsconfig.spec.json'],
    }),
  ],
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          // TAM-85: scripts/ carries the OpenAPI admin/public filter, whose
          // regressions ship admin schemas to every phone — it gets unit tests
          // like any other source.
          include: [
            'apps/api/src/**/__tests__/**/*.test.ts',
            'apps/api/scripts/**/__tests__/**/*.test.ts',
          ],
          exclude: ['**/*.integration.test.ts'],
          // Shared baseline + DATABASE_URL (no container in unit). The
          // integration project loads vitest.setup.env.ts instead, which omits
          // DATABASE_URL so testcontainers can own it.
          setupFiles: ['apps/api/vitest.setup.unit.ts'],
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['apps/api/src/**/__tests__/**/*.integration.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          // The shared baseline WITHOUT DATABASE_URL — startTestDb() assigns the
          // real testcontainers URI at runtime and must not be pre-empted. These
          // suites boot the real app, so a missing required var throws in
          // buildApp() and every request 500s.
          setupFiles: ['apps/api/vitest.setup.env.ts'],
          passWithNoTests: true,
        },
      },
    ],
  },
});
