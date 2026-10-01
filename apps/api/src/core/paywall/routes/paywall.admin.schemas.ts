import { z } from "zod";
import { adminLocale, mediaUrl } from "@api/shared/schemas";

/**
 * Zod schemas for the `/admin/paywall/*` write surface (TAM-159) — the single
 * source of truth for the OpenAPI contract emitted by `pnpm nx run api:openapi`.
 * Every operation here is tagged `admin` by `registerAdminRoute`, so TAM-85's
 * filter drops it from `openapi.public.json` (admin write-schemas must never
 * reach the mobile Dart codegen).
 *
 * SCOPE — per paywall: `layout`, `minAppVersion`, the SHELL COPY
 * (`title`, `cancelAnytimeText`, `refundPolicyText`, `payNowCta`) and the
 * ordered HERO list.
 *
 * Plans, pricing and legal links are deliberately absent: money and legal text,
 * a materially different blast radius. `displayPriceText` especially — the only
 * copy an editor could use to contradict what we actually charge.
 *
 * BENEFIT ICONS are absent too. They are bundled app assets keyed by name — part
 * of the design system, not content — so there is nothing here to upload.
 *
 * Supersedes TAM-130's hero-video-only surface, which wrote the flat
 * `paywall_translations.video_*` columns. Those went dead when the wire started
 * deriving the hero from `paywall_hero_media`, so that endpoint would have let
 * an editor upload a video that silently never reached a device.
 *
 * Shape decisions that differ from the sibling admin modules:
 *
 *   1. **Copy is patched IN PLACE, not replace-set.** A replace-set would
 *      destroy the NOT NULL copy columns this endpoint does not own for locales
 *      it was not told about. A locale with no row is a 400 — the seed owns row
 *      creation.
 *   2. **Hero media IS replace-set, per locale.** That table is wholly owned
 *      here and the list is ORDERED, so "insert at position 2" is not
 *      expressible as a per-row patch without a reindexing dance.
 *   3. **The precondition is the PARENT config row's `updatedAt`.** None of the
 *      three child tables has a timestamp; see the repository docblock for the
 *      invariant that creates.
 */

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/**
 * The optimistic-concurrency precondition (ADR §C3): the client's last-known
 * `paywall_configs.updatedAt`. The repository puts it in the `WHERE` of an
 * `updateMany`; a 0-count means someone else wrote first → 409 `STALE_WRITE`.
 */
export const expectedUpdatedAt = z.string().datetime();

/**
 * A paywall id in a URL. Bounded to a slug because it is also an ANALYTICS
 * dimension (`paywall_id` on every paywall event) and the key every paywall
 * child table joins on — free text here would flow straight into the warehouse.
 */
export const paywallIdParam = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/,
    "must be lowercase alphanumerics separated by single _ or -"
  );

/**
 * `mediaId` — NOT display data. It is the analytics identity of the creative,
 * emitted on paywall events, so it is bounded to a slug rather than left as
 * free text flowing into the event stream.
 */
export const paywallMediaId = paywallIdParam;

/**
 * Which built layout renders this paywall.
 *
 * A bounded ENUM here even though the DB column and the public wire field are
 * both free-form strings — and that asymmetry is deliberate. Reads must stay
 * tolerant so a layout added later still serializes; the WRITE path is where a
 * typo has to be caught, because `layuot_grid` would silently fall every user
 * of this paywall back to `card_hero` with nothing in any log saying why.
 *
 * Adding a layout = one entry here + the widget in the app. Keep them in step:
 * an entry whose widget does not exist yet is a screen nobody can render.
 */
export const paywallLayout = z.enum([
  "card_hero",
  "video_bleed",
  "icon_grid",
  "carousel",
]);

/** `image` | `video`. Mirrors what the app can actually build. */
export const heroMediaType = z.enum(["image", "video"]);

/**
 * A `major.minor.patch` app version, compared NUMERICALLY by the resolver.
 *
 * Strict here even though the read side is a plain string: this value decides
 * whether a paywall reaches a device at all, and the failure mode of a typo is
 * silent — `meetsMinVersion` denies anything unparseable, so `1.1` or `v1.1.0`
 * would send every user of that paywall to the default with nothing in the UI
 * saying why. `0.0.0` means no gate.
 */
export const appVersionString = z
  .string()
  .trim()
  .regex(/^\d+\.\d+\.\d+$/, "must be major.minor.patch, e.g. 1.1.0");

// ---------------------------------------------------------------------------
// write body
// ---------------------------------------------------------------------------

/**
 * One hero asset. `thumbnailUrl` is meaningful for a video (its poster) and
 * normally null for an image, but it is not forbidden on an image — a carousel
 * frame may legitimately want a lighter preview.
 */
const AdminHeroMediaRow = z
  .object({
    sortOrder: z.number().int().nonnegative(),
    mediaType: heroMediaType,
    url: mediaUrl,
    thumbnailUrl: mediaUrl.nullable().default(null),
    mediaId: paywallMediaId,
  })
  .strict();

/**
 * One locale's patch. Every field is optional — **omitted means untouched** —
 * and the SERVER diffs against stored values (see `PaywallAdminService`), so a
 * payload echoing unchanged values is a clean no-op rather than a 400 from
 * `validateOwnedUrl`.
 *
 * `heroMedia`, when present, REPLACES that locale's whole list. An empty array
 * is therefore meaningful and allowed: it clears the hero.
 */
const AdminPaywallLocaleRow = z
  .object({
    locale: adminLocale,
    title: z.string().trim().min(1).max(120).optional(),
    cancelAnytimeText: z.string().trim().min(1).max(200).optional(),
    refundPolicyText: z.string().trim().min(1).max(200).optional(),
    payNowCta: z.string().trim().min(1).max(60).optional(),
    heroMedia: z
      .array(AdminHeroMediaRow)
      .max(10)
      .refine(
        (rows) => new Set(rows.map((r) => r.sortOrder)).size === rows.length,
        { message: "each sortOrder may appear at most once" }
      )
      .optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.title !== undefined ||
      v.cancelAnytimeText !== undefined ||
      v.refundPolicyText !== undefined ||
      v.payNowCta !== undefined ||
      v.heroMedia !== undefined,
    { message: "provide at least one field to change for this locale" }
  );

/**
 * `PATCH /admin/paywall/configs/:paywallId`.
 *
 * `translations` is locale-unique. Uniqueness matters here in a way it does not
 * for the replace-set modules: those get it free from `createMany`'s unique
 * constraint, whereas an in-place update would silently last-write-wins on a
 * duplicated locale.
 */
export const AdminPaywallConfigPatchBody = z
  .object({
    expectedUpdatedAt,
    layout: paywallLayout.optional(),
    /**
     * `enabled` is deliberately NOT writable here. It stays a column (the
     * resolver still falls back to the default paywall when a variant is
     * disabled, and ops/the seed can set it), but the CMS has no control for it,
     * and a write field the UI cannot reach is API surface nobody maintains.
     *
     * It is also redundant now: `minAppVersion` is CMS-editable, so parking a
     * bad variant is a matter of raising its gate above every shipped build —
     * same effect, one concept instead of two.
     */
    minAppVersion: appVersionString.optional(),
    translations: z
      .array(AdminPaywallLocaleRow)
      .max(16)
      .refine((rows) => new Set(rows.map((r) => r.locale)).size === rows.length, {
        message: "each locale may appear at most once",
      })
      .optional(),
  })
  .strict();
export type AdminPaywallConfigPatchInput = z.infer<
  typeof AdminPaywallConfigPatchBody
>;

export const AdminPaywallConfigParams = z.object({ paywallId: paywallIdParam });
export type AdminPaywallConfigParamsInput = z.infer<
  typeof AdminPaywallConfigParams
>;

// ---------------------------------------------------------------------------
// views
// ---------------------------------------------------------------------------

/**
 * URL fields on the READ side are `z.string().nullable()`, deliberately NOT
 * `mediaUrl`: response schemas are validated on serialization too, so typing
 * them strictly would turn a legacy or externally-hosted value (the seed points
 * at a public CDN) into a 500 for the editor instead of a value they can see and
 * replace. Reads tolerant, writes strict — the same split this codebase applies
 * to locale.
 */
export const AdminPaywallHeroMediaView = z
  .object({
    sortOrder: z.number().int(),
    mediaType: z.string(),
    url: z.string(),
    thumbnailUrl: z.string().nullable(),
    mediaId: z.string(),
  })
  .meta({ id: "AdminPaywallHeroMediaView" });

export const AdminPaywallTranslationView = z
  .object({
    locale: z.string(),
    title: z.string(),
    cancelAnytimeText: z.string(),
    refundPolicyText: z.string(),
    payNowCta: z.string(),
    heroMedia: z.array(AdminPaywallHeroMediaView),
  })
  .meta({ id: "AdminPaywallTranslationView" });

/**
 * `hasVideoLocaleFallback` is deliberately ABSENT. The column is carried from
 * the DB into `RawPaywallConfig` but is read by no logic and never reaches the
 * composed public response — surfacing it would tell an editor a switch controls
 * per-locale video fallback when it controls nothing.
 */
export const AdminPaywallConfigView = z
  .object({
    paywallId: z.string(),
    layout: z.string(),
    minAppVersion: z.string(),
    configVersion: z.number().int(),
    enabled: z.boolean(),
    defaultPlanId: z.string().nullable(),
    shimmerEnabled: z.boolean(),
    /** The concurrency token to echo back on `PATCH`. */
    updatedAt: z.string().datetime(),
    /** ONLY locales that already have a copy row — those are the editable set. */
    translations: z.array(AdminPaywallTranslationView),
  })
  .meta({ id: "AdminPaywallConfigView" });

export const AdminPaywallListItemView = z
  .object({
    paywallId: z.string(),
    layout: z.string(),
    minAppVersion: z.string(),
    enabled: z.boolean(),
    configVersion: z.number().int(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminPaywallListItemView" });

// ---------------------------------------------------------------------------
// response envelopes
// ---------------------------------------------------------------------------

/**
 * Single-item admin success envelope. Defined locally (rather than importing
 * another module's `envelope`) so the paywall module owns its own contract —
 * mirrors the status/deity/aarti exemplars.
 */
function adminEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

export const AdminPaywallConfigResponse = adminEnvelope(
  AdminPaywallConfigView
).meta({ id: "AdminPaywallConfigResponse" });

export const AdminPaywallListResponse = adminEnvelope(
  z.array(AdminPaywallListItemView)
).meta({ id: "AdminPaywallListResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "AdminPaywallErrorEnvelope" });
