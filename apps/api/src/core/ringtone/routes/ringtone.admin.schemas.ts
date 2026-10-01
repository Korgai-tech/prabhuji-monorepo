import { z } from "zod";
import {
  adminPagedEnvelope,
  adminPaginationQuery,
  mediaUrl,
  sortQuery,
} from "@api/shared/schemas";
import { LanguageCodeSchema } from "@api/shared/language.schema";
import {
  RINGTONE_LANGUAGES_MAX,
  RINGTONE_SORT_FIELDS,
  RINGTONE_TAG_ARRAY_MAX,
  RINGTONE_TAG_ELEMENT_MAX,
} from "@api/core/ringtone/types";

/**
 * Zod schemas for the `/admin/ringtones/*` write surface (TAM-94;
 * ADR §C1–C5). Single source of truth for the OpenAPI contract emitted by
 * `pnpm nx run api:openapi` and the generated TS client — every operation here
 * is tagged `admin` by `registerAdminRoute`, so TAM-85's filter drops it from
 * `openapi.public.json` (it must never reach the mobile Dart codegen).
 *
 * Mirrors the TAM-88 deity exemplar SHAPE: `.strict()` write bodies (server-
 * authoritative fields rejected, not stripped), an `updatedAt` precondition on
 * every mutating write, the immutable business key (`slug`) absent from the
 * PATCH body, a Zod-enum `sort` allowlist, and a per-entity list envelope.
 *
 * #EXPORT_CRITICAL — THE MEDIA CLASSES: this module has TWO media fields in TWO
 * gating classes. `thumbnailImageUrl` is FREE (the grid/search card art every
 * user sees); `audioUrl` is PRO. Here at the write boundary both are just
 * `mediaUrl` (https shape); the gating classes are enforced (a) by the DISTINCT
 * allowlist triples the admin service passes to `validateOwnedUrl`, and (b) by
 * the public read path's fail-closed nulling (untouched by this ticket).
 */

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/**
 * `slug` — the ringtone's stable content tag / idempotent seed key (unique).
 * URL-safe: lowercase alphanumerics joined by single hyphens, no whitespace.
 * Validated on POST and **deliberately absent from the PATCH body** — it is the
 * immutable business key (#EXPORT_CRITICAL).
 */
export const ringtoneSlug = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase alphanumerics separated by single hyphens, with no whitespace"
  );

/**
 * A deity slug — the logical reference to `deities.slug` (TAM-57), NO DB FK.
 * Shape-checked here; EXISTENCE is validated through the deity facade in the
 * admin service on every create and every update that sets it (#EXPORT_CRITICAL).
 */
export const deitySlugRef = z.string().trim().min(1).max(64);

/**
 * The optimistic-concurrency precondition (ADR §C3): the client's last-known
 * `updatedAt`, echoed back on every mutating write. The repository puts it in
 * the `WHERE` of an `updateMany`; a 0-count means someone else wrote first →
 * 409 `STALE_WRITE`. ISO-8601 string on the wire; the service parses it to a
 * `Date`. This is the ONLY way `updatedAt` is ever client-supplied.
 */
export const expectedUpdatedAt = z.string().datetime();

/**
 * A single `tags` / `searchKeywords` element — trimmed, non-empty, and length-
 * bounded so a runaway value cannot degrade the GIN index. The whole-array trim
 * + de-dup happens in the service before the write.
 */
const tagElement = z.string().trim().min(1).max(RINGTONE_TAG_ELEMENT_MAX);

/**
 * A bounded `tags` / `searchKeywords` array (≤ 50 elements). Edited as a WHOLE
 * array (set-semantics on the row's PATCH) — these are Postgres array COLUMNS,
 * not join tables, so there is no sub-resource endpoint. De-duplication is done
 * server-side (the service), not here, so the emitted OpenAPI stays a plain
 * `array<string>`.
 */
const tagArray = z.array(tagElement).max(RINGTONE_TAG_ARRAY_MAX);

/** `?flag=true|false` querystring → boolean (never a string comparison downstream). */
const boolFilter = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

// Optional bounded free-text columns, nullable so a PATCH can clear them.
const shortText = z.string().trim().min(1).max(200);

/**
 * TAM-108 `languages` — the availability set, each element one of the 8 Phase-1
 * language codes (`@api/shared/language.schema`). An EMPTY array means "all
 * languages" (the write default). Bounded to the code count; de-duplicated
 * server-side (the service) so the emitted OpenAPI stays a plain enum array.
 * Replaces the single `language` column (dropped in step 3).
 */
const languages = z.array(LanguageCodeSchema).max(RINGTONE_LANGUAGES_MAX);
const altText = z.string().trim().min(1).max(300);
const shareDescription = z.string().trim().min(1).max(500);

/**
 * `deepLinkUrl` is an app deep link, **NOT uploadable media** — it is
 * deliberately excluded from the media allowlist and NOT passed to
 * `validateOwnedUrl`. Validated only for URL shape here.
 */
const deepLinkUrl = z.url().max(2048);

// ---------------------------------------------------------------------------
// request — params
// ---------------------------------------------------------------------------

export const AdminRingtoneIdParams = z.object({ id: z.uuid() });
export type AdminRingtoneIdParamsInput = z.infer<typeof AdminRingtoneIdParams>;

// ---------------------------------------------------------------------------
// request — list query
// ---------------------------------------------------------------------------

/**
 * Offset pagination (ADR §C2) — inline (un-`.meta`-tagged) because
 * `@fastify/swagger` can't resolve named refs for querystring params. Composes
 * TAM-82's `adminPaginationQuery` (page/pageSize, clamped to 100) + `sortQuery`.
 *
 * `tag` matches an element of `tags` OR `searchKeywords` (exact element match —
 * see the repository; simpler than partial ILIKE and what an editor wants; the
 * public search endpoint keeps its partial-ILIKE semantics). `isActive` arrives
 * as the strings `"true"`/`"false"` and is transformed to a boolean so the
 * service never string-compares.
 */
export const AdminRingtoneListQuery = adminPaginationQuery
  .extend(sortQuery(RINGTONE_SORT_FIELDS).shape)
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    isActive: boolFilter,
    deitySlug: z.string().trim().min(1).max(64).optional(),
    // TAM-108: filter by language MEMBERSHIP — rows whose `languages` set
    // contains this code OR whose set is empty (available in all languages).
    language: LanguageCodeSchema.optional(),
    tag: z.string().trim().min(1).max(RINGTONE_TAG_ELEMENT_MAX).optional(),
  });
export type AdminRingtoneListQueryInput = z.infer<typeof AdminRingtoneListQuery>;

// ---------------------------------------------------------------------------
// request — write bodies
// ---------------------------------------------------------------------------

/**
 * `POST /admin/ringtones`. `.strict()` — a body carrying a server-authoritative
 * field (`id`, `createdAt`, `updatedAt`, `playCount`, `setCount`) is a **400,
 * not a silent strip** (the AC requires rejection). Both media URLs are required
 * and validated against their DISTINCT allowlist triples in the service before
 * the write; `deitySlug` is validated through the deity facade.
 */
export const AdminRingtoneCreateBody = z
  .object({
    slug: ringtoneSlug,
    title: shortText,
    deitySlug: deitySlugRef,
    // FREE card art (#EXPORT_CRITICAL — must stay free on the public read path).
    thumbnailImageUrl: mediaUrl,
    // PRO — nulled for free callers on the public read path.
    audioUrl: mediaUrl,
    tags: tagArray.default([]),
    searchKeywords: tagArray.default([]),
    // TAM-108 multi-language availability set; `[]` (default) = all languages.
    languages: languages.default([]),
    artistOrSource: shortText.nullable().default(null),
    deepLinkUrl: deepLinkUrl.nullable().default(null),
    altText: altText.nullable().default(null),
    shareTitle: shortText.nullable().default(null),
    shareDescription: shareDescription.nullable().default(null),
    isActive: z.boolean().default(true),
    // NO `playCount` / `setCount`: server-authoritative (#EXPORT_CRITICAL).
  })
  .strict()
  .meta({ id: "AdminRingtoneCreateBody" });
export type AdminRingtoneCreateInput = z.infer<typeof AdminRingtoneCreateBody>;

/**
 * `PATCH /admin/ringtones/:id`. Partial update + the `updatedAt` precondition.
 * `.strict()` + the **deliberate absence of `slug`, `playCount`, `setCount`**
 * make an attempt to set any of them a 400 at the boundary. Reactivation is
 * `{ isActive: true }` here — there is no separate reactivate endpoint;
 * deactivation is fully reversible. Nullable fields accept `null` to clear them.
 */
export const AdminRingtonePatchBody = z
  .object({
    expectedUpdatedAt,
    title: shortText.optional(),
    deitySlug: deitySlugRef.optional(),
    thumbnailImageUrl: mediaUrl.optional(),
    audioUrl: mediaUrl.optional(),
    tags: tagArray.optional(),
    searchKeywords: tagArray.optional(),
    // TAM-108 multi-language: whole-array set semantics; `[]` = all languages.
    languages: languages.optional(),
    artistOrSource: shortText.nullable().optional(),
    deepLinkUrl: deepLinkUrl.nullable().optional(),
    altText: altText.nullable().optional(),
    shareTitle: shortText.nullable().optional(),
    shareDescription: shareDescription.nullable().optional(),
    isActive: z.boolean().optional(),
    // NO `slug` (immutable key), NO `playCount`/`setCount` (server-authoritative).
  })
  .strict()
  .meta({ id: "AdminRingtonePatchBody" });
export type AdminRingtonePatchInput = z.infer<typeof AdminRingtonePatchBody>;

/**
 * `DELETE /admin/ringtones/:id` — a **deactivation** (`isActive = false`), never
 * a hard delete. Carries the same `updatedAt` precondition as PATCH, in the body.
 */
export const AdminRingtoneDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminRingtoneDeleteBody" });
export type AdminRingtoneDeleteInput = z.infer<typeof AdminRingtoneDeleteBody>;

// ---------------------------------------------------------------------------
// response components
// ---------------------------------------------------------------------------

/**
 * The full admin row — list item AND detail (no sub-resource, so both endpoints
 * return the same shape). Carries EVERY column, including the Pro-gated
 * `audioUrl` IN FULL — admin reads are NOT Pro-gated (#EXPORT_CRITICAL: the gate
 * protects the FREE user's wire, not the editor). `createdAt`/`updatedAt` are
 * ISO strings; the repository maps the Prisma `Date`s.
 */
export const AdminRingtoneView = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    deitySlug: z.string(),
    thumbnailImageUrl: mediaUrl,
    audioUrl: mediaUrl,
    playCount: z.number().int(),
    setCount: z.number().int(),
    tags: z.array(z.string()),
    searchKeywords: z.array(z.string()),
    // TAM-108 multi-language availability set; `[]` = all languages.
    languages: z.array(z.string()),
    artistOrSource: z.string().nullable(),
    deepLinkUrl: z.string().nullable(),
    altText: z.string().nullable(),
    shareTitle: z.string().nullable(),
    shareDescription: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminRingtoneView" });

// ---------------------------------------------------------------------------
// response envelopes
// ---------------------------------------------------------------------------

/**
 * Single-item admin success envelope. Defined locally (rather than importing
 * another module's `envelope`) so the ringtone module owns its own contract and
 * does not reach into another module's route schemas.
 */
function adminEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

export const AdminRingtoneListResponse = adminPagedEnvelope(
  AdminRingtoneView
).meta({ id: "AdminRingtoneListResponse" });

export const AdminRingtoneDetailResponse = adminEnvelope(AdminRingtoneView).meta(
  { id: "AdminRingtoneDetailResponse" }
);

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "AdminRingtoneErrorEnvelope" });
