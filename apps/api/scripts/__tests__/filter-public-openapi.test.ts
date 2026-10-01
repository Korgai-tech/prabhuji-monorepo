import { describe, expect, test } from "vitest";
import {
  filterPublicOpenapi,
  findAdminLeaks,
  findDanglingRefs,
  findTagPathViolations,
  serializeOpenapiDoc,
  type OpenApiDoc,
} from "../filter-public-openapi.js";

/**
 * TAM-85. The filter is what stands between an admin write schema and every
 * Android phone, so both of its failure directions are tested here:
 *
 * - **under-pruning** → admin schemas ship in the APK;
 * - **over-pruning**  → a schema `apps/mobile` compiles against vanishes and the
 *   symptom looks nothing like the cause.
 *
 * The fixture mirrors what `fastify-type-provider-zod` actually emits, because
 * that shape is the whole difficulty:
 *
 * - a **request body `$ref`s `<Id>Input`**; its `<Id>` twin is registered but
 *   referenced by nothing;
 * - a **response `$ref`s `<Id>`**; its `<Id>Input` twin is the unreferenced one.
 *
 * So "referenced by nothing" is true of BOTH an admin body's output twin and a
 * public body's output twin — and only one of them may be pruned.
 */
function fullDoc(): OpenApiDoc {
  return {
    openapi: "3.1.0",
    info: { title: "API", version: "0.0.1" },
    components: {
      schemas: {
        // shared by BOTH surfaces — must survive
        ErrorEnvelope: { type: "object", properties: { message: { type: "string" } } },
        ErrorEnvelopeInput: { type: "object", properties: { message: { type: "string" } } },
        MediaUrl: { type: "string", format: "uri" },
        MediaUrlInput: { type: "string", format: "uri" },

        // public response chain
        AartiListResponse: {
          type: "object",
          properties: { items: { type: "array", items: { $ref: "#/components/schemas/AartiCard" } } },
        },
        AartiListResponseInput: {
          type: "object",
          properties: { items: { type: "array", items: { $ref: "#/components/schemas/AartiCardInput" } } },
        },
        AartiCard: { type: "object", properties: { audioUrl: { $ref: "#/components/schemas/MediaUrl" } } },
        AartiCardInput: { type: "object", properties: { audioUrl: { $ref: "#/components/schemas/MediaUrlInput" } } },

        // a PUBLIC request body: the path $refs the Input twin, so `AartiPlayBody`
        // is unreferenced — yet apps/mobile hand-writes against that exact name.
        AartiPlayBody: { type: "object", properties: { id: { type: "string" } } },
        AartiPlayBodyInput: { type: "object", properties: { id: { type: "string" } } },

        // an ADMIN request body: same shape, opposite fate.
        CreateAudioItemBody: {
          type: "object",
          properties: {
            audioUrl: { $ref: "#/components/schemas/MediaUrl" },
            meta: { $ref: "#/components/schemas/AdminAudioMeta" },
          },
        },
        CreateAudioItemBodyInput: {
          type: "object",
          properties: {
            audioUrl: { $ref: "#/components/schemas/MediaUrlInput" },
            meta: { $ref: "#/components/schemas/AdminAudioMetaInput" },
          },
        },
        // admin-only, two refs deep: CreateAudioItemBody → AdminAudioMeta → AdminTagRef
        AdminAudioMeta: { type: "object", properties: { tag: { $ref: "#/components/schemas/AdminTagRef" } } },
        AdminAudioMetaInput: { type: "object", properties: { tag: { $ref: "#/components/schemas/AdminTagRef" } } },
        AdminTagRef: { type: "string" },

        // referenced by NO path at all, either surface — dead weight that predates
        // this filter and that mobile still compiles against. Not ours to sweep.
        BookCategoryCard: { type: "object", properties: { slug: { type: "string" } } },
        BookCategoryCardInput: { type: "object", properties: { slug: { type: "string" } } },
      },
    },
    paths: {
      "/aarti/audios": {
        get: {
          responses: {
            "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/AartiListResponse" } } } },
            "500": { content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          },
        },
      },
      "/aarti/play": {
        post: {
          requestBody: {
            content: { "application/json": { schema: { $ref: "#/components/schemas/AartiPlayBodyInput" } } },
          },
          responses: { "200": { description: "ok" } },
        },
      },
      "/admin/aarti/items": {
        post: {
          tags: ["admin"],
          requestBody: {
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateAudioItemBodyInput" } } },
          },
          responses: {
            "400": { content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          },
        },
      },
      "/admin/session": { get: { tags: ["admin"], responses: { "200": { description: "ok" } } } },
      "/health": { get: { responses: { "200": { description: "ok" } } } },
    },
  };
}

function publicSchemaNames(doc: OpenApiDoc): string[] {
  return Object.keys(filterPublicOpenapi(doc).components?.schemas ?? {});
}

describe("filterPublicOpenapi — paths", () => {
  test("drops every admin-tagged operation and keeps the public ones", () => {
    const publicDoc = filterPublicOpenapi(fullDoc());
    expect(Object.keys(publicDoc.paths ?? {})).toEqual(["/aarti/audios", "/aarti/play", "/health"]);
    expect(findAdminLeaks(publicDoc)).toEqual([]);
  });

  test("leaves no empty path object behind when all of a path's operations are dropped", () => {
    const publicDoc = filterPublicOpenapi(fullDoc());
    expect(publicDoc.paths).not.toHaveProperty("/admin/session");
    expect(publicDoc.paths).not.toHaveProperty("/admin/aarti/items");
  });

  test("keeps a public operation that shares a path with an admin one", () => {
    const doc = fullDoc();
    doc.paths!["/aarti/audios"].post = { tags: ["admin"], responses: { "201": { description: "created" } } };
    const publicDoc = filterPublicOpenapi(doc);
    expect(Object.keys(publicDoc.paths!["/aarti/audios"])).toEqual(["get"]);
  });
});

describe("filterPublicOpenapi — schema pruning", () => {
  test("SHARED schemas survive: referenced by an admin AND a public path is still referenced", () => {
    const kept = publicSchemaNames(fullDoc());
    // ErrorEnvelope is a 400 on the admin route and a 500 on the public one.
    expect(kept).toContain("ErrorEnvelope");
    expect(kept).toContain("ErrorEnvelopeInput");
    // MediaUrl is reached from the admin body AND (via AartiCard) from a public path.
    expect(kept).toContain("MediaUrl");
    expect(kept).toContain("MediaUrlInput");
  });

  test("admin-only schemas are pruned transitively, both io-variants", () => {
    const kept = publicSchemaNames(fullDoc());
    expect(kept).not.toContain("CreateAudioItemBodyInput");
    // the OUTPUT twin of an admin body is referenced by NOTHING — pruning it is
    // the entire point, since the Dart generator emits a model for it regardless.
    expect(kept).not.toContain("CreateAudioItemBody");
    // reachable only THROUGH the admin body — a one-level sweep would miss these
    expect(kept).not.toContain("AdminAudioMeta");
    expect(kept).not.toContain("AdminAudioMetaInput");
    expect(kept).not.toContain("AdminTagRef");
  });

  test("an unreferenced PUBLIC body twin survives — apps/mobile compiles against it", () => {
    const kept = publicSchemaNames(fullDoc());
    // AartiPlayBody is referenced by nothing (the path $refs AartiPlayBodyInput),
    // exactly like CreateAudioItemBody. Only the admin one may be pruned.
    expect(kept).toContain("AartiPlayBody");
    expect(kept).toContain("AartiPlayBodyInput");
  });

  test("schemas referenced by NEITHER surface are left untouched — not this filter's job", () => {
    const kept = publicSchemaNames(fullDoc());
    expect(kept).toContain("BookCategoryCard");
    expect(kept).toContain("BookCategoryCardInput");
  });

  test("the public doc is self-consistent — no dangling $refs", () => {
    expect(findDanglingRefs(filterPublicOpenapi(fullDoc()))).toEqual([]);
  });

  test("is deterministic and does not mutate its input", () => {
    const input = fullDoc();
    const before = serializeOpenapiDoc(input);
    const first = serializeOpenapiDoc(filterPublicOpenapi(input));
    expect(serializeOpenapiDoc(input)).toBe(before);
    expect(first).toBe(serializeOpenapiDoc(filterPublicOpenapi(fullDoc())));
    // filtering an already-public doc is a fixed point
    expect(serializeOpenapiDoc(filterPublicOpenapi(JSON.parse(first) as OpenApiDoc))).toBe(first);
  });
});

describe("the tag⇔path invariant", () => {
  test("a document whose two selectors agree has no violations", () => {
    expect(findTagPathViolations(fullDoc())).toEqual([]);
  });

  test("catches an admin-tagged operation that is NOT under /admin/", () => {
    const doc = fullDoc();
    doc.paths!["/aarti/audios"].get = { tags: ["admin"], responses: {} };
    const violations = findTagPathViolations(doc);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("GET /aarti/audios");
  });

  test("catches an operation under /admin/ that LOST its admin tag — the APK-leak direction", () => {
    const doc = fullDoc();
    delete (doc.paths!["/admin/session"].get as { tags?: string[] }).tags;
    const violations = findTagPathViolations(doc);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("GET /admin/session");
    // and the leak is real, which is why the invariant is a gate and not advice
    expect(findAdminLeaks(filterPublicOpenapi(doc))).toContain("path /admin/session");
  });

  test("/administrators is not swept in by the /admin/ prefix", () => {
    const doc = fullDoc();
    doc.paths!["/administrators"] = { get: { responses: {} } };
    expect(findTagPathViolations(doc)).toEqual([]);
    expect(filterPublicOpenapi(doc).paths).toHaveProperty("/administrators");
  });
});
