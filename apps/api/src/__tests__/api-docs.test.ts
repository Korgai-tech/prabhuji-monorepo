import { afterEach, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '@api/app';

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

test('Swagger UI + spec are served at /docs when apiDocs is on', async () => {
  app = await buildApp({ apiDocs: true });

  // The OpenAPI spec the UI renders — built from the same route schemas as
  // openapi.json, so /health (registered in buildApp) shows up here.
  const spec = await app.inject({ method: 'GET', url: '/docs/json' });
  expect(spec.statusCode).toBe(200);
  const doc: { openapi?: string; info?: { title?: string }; paths?: Record<string, unknown> } =
    spec.json();
  expect(typeof doc.openapi).toBe('string');
  expect(doc.info?.title).toBe('API');
  expect(doc.paths?.['/health']).toBeDefined();

  // The UI entrypoint responds (200 index or 302 → static index).
  const ui = await app.inject({ method: 'GET', url: '/docs' });
  expect([200, 302]).toContain(ui.statusCode);
});

test('docs are absent by default (apiDocs off)', async () => {
  app = await buildApp();

  const spec = await app.inject({ method: 'GET', url: '/docs/json' });
  expect(spec.statusCode).toBe(404);
});
