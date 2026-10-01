import { afterAll, beforeAll, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '@api/app';
import { AppError } from '@api/shared/errors';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
  app.get('/boom', () => {
    throw new AppError('nope', 418, 'TEAPOT');
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

test('AppError is mapped to its status and the error envelope', async () => {
  const res = await app.inject({ method: 'GET', url: '/boom' });
  expect(res.statusCode).toBe(418);
  expect(res.json()).toMatchObject({
    success: false,
    message: 'nope',
    data: null,
    errorCode: 'TEAPOT',
  });
  expect(res.headers['x-correlation-id']).toBeTruthy();
});
