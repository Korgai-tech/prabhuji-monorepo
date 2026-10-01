# Pattern: Secrets Management

> Stack pattern (monorepo-boilerplate). Secrets are environment variables, validated at boot.

## Use Case

Adding or consuming any secret/credential: JWT signing key, database URL, Redis URL, external service credentials.

## The Rules

1. **Secrets live in `.env`** (gitignored). `.env.example` documents every variable with a safe placeholder — update it in the same PR that introduces a new variable.
2. **Validated at boot** in `apps/api/src/shared/config/env.ts` (Zod schema — e.g. `JWT_SECRET: z.string().min(16)`, `DATABASE_URL: z.string().url()`). A missing/weak secret fails startup loudly instead of at first use.
3. **Never** hardcode secrets, log them (`createModuleLogger` payloads must not include them), or commit `.env`.
4. **Optional services are opt-in** via flags, so absent credentials don't block dev: `ENABLE_REDIS`, `ENABLE_KAFKA`, `ENABLE_SECRETS_MANAGER` (+ their URLs). Locally, the floci-aws emulator provides Secrets Manager at `localhost:4566` (`AWS_ENDPOINT_URL` + dummy `test` credentials).
5. **CI**: provide secrets via GitHub Actions secrets/env — the integration job sets a throwaway `JWT_SECRET` and a placeholder `DATABASE_URL` (testcontainers overwrites it at runtime). Never real production values in CI.

## Adding a New Secret — Checklist

1. [ ] Add to the Zod env schema (`apps/api/src/shared/config/env.ts`) with the right constraint
2. [ ] Add a placeholder line to `.env.example` (with a comment: required vs opt-in)
3. [ ] Consume it via the parsed config object — never `process.env.X` at call sites
4. [ ] If CI needs it: add to the workflow env (placeholder or Actions secret)
5. [ ] Confirm it never appears in logs or error messages

## Current Secrets (reference)

| Variable           | Purpose                          | Required |
| ------------------ | -------------------------------- | -------- |
| `JWT_SECRET`       | JWT signing (min 16 chars)       | yes      |
| `DATABASE_URL`     | Postgres connection              | yes      |
| `REDIS_URL`        | Redis (with `ENABLE_REDIS=true`) | opt-in   |
| `AWS_*`            | AWS Secrets Manager / emulator   | opt-in   |
