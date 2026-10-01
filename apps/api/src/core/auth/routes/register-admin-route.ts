import type {
  ContextConfigDefault,
  FastifyBaseLogger,
  FastifyInstance,
  FastifySchema,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
  RouteOptions,
} from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { adminMiddleware, authMiddleware } from "@api/core/auth/middleware";

/**
 * The OpenAPI tag every admin operation carries. Load-bearing, not cosmetic:
 * TAM-85 produces `openapi.public.json` (the input to the mobile Dart codegen)
 * by dropping every operation with this tag, so a mistagged admin route would
 * ship admin write-schemas into the APK.
 */
export const ADMIN_TAG = "admin";

/**
 * Route definition accepted by `registerAdminRoute` — the normal Fastify route
 * options with `preHandler` and `onRequest` REMOVED from the type.
 *
 * That omission is the point: a caller cannot pass its own `preHandler` and so
 * cannot accidentally replace the guard pair with something weaker. `schema` is
 * generic so Zod body/query/params inference flows through to the handler
 * exactly as it does on a plain `r.route(...)`.
 */
export type AdminRouteDefinition<Schema extends FastifySchema> = Omit<
  RouteOptions<
    RawServerDefault,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    RouteGenericInterface,
    ContextConfigDefault,
    Schema,
    ZodTypeProvider,
    FastifyBaseLogger
  >,
  "preHandler" | "onRequest"
>;

/**
 * Register an `/admin/*` route. **The ONLY sanctioned way to add one.**
 * A hand-rolled `r.post("/admin/…")` is a review-blocker.
 *
 * It centrally applies, with no opt-out:
 *   - `onRequest: [authMiddleware, adminMiddleware]` — authenticate, then
 *     authorize against the DB-resolved role, fail-closed;
 *   - `schema.tags: ["admin"]` — after the caller's schema is spread, so a
 *     caller cannot override it.
 *
 * WHY `onRequest` AND NOT `preHandler` (TAM-84): Fastify runs body/query Zod
 * validation BETWEEN `onRequest` and `preHandler`. A guard at `preHandler` would
 * therefore let an UNAUTHENTICATED request with a malformed body get a 400
 * (validation) instead of a 401 (guard) — which the behavioural guard test
 * asserts against, and which is a real weakening: an untrusted body should never
 * be parsed/validated before the caller is proven to be an admin. `onRequest`
 * runs before parsing, so every `/admin/*` route denies with 401/403 regardless
 * of its body. The guards read only headers + `req.user`, never the body, so
 * running them this early is sound.
 *
 * WHY THIS LIVES IN `core/auth/routes/` (the spec's one open question):
 * it needs `authMiddleware` + `adminMiddleware` at RUNTIME. `shared/` is
 * forbidden from importing `@api/core/` (`arch-boundaries.json`), and the
 * `allowTypeOnly` escape hatch is type-only by design — a route helper that
 * has to *call* the middleware cannot use it. Putting it here needs **no rule
 * relaxation** (ADR §C5 is explicit that any relaxation is wrong), and module
 * `routes/` importing `@api/core/auth/…` is not a new precedent: 12 modules
 * already import `authMiddleware` from exactly here. The arch gate places no
 * constraint on `routes/`, so this is consistent with the layering as written
 * rather than an exception carved for it.
 *
 * Mount it on the module's `/admin`-prefixed scope; `url` is the path within:
 *
 *     void app.register(
 *       (scoped) => {
 *         registerAdminRoute(scoped, {
 *           method: "GET",
 *           url: "/aarti/items",
 *           schema: { querystring: ListQuery, response: { 200: … } },
 *           handler: (req, reply) => controller.list(req, reply),
 *         });
 *       },
 *       { prefix: "/admin" }
 *     );
 */
export function registerAdminRoute<Schema extends FastifySchema>(
  app: FastifyInstance,
  definition: AdminRouteDefinition<Schema>
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  // Caller's schema FIRST, tag SECOND — the tag is not a suggestion.
  //
  // `Object.assign` rather than an object spread, and that is not stylistic: a
  // spread of a generic `Schema` produces an anonymous object type that TS
  // cannot prove is still a `Schema` (it could have been instantiated with a
  // narrower subtype), which forces a cast. `Object.assign` yields
  // `Schema & { tags: string[] }`, an intersection that IS assignable to
  // `Schema` — so the tag is applied with NO type assertion anywhere in this
  // helper, and the caller's Zod inference survives intact.
  const schema: Schema = Object.assign({}, definition.schema, { tags: [ADMIN_TAG] });
  r.route({
    ...definition,
    schema,
    // Order matters: authMiddleware populates `req.user`, adminMiddleware reads
    // it. Not overridable — both `onRequest` and `preHandler` are Omit-ed from
    // the definition type. `onRequest` (not `preHandler`) so the guard runs
    // BEFORE Zod validation — an unauthenticated request is denied before its
    // body is ever parsed (see the WHY note above).
    onRequest: [authMiddleware, adminMiddleware],
  });
}
