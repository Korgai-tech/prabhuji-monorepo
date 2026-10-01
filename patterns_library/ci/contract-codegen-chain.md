# Pattern: Contract-First Codegen Chain

> Repo-specific pattern (monorepo-boilerplate). The API's Zod schemas are the single source of truth for every client.

## Use Case

You changed anything about an API route's shape: added a route, changed a Zod schema in `routes/*.schemas.ts`, renamed a field. Three generated artifacts must be regenerated IN ORDER and committed with the change.

## The Chain

`api:openapi` emits **two** contracts. `openapi.json` is the **full** source of truth (public + admin); `openapi.public.json` is derived from it by dropping every `admin`-tagged operation and transitively pruning the schemas that drop orphaned. Each downstream client consumes the one it needs.

```text
Zod schemas (apps/api/src/core/*/routes/*.schemas.ts)
  └─> apps/api/openapi.json                 (FULL contract — public + admin, committed)
        ├─> packages/api-client/src/types.ts        (TS types for admin SPA — needs both surfaces, committed)
        └─> apps/api/openapi.public.json            (FILTERED — admin paths + admin-only schemas removed, committed)
              └─> apps/mobile/lib/api/generated/**   (Dart models, committed)
```

```bash
pnpm nx run api:openapi          # 1. re-emit BOTH openapi.json + openapi.public.json (one pass)
pnpm nx run api-client:generate  # 2. TS types from the FULL doc (openapi-typescript)
pnpm nx run mobile:generate      # 3. Dart models from the PUBLIC doc (openapi-generator; needs JDK 17)
```

**Why the split (TAM-85 / ADR §D5):** the Dart generator emits a model for _every_ schema in its input doc. Feeding it the full contract would generate ~50 admin write schemas (`CreateAudioItemBody`, `UpdateWallpaperBody`, …) into the app and **ship them inside the Android APK** — dead code that grows with every admin module. The filtered doc keeps the mobile client to the app's own surface. `mobile:generate`'s `-i` is `openapi.public.json` **forever** — pointing it back at the full doc is a regression.

**How the split is kept honest:** an admin route is selected by the filter on its `admin` **tag** (applied centrally by `registerAdminRoute`), but TAM-82's guard test selects on the `/admin/` **path prefix**. A **tag⇔path invariant** in the emit/drift step asserts the two agree in both directions — a route under `/admin/` that lost its tag (its schemas would ship in the APK) or a route tagged `admin` outside `/admin/` (filtered but unguarded) is a red gate, not a discovery.

## The Drift Gate

`pnpm check:openapi` (part of `pnpm verify` and CI) re-emits the spec in-memory and diffs it against **both** committed docs, naming whichever drifted. It also enforces the tag⇔path invariant and that the public doc is self-consistent (no dangling `$ref`s, no surviving admin surface). If you changed a schema and forgot to re-run the chain, or mis-tagged an admin route, verify fails — that's the point.

## Rules

- NEVER hand-edit generated files (`packages/api-client/src/types.ts`, `apps/mobile/lib/api/generated/**`)
- Generated diffs are committed alongside the route change, in the same PR
- Admin consumes types via `createApiClient` (`@repo/api-client`, openapi-fetch) — if a type is missing, regenerate instead of hand-rolling `fetch`
- Response envelope is always `{success, message, data}` (`sendSuccess`/`sendError`)

## Failure Modes

| Symptom                           | Cause                               | Fix                                                        |
| --------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `check:openapi` fails, names a doc | Schema changed, spec not re-emitted | Run the chain, commit both `openapi.json` + `openapi.public.json` |
| `check:openapi` fails, "tag/path disagree" | An admin route hand-rolled instead of via `registerAdminRoute` (or a public route wrongly tagged `admin`) | Fix the ROUTE — put it under `/admin/` and tag it `admin`, or neither |
| Admin type error after API change | api-client not regenerated          | `pnpm nx run api-client:generate`                          |
| An admin model appears in `apps/mobile/lib/api/generated/**` | `mobile:generate` pointed at the full doc, or an admin route untagged | Confirm `-i openapi.public.json`; check the tag⇔path invariant |
| `mobile:generate` fails to run    | No JDK 17                           | Install JDK 17 (script auto-resolves `JAVA_HOME` on macOS) |
