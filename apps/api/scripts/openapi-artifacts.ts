/**
 * TAM-85 — the one place that turns the live Fastify app into the committed
 * OpenAPI artifacts. `emit-openapi.ts` (writes them) and `check-openapi.ts`
 * (gates them for drift) both go through here, so the two can never disagree
 * about content, ordering, or a trailing byte.
 *
 * The structural checks live here rather than in a test file on purpose: they
 * run inside `pnpm check:openapi` → `pnpm verify` → the CodeBuild gate, so a
 * mis-tagged admin route fails the build instead of quietly shipping its schemas
 * to every phone.
 */
import {
  filterPublicOpenapi,
  findAdminLeaks,
  findDanglingRefs,
  findTagPathViolations,
  serializeOpenapiDoc,
  type OpenApiDoc,
} from "./filter-public-openapi.js";
import { getOpenapiDocString } from "./openapi-doc.js";

export const FULL_DOC_PATH = "apps/api/openapi.json";
export const PUBLIC_DOC_PATH = "apps/api/openapi.public.json";

export interface OpenapiArtifact {
  /** Repo-root-relative path of the committed file. */
  path: string;
  /** Its exact expected contents. */
  json: string;
}

function fail(heading: string, details: string[]): never {
  throw new Error([heading, ...details.map((d) => `  - ${d}`)].join("\n"));
}

/**
 * Emits the full doc, derives the public doc, and refuses to hand back either
 * unless three invariants hold:
 *
 * 1. **tag ⇔ path** — the selector this filter uses (the `admin` tag) agrees
 *    with the selector TAM-82's guard test uses (the `/admin/` path prefix).
 * 2. **no dangling `$ref`s** in the public doc — a filter that leaves a broken
 *    ref is worse than no filter.
 * 3. **no admin leak** in the public doc — the mechanical "zero admin models in
 *    the mobile client" check. It asserts over the doc rather than the generated
 *    Dart tree so it runs in `pnpm verify` without JDK 17; the Dart tree is a
 *    deterministic function of this doc, and this doc is drift-gated.
 */
export async function buildOpenapiArtifacts(): Promise<OpenapiArtifact[]> {
  const fullJson = await getOpenapiDocString();
  const full = JSON.parse(fullJson) as OpenApiDoc;

  const violations = findTagPathViolations(full);
  if (violations.length > 0) {
    fail(
      "openapi: the `admin` tag and the `/admin/` path prefix disagree — fix the route, not this check:",
      violations,
    );
  }

  const publicDoc = filterPublicOpenapi(full);

  const dangling = findDanglingRefs(publicDoc);
  if (dangling.length > 0) {
    fail(`openapi: ${PUBLIC_DOC_PATH} would contain unresolvable $refs:`, dangling);
  }

  const leaks = findAdminLeaks(publicDoc);
  if (leaks.length > 0) {
    fail(`openapi: admin surface survived into ${PUBLIC_DOC_PATH}:`, leaks);
  }

  return [
    { path: FULL_DOC_PATH, json: fullJson },
    { path: PUBLIC_DOC_PATH, json: serializeOpenapiDoc(publicDoc) },
  ];
}
