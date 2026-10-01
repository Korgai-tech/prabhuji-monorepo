-- TAM-N: the house creator account.
--
-- WHY THIS IS A MIGRATION AND NOT A SEED
-- Seeds are disabled in every deployed environment (apps/api/src/index.ts, the
-- "DISABLED (TAM-131)" block) and the runtime image ships `--prod` with no
-- `tsx`, so a `.ts` seed CLI cannot execute in a deployed task at all. The
-- CodeBuild pipeline runs exactly one database step: `prisma migrate deploy`.
-- A data-migration is therefore the ONLY mechanism that puts this row in stage
-- and prod. Precedent: 20260811120000_backfill_home_feed_cta_content_id.
--
-- WHY A PINNED UUID
-- `reports.reported_user_id` must reference a real account. Pinning the uuid
-- here (rather than generating one, or threading a STATUS_CREATOR_USER_ID env
-- var through EnvSchema + Terraform + a tfvars file + an apply per environment)
-- means stage and prod carry the SAME id, so fixtures, CMS copy and support
-- queries match across environments. The same literal lives in
-- `src/core/status/status.creator.ts` and a unit test asserts the two agree —
-- if they ever drift, the first report filed fails on a dangling reference.
--
-- ROW SHAPE
-- `login_type = 'email'` is the only legal shape for a non-phone account under
-- the `user_login_type_shape` CHECK: email and "passwordHash" NOT NULL, phone
-- columns NULL. The password hash below is deliberately NOT a bcrypt hash of
-- anything — it does not parse as one, so `bcrypt.compare` can never return
-- true for it and this account cannot be logged into. There is no phone number,
-- so the OTP path cannot reach it either.
--
-- `is_test_user` stays false: this is a production identity that real users see
-- attributed on every status, not a QA account.
--
-- IDEMPOTENT: re-running is a no-op, and a `prisma migrate deploy` on a
-- database that already has the row does nothing.

INSERT INTO "User" (
  id,
  email,
  name,
  "passwordHash",
  login_type,
  role,
  is_test_user,
  "createdAt",
  "updatedAt"
)
VALUES (
  '019f8c40-0000-7000-8000-000000000001'::uuid,
  'creator@prabhuji.app',
  'Amit',
  '!disabled-no-login-tam-n-house-creator!',
  'email',
  'user',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
