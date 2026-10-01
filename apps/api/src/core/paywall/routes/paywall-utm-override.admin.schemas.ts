import { z } from "zod";
import { mediaUrl } from "@api/shared/schemas";
import {
  MAX_OVERRIDE_BENEFITS,
  OVERRIDE_LOCALES,
} from "@api/core/paywall/services/paywall-override.types";
import { heroMediaType, paywallMediaId } from "./paywall.admin.schemas.js";

/**
 * Zod schemas for `/admin/paywall/utm-overrides/*` — the CMS surface that
 * replaced the hardcoded campaign map.
 *
 * Tagged `admin` by `registerAdminRoute`, so TAM-85's filter keeps every schema
 * here out of `openapi.public.json` and therefore out of the Dart codegen.
 *
 * ── WHY THE BODY IS TYPED AND NOT A FREE `z.any()` JSON ────────────────────
 * The column is JSONB and the read path narrows defensively, so a loose schema
 * would still be SAFE. It would just be unusable: an editor who typos
 * `payNowCTA` would save successfully, see nothing change on the app, and have
 * no way to find out why. Validating the document here is what turns that into
 * a 400 naming the field. The read-path narrowing stays regardless — it covers
 * rows written before a field existed, and psql.
 */

/**
 * The single hero asset for one locale.
 *
 * Not a list: the default paywall carries exactly ONE `paywall_hero_media` row
 * per locale (verified on stage 2026-08-19). A list would let a campaign author
 * a carousel the `card_hero` layout cannot render.
 */
const OverrideMedia = z
  .object({
    mediaType: heroMediaType,
    url: mediaUrl,
    thumbnailUrl: mediaUrl.nullable().default(null),
    mediaId: paywallMediaId,
  })
  .strict();

/**
 * One benefit tile in a campaign's list.
 *
 * `icon` is an ICON KEY the client maps to a BUNDLED asset — `benefit-mandir.png`
 * and the seven others the app ships — never a URL, which is why it is not a
 * `mediaField` and carries no upload. Validated as a shape only: WHICH keys a
 * given build bundles is the app's business and changes on its own release
 * cadence, so pinning the list here would reject a key a newer APK ships. The
 * CMS offers the paywall's own keys as a fixed choice, which is where a typo is
 * actually prevented.
 */
const OverrideBenefit = z
  .object({
    benefitId: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, "must be a lowercase id like `aarti_bhajans`"),
    icon: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9][a-z0-9._-]*$/, "must be a bundled icon key like `benefit-mandir.png`"),
    name: z.string().trim().min(1).max(60),
  })
  .strict();

/**
 * One locale's overrides — the hero asset and the benefit list. Every field
 * optional; omitting one means "keep whatever the CMS says", which is what makes
 * this a patch rather than a second paywall to maintain.
 *
 * `benefits` REPLACES the paywall's list rather than patching it, so its order
 * IS the render order and a campaign can show three of the eight. `.min(1)`
 * because an empty array would mean "show no benefits at all", which reads as a
 * broken build rather than a campaign — omit the key to keep the standard list.
 *
 * Duplicate `benefitId`s are rejected: the app reports impressions under that
 * id, so two tiles sharing one would double-count a benefit in the warehouse.
 *
 * The four `paywall_translations` copy fields (`title`, `payNowCta`,
 * `cancelAnytimeText`, `refundPolicyText`) are deliberately absent — the
 * product's own voice, not a campaign's. So is the deprecated
 * `videoUrl`/`videoThumbnailUrl`/`videoId` triple: the response DERIVES it from
 * the hero, and accepting it here would let an editor put the flat fields and
 * the hero out of step — old builds showing one video and new builds another.
 */
const OverrideLocale = z
  .object({
    media: OverrideMedia.optional(),
    benefits: z
      .array(OverrideBenefit)
      .min(1)
      .max(MAX_OVERRIDE_BENEFITS)
      .refine(
        (rows) => new Set(rows.map((row) => row.benefitId)).size === rows.length,
        "each benefit may appear only once"
      )
      .optional(),
  })
  .strict();

/**
 * The patch document: locale → what that locale shows.
 *
 * Keys are `OVERRIDE_LOCALES` (`hi` | `en`) — the only two the default paywall
 * has content in, and therefore the only two a served locale can resolve to.
 *
 * `partialRecord`, NOT `record`: in Zod 4 a record keyed by an ENUM is
 * EXHAUSTIVE, so `z.record(…)` would demand BOTH locales and a Hindi-only
 * campaign — the normal case — would be a 400 naming the English block it had
 * not written. `partialRecord` keeps the key validated (an unsupported locale
 * is still rejected) while letting the map stay the sparse patch it is meant
 * to be.
 *
 * `.strict()` throughout, because a key nobody reads is a silent no-op, and
 * this schema exists precisely so that a silent no-op becomes a 400.
 */
export const PaywallOverrideDocument = z
  .object({
    locales: z.partialRecord(z.enum(OVERRIDE_LOCALES), OverrideLocale),
  })
  .strict();

/**
 * The ad group name, matched EXACTLY against the referral row's `adgroup_name`.
 *
 * Deliberately NOT slug-constrained the way `paywallIdParam` is. This string is
 * chosen in the ad platform, not by us — it routinely contains spaces, capitals
 * and punctuation — and a match is only ever an equality check on a key we
 * never mint. Constraining the shape here would reject real ad groups and buy
 * nothing: the value is a lookup key, never a path segment or an identifier.
 */
export const utmGroupName = z.string().trim().min(1).max(200);

export const AdminUtmOverrideParams = z.object({ id: z.uuid() }).strict();
export type AdminUtmOverrideParamsInput = z.infer<typeof AdminUtmOverrideParams>;

export const AdminUtmOverrideCreateBody = z
  .object({
    utmGroup: utmGroupName,
    enabled: z.boolean().default(true),
    overrides: PaywallOverrideDocument,
  })
  .strict();
export type AdminUtmOverrideCreateInput = z.infer<typeof AdminUtmOverrideCreateBody>;

/** Every field optional — omitted means untouched. */
export const AdminUtmOverridePatchBody = z
  .object({
    utmGroup: utmGroupName.optional(),
    enabled: z.boolean().optional(),
    overrides: PaywallOverrideDocument.optional(),
  })
  .strict();
export type AdminUtmOverridePatchInput = z.infer<typeof AdminUtmOverridePatchBody>;

/**
 * The READ shape of the same document — deliberately NOT `PaywallOverrideDocument`.
 *
 * `serializerCompiler` VALIDATES responses, so re-emitting a stored blob through
 * the write schema means a single value that schema would have rejected — a URL
 * minted under a previous `MEDIA_PUBLIC_BASE_URL`, a psql edit, a field whose cap
 * tightened since the row was written — 500s the WHOLE list AND the by-id read,
 * locking every campaign out of the only UI that could repair it. The app is
 * unaffected, so the surface that must survive does, and the recovery tool dies.
 *
 * There is nothing left to re-check here anyway: `parsePaywallOverride` has
 * already narrowed the blob — locales to `hi`/`en`, `mediaType` to the enum,
 * blank strings and media missing a `url`/`mediaId` dropped. What survives is
 * exactly this: strings, unconstrained. Validate on the way IN, tolerate on the
 * way OUT.
 */
const OverrideMediaView = z.object({
  mediaType: heroMediaType,
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  mediaId: z.string(),
});

const OverrideBenefitView = z.object({
  benefitId: z.string(),
  icon: z.string(),
  name: z.string(),
});

const OverrideLocaleView = z.object({
  media: OverrideMediaView.optional(),
  benefits: z.array(OverrideBenefitView).optional(),
});

const PaywallOverrideDocumentView = z.object({
  locales: z.partialRecord(z.enum(OVERRIDE_LOCALES), OverrideLocaleView),
});

/**
 * The response view. `overrides` uses the tolerant read schema above, never the
 * write one — see why directly overhead.
 */
const AdminUtmOverrideView = z
  .object({
    id: z.uuid(),
    utmGroup: z.string(),
    enabled: z.boolean(),
    overrides: PaywallOverrideDocumentView,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminUtmOverrideView" });

function adminEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

export const AdminUtmOverrideResponse = adminEnvelope(AdminUtmOverrideView).meta({
  id: "AdminUtmOverrideResponse",
});

export const AdminUtmOverrideListResponse = adminEnvelope(
  z.array(AdminUtmOverrideView)
).meta({ id: "AdminUtmOverrideListResponse" });

export const AdminUtmOverrideDeleteResponse = adminEnvelope(z.null()).meta({
  id: "AdminUtmOverrideDeleteResponse",
});
