# Coding Standards (apps/api)

- TS strict, ESM, no `any` (use `unknown`), `import type` for type-only imports, no floating promises.
- Enforced by `pnpm nx typecheck api`, `pnpm nx lint api` (`@repo/eslint-config`: no-any, no-floating-promises, no-console, consistent-type-imports), and `pnpm check:arch-boundaries`.
- Data access via Prisma inside `repositories/` only. All input validated with Zod at routes.
- Cross-module calls via `performServiceCall("<key>", op, ctx, msg)`. Never import another module's files directly.
- Responses: `sendSuccess`/`sendError`. Errors: `AppError`/`ValidationError`.
- Never `console.log` — use `createModuleLogger`.
