---
name: api-patterns
description: API route implementation patterns with Zod validation and error handling in the Fastify modular monolith. Use when creating API routes, implementing endpoints, or adding server-side validation.
user-invocable: false
allowed-tools: Read, Grep, Glob
---

# API Patterns Skill

## Purpose

Route to existing API patterns and provide checklists for safe, validated endpoint implementation in the Fastify 5 modular monolith (`apps/api`). All modules MUST follow the layered architecture: Route → Controller → Service → Repository → DB.

## When This Skill Applies

Invoke this skill when:

- Creating new API routes or modules
- Implementing CRUD endpoints
- Adding request/response validation
- Handling webhooks
- Implementing error handling patterns
- Calling another module (cross-module facade)

## Authoritative References (MUST READ)

| Pattern           | Location                                     | Purpose                      |
| ----------------- | -------------------------------------------- | ---------------------------- |
| Module Shape      | `patterns_library/api/module-shape.md`       | New module layout + wiring   |
| Cross-Module Call | `patterns_library/api/cross-module-call.md`  | `performServiceCall` facades |
| Zod Validation    | `patterns_library/api/zod-validation-api.md` | Request/response validation  |

## Stop-the-Line Conditions

### FORBIDDEN Patterns

```typescript
// FORBIDDEN: Prisma outside repositories/ (fails pnpm check:arch-boundaries)
const users = await prisma.user.findMany(); // in a route/controller/service

// FORBIDDEN: Importing another module's internals
import { UserService } from "@api/core/users/services";
// Must use: performServiceCall("<key>", op, ctx, failureMessage)

// FORBIDDEN: Missing authentication on protected routes
r.get("/users", {}, handler); // No authMiddleware preHandler!

// FORBIDDEN: Unvalidated user input (no Zod schema on the route)
const { userId } = req.body as { userId: string };

// FORBIDDEN: Ad-hoc responses / generic errors
return reply.status(500).send("Error");
// Must use sendSuccess/sendError ({success, message, data}) and AppError/ValidationError

// FORBIDDEN: console.log — use createModuleLogger("mod:sublayer")
```

### CORRECT Patterns

```typescript
// CORRECT: Zod schemas in routes/<mod>.schemas.ts drive validation AND OpenAPI
export const RegisterBody = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
});

// CORRECT: Route registers schema + auth preHandler, delegates to controller
r.post(
  "/register",
  {
    schema: {
      body: RegisterBody,
      response: {
        201: envelope(PublicUser),
        400: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
  },
  async (req, reply): Promise<void> => {
    await controller.register(req, reply);
  },
);

// CORRECT: Controller uses sendSuccess; errors are thrown, not hand-rolled
register = async (req, reply) => {
  const user = await this.service.register(req.body);
  return sendSuccess(reply, user, "Registered", 201);
};

// CORRECT: Service throws typed errors; global handler maps them to the envelope
if (existing) throw new ValidationError("Email already registered");
if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
```

## API Route Checklist

Before ANY endpoint:

- [ ] Zod `body`/`params`/`querystring` + `response` schemas in `routes/<mod>.schemas.ts`
- [ ] `authMiddleware` preHandler on protected routes; 401 via error envelope
- [ ] Controller thin: parse nothing, call service, `sendSuccess`
- [ ] Service holds business logic; throws `AppError`/`ValidationError`
- [ ] Prisma access ONLY in the module's `repositories/`
- [ ] Cross-module needs via `performServiceCall` facade (never direct imports)
- [ ] `createModuleLogger("mod:sublayer")` for logging
- [ ] Codegen chain run and committed: `pnpm nx run api:openapi` → `pnpm nx run api-client:generate` → `pnpm nx run mobile:generate`
- [ ] `pnpm verify` passes (arch boundaries + OpenAPI drift + typecheck + lint + unit tests)

## Standard Response Patterns

### Success Response

```typescript
return sendSuccess(reply, data, "Human-readable message", 200); // {success: true, message, data}
```

### Error Response

```typescript
// Throw — the global error handler emits the envelope:
throw new AppError("Human-readable error message", 404, "NOT_FOUND");
throw new ValidationError("Email already registered");
// Wire format: {success: false, message, data: null, errorCode?}
```

### Status Codes

| Code | When to Use                                  |
| ---- | -------------------------------------------- |
| 200  | Success                                      |
| 201  | Created (POST)                               |
| 400  | Bad request / validation error               |
| 401  | Not authenticated                            |
| 403  | Forbidden (authenticated but not authorized) |
| 404  | Resource not found                           |
| 500  | Server error                                 |

## Module Template

New endpoints live inside a module: `apps/api/src/core/<mod>/{routes,controllers,services,repositories,api,middleware,types.ts,index.ts}`.

```typescript
// routes/<mod>.schemas.ts — Zod schemas (drive OpenAPI via .meta({ id }))
export const CreateBody = z.object({ name: z.string().min(1) });
export const Resource = z
  .object({ id: z.string(), name: z.string() })
  .meta({ id: "Resource" });

// routes/<mod>.routes.ts — register routes with ZodTypeProvider
export function registerModRoutes(
  app: FastifyInstance,
  service: ModService,
): void {
  const controller = new ModController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.post(
    "/mod",
    {
      schema: {
        body: CreateBody,
        response: { 201: envelope(Resource), 400: ErrorEnvelope },
      },
      preHandler: authMiddleware,
    },
    async (req, reply): Promise<void> => {
      await controller.create(req, reply);
    },
  );
}

// controllers/<mod>.controller.ts — thin delegation
create = async (
  req: FastifyRequest<{ Body: CreateInput }>,
  reply: FastifyReply,
) => {
  const resource = await this.service.create(req.body);
  return sendSuccess(reply, resource, "Created", 201);
};

// services/<mod>.service.ts — business logic, typed errors
// repositories/<mod>.repository.ts — the ONLY place importing @prisma/client
// api/ — I<Mod>Api facade registered via registerGlobalService (GlobalServiceMap)
// index.ts — composition root: init<Mod>Module(app), wired from src/bootstrap.ts
```

## API Documentation Template

For documenting new endpoints (OpenAPI is generated from the Zod schemas — keep this in sync by running the codegen chain):

```markdown
## Endpoint: POST /mod

### Description

Creates a new resource for the authenticated user.

### Authentication

Required: Bearer JWT (authMiddleware)

### Request Body

| Field | Type   | Required | Description   |
| ----- | ------ | -------- | ------------- |
| name  | string | Yes      | Resource name |

### Response

**Success (201)**:
\`\`\`json
{ "success": true, "message": "Created", "data": { "id": "...", "name": "..." } }
\`\`\`

**Error (400)**:
\`\`\`json
{ "success": false, "message": "Validation failed", "data": null, "errorCode": "VALIDATION_ERROR" }
\`\`\`
```

## Related Skills

- **security-audit**: API security validation (auth coverage, arch boundaries)
- **testing-patterns**: API endpoint testing (unit + testcontainers integration)
- **migration-patterns**: Prisma schema changes backing new endpoints
