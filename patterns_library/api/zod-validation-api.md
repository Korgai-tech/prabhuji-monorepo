# Pattern: Zod Request/Response Validation

> Repo-specific pattern (monorepo-boilerplate). Source of truth: `apps/api/src/core/auth/routes/auth.schemas.ts` + `auth.routes.ts` and `apps/api/src/app.ts`.

## Use Case

Adding or changing an API endpoint's input/output shape. Zod is the ONLY validation layer — schemas live in `routes/<mod>.schemas.ts`, run at the Fastify boundary via `fastify-type-provider-zod`, and are the single source of truth for the OpenAPI contract that drives client codegen. For where schemas fit in the module layout, see [module-shape](./module-shape.md); this pattern goes deeper on validation itself.

## App-Level Wiring (already done — don't repeat per module)

`buildApp()` installs the Zod compilers once; every route registered on the instance gets Zod validation (requests) AND Zod serialization (responses):

```typescript
// apps/api/src/app.ts (excerpt)
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  jsonSchemaTransformObject,
} from "fastify-type-provider-zod";

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
await app.register(swagger, {
  openapi: { info: { title: "API", version: "0.0.1" } },
  transform: jsonSchemaTransform, // Zod route schemas -> OpenAPI
  transformObject: jsonSchemaTransformObject, // .meta({id}) -> named components
});
```

## Schema File (`routes/<mod>.schemas.ts`)

Request bodies are plain `z.object`s. Response schemas get `.meta({ id })` so they become named, reusable OpenAPI components. Success responses are always wrapped in the `{success, message, data}` envelope (matching `sendSuccess`/`sendError`):

```typescript
// apps/api/src/core/<mod>/routes/<mod>.schemas.ts
import { z } from "zod";

export const RegisterBody = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
});

export const PublicUser = z
  .object({
    id: z.string(),
    email: z.string(),
  })
  .meta({ id: "PublicUser" }); // named OpenAPI component

// Envelope factory — mirrors sendSuccess's {success, message, data}
export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data,
  });
}

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "ErrorEnvelope" });
```

## Route Registration (`routes/<mod>.routes.ts`)

Switch the instance to the Zod type provider, then declare `body` and per-status `response` schemas. Declare EVERY status the handler can produce (including error envelopes) — undeclared statuses fail serialization at runtime:

```typescript
// apps/api/src/core/<mod>/routes/<mod>.routes.ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { RegisterBody, PublicUser, ErrorEnvelope, envelope } from "./<mod>.schemas.js";

export function registerModRoutes(app: FastifyInstance, service: ModService): void {
  const controller = new ModController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Controllers resolve reply.send() and return FastifyReply; the Zod-aware
  // handler type infers its return FROM the response schema, so return void
  // here instead of the resolved reply.
  r.post(
    "/register",
    {
      schema: {
        body: RegisterBody,
        response: { 201: envelope(PublicUser), 400: ErrorEnvelope, 500: ErrorEnvelope },
      },
    },
    async (req: FastifyRequest<{ Body: RegisterInput }>, reply: FastifyReply): Promise<void> => {
      await controller.register(req, reply);
    }
  );
}
```

By the time the controller runs, `req.body` is validated — no `.parse()` calls in controllers or services.

## Error Responses

Validation failures never reach your handler. The global error handler in `app.ts` maps them onto the standard envelope:

```typescript
// apps/api/src/app.ts (excerpt)
app.setErrorHandler<FastifyError>((err, req, reply) => {
  if (err instanceof AppError) {
    return sendError(reply, err.message, err.statusCode, err.errorCode);
  }
  if ((err as { validation?: unknown }).validation) {
    return sendError(reply, err.message, 400, "VALIDATION_ERROR"); // Zod rejection
  }
  log.error({ err }, "unhandled error");
  return sendError(reply, "Internal Server Error", 500, "INTERNAL_ERROR");
});
```

For business-rule validation deeper in the stack, throw `ValidationError` (`shared/errors` — an `AppError` with 400/`VALIDATION_ERROR`); the same handler formats it.

## Response Serialization Cuts Both Ways

`serializerCompiler` validates OUTPUT against the `response` schema: extra fields are stripped (so `PublicUser` can never leak `passwordHash`), and a response that doesn't match the declared schema throws — surfacing contract bugs in tests instead of in clients.

## Contract Implications

The same route schemas feed `@fastify/swagger` → `apps/api/openapi.json` → TS + Dart clients. Any schema change requires re-running the codegen chain and committing the diffs, or `pnpm check:openapi` fails CI. See [contract-codegen-chain](../ci/contract-codegen-chain.md).

## Checklist for a New/Changed Endpoint

1. [ ] Schemas in `routes/<mod>.schemas.ts` — request bodies plain, response components with `.meta({ id })`
2. [ ] Success responses wrapped via `envelope(...)`; error statuses use `ErrorEnvelope`
3. [ ] Route registered through `app.withTypeProvider<ZodTypeProvider>()` with `body` + per-status `response`
4. [ ] Handler returns `Promise<void>`; controller replies via `sendSuccess`/`sendError` only
5. [ ] Regenerate contract chain (`pnpm nx run api:openapi` → clients); commit generated diffs
6. [ ] `pnpm verify` green (includes the `check:openapi` drift gate)

## Anti-Patterns

- ❌ `Schema.parse(req.body)` in a controller/service — validation belongs to the route schema; the compilers already ran
- ❌ Registering routes on plain `app` without `withTypeProvider<ZodTypeProvider>()` — you lose inference and the schema/handler type link
- ❌ Omitting error statuses (400/401/500) from `response` — Fastify can't serialize what isn't declared
- ❌ Ad-hoc `reply.send({...})` shapes — everything goes through the `{success, message, data}` envelope
- ❌ Hand-editing `openapi.json` or generated clients to "match" a schema change — regenerate instead

## Related

- [API Feature Module Shape](./module-shape.md) — where schema files live in the module
- [Cross-Module Call](./cross-module-call.md) — consuming other modules after validation
- [Input Sanitization](../security/input-sanitization.md) — sanitization on top of type validation
- [Contract Codegen Chain](../ci/contract-codegen-chain.md) — schemas → OpenAPI → generated clients
