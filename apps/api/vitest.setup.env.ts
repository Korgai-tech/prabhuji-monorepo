/**
 * Baseline environment shared by BOTH test projects (see `vitest.config.ts`).
 *
 * `EnvSchema` (`src/shared/config/env.ts`) validates as a UNIT: any test that
 * reaches `loadEnv()` — directly, or through a module composition root such as
 * `buildApp()` — fails on EVERY unsatisfied required var, not just the one it
 * came for. So a suite that has nothing to do with media still needs the media
 * vars set. Seeding the required-and-defaultless vars once, here, is what keeps
 * the next required var from breaking suites that never mention it: TAM-84
 * added MEDIA_BUCKET + MEDIA_PUBLIC_BASE_URL and broke 18 unit tests across 6
 * files AND the whole integration suite (every request 500s when boot throws).
 *
 * ONLY vars that are REQUIRED AND HAVE NO DEFAULT belong here. Never seed an
 * optional or defaulted var — `KAFKA_SASL defaults to none` and
 * `ENABLE_REDIS="false" coerces to boolean false` assert precisely the absence
 * a seed would erase.
 *
 * DATABASE_URL IS DELIBERATELY ABSENT. Integration owns it at runtime:
 * `startTestDb()` (src/shared/testing/pg.ts) assigns the testcontainers URI
 * once the container is up. Seeding a placeholder here would be live before
 * that, so any `loadEnv()` on the path to `startTestDb()` would cache a URL
 * pointing at nothing. `vitest.setup.unit.ts` adds it for unit, which has no
 * container.
 *
 * `??=`, not `=`: this is a floor, not an override. A test asserting on one of
 * these vars assigns it directly and still wins (setup runs first). A test
 * asserting a var is REQUIRED `delete`s it and still sees the throw — the floor
 * cannot weaken that.
 *
 * Values are deterministic non-secret fixtures; the hosts are RFC-2606 reserved
 * so nothing here can resolve to a real endpoint.
 */
process.env.JWT_SECRET ??= "a-sufficiently-long-secret";
process.env.AUTH_OTP_PEPPER ??= "unit-test-pepper-not-secret-32chars";
process.env.MEDIA_BUCKET ??= "unit-test-bucket";
process.env.MEDIA_PUBLIC_BASE_URL ??= "https://cdn.test.invalid";
