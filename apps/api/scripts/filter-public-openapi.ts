/**
 * TAM-85 — the admin/public OpenAPI split (authority: `docs/ADMIN-CMS-ARCHITECTURE.md` §D5).
 *
 * `apps/api/openapi.json` is the FULL contract (public + admin) and stays the
 * source of truth for `packages/api-client` — the admin SPA legitimately needs
 * both `/auth/login` and `/admin/*`. `apps/api/openapi.public.json` is derived
 * from it by `filterPublicOpenapi` and feeds the Dart codegen ONLY, because the
 * generator emits **a model per schema in the document**: without this filter,
 * every admin write schema ships inside the Android APK.
 *
 * This module is PURE — no fs, no app boot, no I/O. That is the whole reason the
 * filter beat a composition-root refactor (ADR §D5): it is testable without
 * booting Fastify, and `openapi-doc.ts` never becomes a merge funnel.
 */

/** The tag `registerAdminRoute` (TAM-82) applies centrally to every admin route. */
export const ADMIN_TAG = "admin";
/** The human-obvious signal the `admin` tag must always agree with. */
export const ADMIN_PATH_PREFIX = "/admin/";

const SCHEMA_REF_PREFIX = "#/components/schemas/";

/**
 * `fastify-type-provider-zod` registers BOTH io-variants of every `.meta({id})`
 * schema — `<Id>` (output) and `<Id>Input` (input) — but a given operation only
 * `$ref`s the one it needs: a **request body `$ref`s `<Id>Input`**, a **response
 * `$ref`s `<Id>`**. The unused twin is left unreferenced in `components.schemas`.
 *
 * This is not a curiosity, it is the crux of the filter:
 *
 * - An admin request body's OUTPUT twin (`CreateAudioItemBody`) is referenced by
 *   nothing, so a rule that pruned "what admin referenced" would leave it — and
 *   the Dart generator would emit it into the APK anyway.
 * - A public request body's OUTPUT twin (`SendOtpBody`) is equally unreferenced —
 *   and `apps/mobile` **hand-writes against exactly those names**
 *   (`auth_repository.dart` builds a `SendOtpBody`). So a rule that pruned every
 *   unreferenced schema would delete models the app compiles against.
 *
 * The twins are therefore treated as ONE logical schema, and reachability is
 * computed over logical names.
 */
const INPUT_VARIANT_SUFFIX = "Input";

/** OpenAPI path-item keys that are operations. Everything else on a path item
 *  (`parameters`, `summary`, `servers`, …) rides along with the path. */
const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;
const HTTP_METHOD_SET = new Set<string>(HTTP_METHODS);

export interface OpenApiOperation {
  tags?: string[];
  [key: string]: unknown;
}
export type OpenApiPathItem = Record<string, unknown>;
export interface OpenApiComponents {
  schemas?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface OpenApiDoc {
  paths?: Record<string, OpenApiPathItem>;
  components?: OpenApiComponents;
  tags?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The path selector. Deliberately `/admin/`-prefixed (not `/admin`-prefixed) so
 * a hypothetical `/administrators` is NOT swept in; a route at exactly `/admin`
 * still counts.
 */
export function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith(ADMIN_PATH_PREFIX);
}

/** The tag selector — the one the filter actually acts on. */
export function isAdminOperation(operation: unknown): boolean {
  if (!isRecord(operation)) return false;
  const { tags } = operation as OpenApiOperation;
  return Array.isArray(tags) && tags.includes(ADMIN_TAG);
}

/** Walk any node and collect every `$ref` string value. */
function collectRefs(node: unknown, into: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, into);
    return into;
  }
  if (isRecord(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") into.add(value);
      else collectRefs(value, into);
    }
  }
  return into;
}

/** The `#/components/schemas/<Name>` refs inside one node, as bare names. */
function collectSchemaRefNames(node: unknown): string[] {
  const names: string[] = [];
  for (const ref of collectRefs(node, new Set<string>())) {
    if (ref.startsWith(SCHEMA_REF_PREFIX)) names.push(ref.slice(SCHEMA_REF_PREFIX.length));
  }
  return names;
}

/**
 * Collapse an io-variant onto its logical schema: `SendOtpBodyInput` →
 * `SendOtpBody`. Only collapses when the base schema actually exists, so a Zod
 * schema genuinely named `…Input` is left alone.
 */
function logicalName(name: string, schemas: Record<string, unknown>): string {
  if (!name.endsWith(INPUT_VARIANT_SUFFIX)) return name;
  const base = name.slice(0, -INPUT_VARIANT_SUFFIX.length);
  return Object.prototype.hasOwnProperty.call(schemas, base) ? base : name;
}

/** Both registered io-variants of a logical schema. */
function variantsOf(logical: string, schemas: Record<string, unknown>): string[] {
  return [logical, logical + INPUT_VARIANT_SUFFIX].filter((n) =>
    Object.prototype.hasOwnProperty.call(schemas, n),
  );
}

/**
 * Transitive reachability from a set of seed refs, as LOGICAL schema names.
 * Expands through both io-variants of every logical schema reached, because the
 * two twins describe the same Zod declaration and each may `$ref` a different
 * twin of its children (`AdminSession` → `UserRole`, `AdminSessionInput` →
 * `UserRoleInput`).
 *
 * A reachability walk, not a one-level sweep — Zod-emitted schemas nest deeply.
 */
function reachableLogicalSchemas(seeds: string[], schemas: Record<string, unknown>): Set<string> {
  const reached = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const name = queue.pop();
    if (name === undefined || !Object.prototype.hasOwnProperty.call(schemas, name)) continue;
    const logical = logicalName(name, schemas);
    if (reached.has(logical)) continue;
    reached.add(logical);
    for (const variant of variantsOf(logical, schemas)) {
      queue.push(...collectSchemaRefNames(schemas[variant]));
    }
  }
  return reached;
}

/**
 * The invariant: **"tagged `admin`" ⇔ "path is under `/admin/`"**, in BOTH
 * directions.
 *
 * This filter selects on the TAG; TAM-82's guard contract test selects on the
 * PATH PREFIX. If the two ever disagree, an operation is either
 * guarded-but-unfiltered (**admin schemas silently shipping in the APK**) or
 * filtered-but-unguarded (an open admin route). Asserting they agree turns two
 * independently-forgettable conventions into one enforced invariant — and makes
 * the failure a red gate rather than a discovery.
 *
 * Returns a human-readable violation per offending operation (empty = healthy).
 */
export function findTagPathViolations(doc: OpenApiDoc): string[] {
  const violations: string[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    if (!isRecord(item)) continue;
    for (const [method, operation] of Object.entries(item)) {
      if (!HTTP_METHOD_SET.has(method)) continue;
      const tagged = isAdminOperation(operation);
      const underAdmin = isAdminPath(path);
      if (tagged && !underAdmin) {
        violations.push(
          `${method.toUpperCase()} ${path} is tagged "${ADMIN_TAG}" but does not live under "${ADMIN_PATH_PREFIX}" ` +
            `— it is filtered out of openapi.public.json while TAM-82's guard contract test, which selects on the path prefix, ignores it.`,
        );
      }
      if (!tagged && underAdmin) {
        violations.push(
          `${method.toUpperCase()} ${path} lives under "${ADMIN_PATH_PREFIX}" but is not tagged "${ADMIN_TAG}" ` +
            `— its schemas WOULD SHIP IN THE APK. Register it via registerAdminRoute().`,
        );
      }
    }
  }
  return violations;
}

/**
 * Every `$ref` in `doc` that cannot be resolved inside `doc`. A filter that
 * leaves a broken ref is worse than no filter, so this gates the emitted public
 * doc. Non-schema refs are reported too: the filter does not know how to prune
 * them, so their appearance must fail loudly rather than pass silently.
 */
export function findDanglingRefs(doc: OpenApiDoc): string[] {
  const schemas = doc.components?.schemas ?? {};
  const dangling: string[] = [];
  for (const ref of collectRefs(doc, new Set<string>())) {
    if (!ref.startsWith(SCHEMA_REF_PREFIX)) {
      dangling.push(`${ref} (unsupported $ref target — only ${SCHEMA_REF_PREFIX}* is understood)`);
      continue;
    }
    const name = ref.slice(SCHEMA_REF_PREFIX.length);
    if (!Object.prototype.hasOwnProperty.call(schemas, name)) dangling.push(ref);
  }
  return dangling;
}

/** Admin paths / admin-tagged operations that survived into a public doc. */
export function findAdminLeaks(publicDoc: OpenApiDoc): string[] {
  const leaks: string[] = [];
  for (const [path, item] of Object.entries(publicDoc.paths ?? {})) {
    if (isAdminPath(path)) leaks.push(`path ${path}`);
    if (!isRecord(item)) continue;
    for (const [method, operation] of Object.entries(item)) {
      if (HTTP_METHOD_SET.has(method) && isAdminOperation(operation)) {
        leaks.push(`operation ${method.toUpperCase()} ${path} (tagged "${ADMIN_TAG}")`);
      }
    }
  }
  return leaks;
}

/**
 * `(fullDoc) => publicDoc`. Pure; never mutates its input.
 *
 * 1. drop every operation tagged `admin`;
 * 2. drop any path left with zero operations (no empty path objects);
 * 3. prune the `components.schemas` that the drop in (1) **orphaned**.
 *
 * Step 3 is the load-bearing part. It is a **differential** prune, and both
 * halves of that are deliberate:
 *
 * - **prune** a schema whose logical name is reachable from a dropped admin
 *   operation but from NO surviving public operation — transitively, so
 *   `AdminSession` taking `UserRole` with it happens automatically, however deep
 *   the chain;
 * - **keep** everything else. A schema reachable from BOTH surfaces
 *   (`ErrorEnvelope`, `MediaUrl`, `DeityView`) is still referenced by a surviving
 *   path and must survive. And a schema reachable from NEITHER surface is left
 *   **untouched**: the emitted doc is full of unreferenced io-twins and dead
 *   registrations (`BookCategoryCard`, `SendOtpBody`) that `apps/mobile` compiles
 *   against today. Sweeping them out is not this filter's job — it would delete
 *   models the app uses, with a symptom that looks nothing like the cause.
 *
 * Key order is inherited from the input document, so a deterministic full doc
 * yields a byte-identical public doc — which is what makes the drift gate mean
 * anything.
 */
export function filterPublicOpenapi(full: OpenApiDoc): OpenApiDoc {
  const publicPaths: Record<string, OpenApiPathItem> = {};
  const droppedOperations: OpenApiOperation[] = [];

  for (const [path, item] of Object.entries(full.paths ?? {})) {
    if (!isRecord(item)) continue;
    const keptItem: OpenApiPathItem = {};
    let operations = 0;
    let keptOperations = 0;
    for (const [key, value] of Object.entries(item)) {
      if (!HTTP_METHOD_SET.has(key)) {
        keptItem[key] = value;
        continue;
      }
      operations += 1;
      if (isAdminOperation(value)) {
        droppedOperations.push(value as OpenApiOperation);
        continue;
      }
      keptItem[key] = value;
      keptOperations += 1;
    }
    // A path whose operations were ALL dropped leaves nothing behind — not an
    // empty path object. A path that never had an operation is not admin.
    if (operations > 0 && keptOperations === 0) continue;
    publicPaths[path] = keptItem;
  }

  const schemas = full.components?.schemas ?? {};
  const usedByPublic = reachableLogicalSchemas(collectSchemaRefNames(publicPaths), schemas);
  const usedByAdmin = reachableLogicalSchemas(collectSchemaRefNames(droppedOperations), schemas);

  const publicSchemas: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(schemas)) {
    const logical = logicalName(name, schemas);
    const orphanedByTheAdminDrop = usedByAdmin.has(logical) && !usedByPublic.has(logical);
    if (!orphanedByTheAdminDrop) publicSchemas[name] = definition;
  }

  const out: OpenApiDoc = {};
  for (const [key, value] of Object.entries(full)) {
    if (key === "paths") {
      out.paths = publicPaths;
    } else if (key === "components") {
      const components: OpenApiComponents = {};
      for (const [componentKey, componentValue] of Object.entries(isRecord(value) ? value : {})) {
        if (componentKey === "schemas") {
          if (Object.keys(publicSchemas).length > 0) components.schemas = publicSchemas;
        } else {
          components[componentKey] = componentValue;
        }
      }
      if (Object.keys(components).length > 0) out.components = components;
    } else if (key === "tags" && Array.isArray(value)) {
      // Drop the `admin` tag declaration: no surviving operation references it.
      const tags = value.filter((tag) => !(isRecord(tag) && tag.name === ADMIN_TAG));
      if (tags.length > 0) out.tags = tags as Array<Record<string, unknown>>;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** The exact serialization `getOpenapiDocString()` uses — shared so the emitter
 *  and the drift gate cannot disagree on a trailing byte. */
export function serializeOpenapiDoc(doc: OpenApiDoc): string {
  return JSON.stringify(doc, null, 2) + "\n";
}
