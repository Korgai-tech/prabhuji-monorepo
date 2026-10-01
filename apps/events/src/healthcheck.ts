// Standalone HTTP health probe: exits 0 iff GET /health returns 200.
// Bundled as a second esbuild entry so the Docker image can run
// `node healthcheck.js` without curl or any extra tooling.
export {}; // top-level await needs module context (file has no imports)

const port = process.env.EVENTS_PORT ?? "3001";

try {
  const response = await fetch(`http://127.0.0.1:${port}/health`, {
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) {
    process.stderr.write(`health check failed: HTTP ${response.status}\n`);
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  process.stderr.write(`health check failed: ${err instanceof Error ? err.message : "error"}\n`);
  process.exit(1);
}
