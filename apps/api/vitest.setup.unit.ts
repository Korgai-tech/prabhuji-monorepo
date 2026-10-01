/**
 * Unit-project environment: the shared baseline, plus DATABASE_URL.
 *
 * Unit tests never start a container, so nothing else will ever supply
 * DATABASE_URL — but EnvSchema requires it, and it validates as a unit, so a
 * test asserting on some unrelated var still fails without it. It is seeded
 * HERE rather than in `vitest.setup.env.ts` because the integration project
 * must NOT have it: `startTestDb()` assigns the real testcontainers URI at
 * runtime, and a placeholder would be live before that call. See the header of
 * `vitest.setup.env.ts`.
 *
 * Nothing in the unit suite connects to this URL — the repositories that would
 * are mocked. It exists only to satisfy `z.string().url()`.
 */
import "./vitest.setup.env.js";

process.env.DATABASE_URL ??= "postgres://u:p@localhost:5432/db";
