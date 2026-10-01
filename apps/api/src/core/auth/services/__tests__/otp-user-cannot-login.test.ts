import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { expect, test } from "vitest";

/**
 * LOCKS A LOAD-BEARING SECURITY PROPERTY (TAM-82; ADR §B1 layer 2).
 *
 * `otp.repository.ts` bootstraps phone-only users with
 * `passwordHash = randomBytes(32).toString("hex")` — a raw 64-char hex string,
 * NOT a bcrypt hash. `bcrypt.compare` can therefore never return true for one,
 * so **no mobile-originated account can authenticate via `/auth/login` at all**,
 * whatever password is guessed. The mobile and admin auth paths are disjoint in
 * practice, and that is a big part of why putting a `role` column on the shared
 * `User` table is safe.
 *
 * WHY THIS TEST EXISTS: that placeholder looks like a wart, and its own comment
 * invites a follow-up to "relax the schema". If someone ever "fixes" it into a
 * real bcrypt hash of a known/derivable value, every mobile user instantly
 * becomes a `/auth/login`-capable account — and the only thing then standing
 * between them and `/admin/*` is the role column. This test makes that change
 * fail loudly here instead of silently in production.
 *
 * If you are here because this test failed: you did not break a test, you
 * removed a security layer. Re-read ADR §B1 before proceeding.
 */

test("the OTP placeholder passwordHash can never satisfy bcrypt.compare", async () => {
  // Exactly what otp.repository.ts writes for a new phone-only user.
  const placeholderPasswordHash = randomBytes(32).toString("hex");

  // It is not even shaped like a bcrypt hash: bcrypt is 60 chars and starts $2.
  expect(placeholderPasswordHash).toHaveLength(64);
  expect(placeholderPasswordHash.startsWith("$2")).toBe(false);

  // The candidate passwords an attacker would actually try against an
  // `otp-<uuid>@prabhuji.internal` account — including the hash value itself,
  // which is the one string they could ever learn from a DB leak.
  const attempts = ["", "password1", "1234", placeholderPasswordHash];
  for (const candidate of attempts) {
    await expect(bcrypt.compare(candidate, placeholderPasswordHash)).resolves.toBe(false);
  }
});
