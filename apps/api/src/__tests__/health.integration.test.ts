import { afterAll, beforeAll, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '@api/app';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
});

test('GET /health returns 200 ok', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  expect(res.statusCode).toBe(200);
  // /health carries a heartbeat timestamp (app.ts) — assert the shape, not an exact value
  const body: { status: string; health: number } = res.json();
  expect(body.status).toBe('ok');
  expect(typeof body.health).toBe('number');
});
