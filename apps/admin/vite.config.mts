/// <reference types='vitest' />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  // Where this bundle is served from. `base` makes Vite emit every asset URL
  // under that prefix (index.html → `<base>assets/*`), so the browser routes
  // them to the admin target group instead of the API. The react-router
  // `basename` derives from it automatically via `import.meta.env.BASE_URL`
  // (src/app/router.tsx), so this is the ONE place the prefix is decided — but
  // the nginx `location` block must match, which is why the Dockerfile picks
  // between apps/admin/nginx.conf and nginx.root.conf on the same build arg.
  //
  // Default `/cms/` (TAM-120): the admin shares the ALB with the API, which owns
  // the catch-all, so it lives under a dedicated path prefix. This is what stage
  // runs and what `pnpm nx serve admin` (http://localhost:4200/cms/) and the
  // admin-e2e specs expect.
  //
  // `VITE_BASE_PATH=/` is the split-host layout (prod): the CMS gets its own
  // hostname (`admin_domain_name` in modules/stack) and is served at its root.
  // There, it is NO LONGER same-origin with the API, so that build must also set
  // VITE_API_URL — window.location.origin would point at the CMS host.
  base: process.env.VITE_BASE_PATH ?? '/cms/',
  cacheDir: '../../node_modules/.vite/apps/admin',
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [react(), tailwindcss()],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: 'admin',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
