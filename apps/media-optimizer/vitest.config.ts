import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ['apps/media-optimizer/tsconfig.app.json', 'apps/media-optimizer/tsconfig.spec.json'],
    }),
  ],
  test: {
    include: ['apps/media-optimizer/src/**/__tests__/**/*.test.ts'],
    // The real-ffmpeg test encodes a short clip at `-preset slow`.
    testTimeout: 60_000,
  },
});
