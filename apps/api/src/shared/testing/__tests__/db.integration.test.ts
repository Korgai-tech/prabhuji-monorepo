import { afterAll, beforeAll, expect, test } from 'vitest';
import { Client } from 'pg';
import { startTestDb, stopTestDb } from '../pg.js';

let url: string;
beforeAll(async () => {
  url = await startTestDb();
}, 120_000);
afterAll(async () => {
  await stopTestDb();
});

test('the container database accepts a trivial query', async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  const res = await client.query<{ one: number }>('SELECT 1 as one');
  await client.end();
  expect(res.rows[0]?.one).toBe(1);
});
