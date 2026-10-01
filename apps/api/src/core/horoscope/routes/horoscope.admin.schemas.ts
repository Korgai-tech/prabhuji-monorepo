import { z } from "zod";
import { LanguageCodeSchema } from "@api/shared/language.schema";
import {
  adminPaginationQuery,
  adminPagedEnvelope,
  mediaUrl,
  sortQuery,
} from "@api/shared/schemas";
import {
  DAILY_RESULT_SORT_FIELDS,
  HOROSCOPE_MODE_SORT_FIELDS,
  HOROSCOPE_SAFETY_CATEGORIES,
  MEDIA_ASSET_SORT_FIELDS,
  STEP_CONFIG_SORT_FIELDS,
  STEP_CONTENT_TYPES,
  ZODIAC_SLUGS,
  ZODIAC_SORT_FIELDS,
} from "@api/core/horoscope/types";

/**
 * Zod schemas for the `/admin/horoscope/*` write surface (TAM-100; ADR §C1–C5).
 * Single source of truth for the OpenAPI contract; every operation is tagged
 * `admin` by `registerAdminRoute`, so TAM-85's filter drops it from
 * `openapi.public.json` (it must never reach the mobile Dart codegen).
 *
 * **This module diverges from every convention in the epic and admin MUST match
 * what exists (TAM-73) — do NOT "fix" it here:**
 *   - liveness flag is **`enabled`**, NOT `isActive`;
 *   - localization is a **Json `{locale:text}` map**, NOT translation tables —
 *     shape-validated below, NEVER `z.any()`;
 *   - identity is a **business-key string** (`zodiacId`/`modeId`/`stepId`/
 *     `assetKey`), immutable in `PATCH`;
 *   - `dateIst` is a **civil IST date string** (`YYYY-MM-DD`) — never parsed to
 *     a timestamp;
 *   - the determinism key `(zodiacId, modeId, dateIst, languageCode)` is the
 *     module's core invariant — all four components immutable in `PATCH`.
 */

// ---------------------------------------------------------------------------
// shared primitives
// ---------------------------------------------------------------------------

/**
 * The optimistic-concurrency precondition (ADR §C3): the client's last-known
 * `updatedAt`, echoed on every mutating write. The repository puts it in the
 * `WHERE` of an `updateMany`/`deleteMany`; a 0-count means someone else wrote
 * first → 409 `STALE_WRITE`. ISO-8601 on the wire; the service parses it.
 */
export const expectedUpdatedAt = z.string().datetime();

/**
 * A `{ locale: text }` localization map (the module's pre-existing divergence
 * from translation tables; TAM-73). Keys are 2-letter ISO-639-1 locale codes;
 * values are non-empty bounded strings. **NEVER `z.any()`** — an arbitrary blob
 * reaching the client is a rendering bug with no server error. At least one
 * entry is required (an empty map localizes nothing).
 */
const localeCode = z
  .string()
  .regex(/^[a-z]{2}$/, "locale must be a 2-letter ISO-639-1 code");
const localizedValue = z.string().trim().min(1).max(500);
export const localeMap = z
  .record(localeCode, localizedValue)
  .refine((m) => Object.keys(m).length > 0, {
    message: "at least one locale entry is required",
  });

/** `contentType` — the exact renderable set (an unknown value has no renderer). */
export const stepContentType = z.enum(STEP_CONTENT_TYPES);

/**
 * `safetyCategory` — the bucket `validateContentSafety` classifies against.
 * Validated against the known deny-list buckets: a wrong bucket weakens a
 * content-safety check (the one field here with a safety consequence). #EXPORT_CRITICAL.
 */
export const safetyCategory = z.enum(HOROSCOPE_SAFETY_CATEGORIES);

/**
 * `dateIst` — a **civil IST date** `"YYYY-MM-DD"`, validated strictly at the
 * boundary. It is a string, not a `DateTime`, deliberately (a civil date, not
 * an instant); the module's IST time model is load-bearing. Do NOT parse it.
 */
export const dateIst = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "dateIst must be a civil IST date 'YYYY-MM-DD'")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), {
    message: "dateIst must be a real calendar date",
  });

/**
 * Result/step language code. The Phase-1 client languages (`LanguageCodeSchema`)
 * plus the `en` fallback the public read path resolves against (TAM-73/74).
 */
export const resultLanguageCode = z.enum(["en", ...LanguageCodeSchema.options]);

/** One ordered step inside a `DailyHoroscopeResult.steps` Json array. */
export const resultStep = z
  .object({
    stepId: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(200),
    displayText: z.string().trim().min(1).max(4000),
    ttsText: z.string().trim().min(1).max(4000),
    order: z.number().int().nonnegative(),
    contentType: stepContentType,
  })
  .strict();
export const resultSteps = z.array(resultStep).min(1);

// ---------------------------------------------------------------------------
// params
// ---------------------------------------------------------------------------

export const AdminHoroscopeIdParams = z.object({ id: z.uuid() });
export type AdminHoroscopeIdParamsInput = z.infer<typeof AdminHoroscopeIdParams>;

// ===========================================================================
// ZodiacSign — /admin/horoscope/zodiac-signs
// ===========================================================================

/**
 * `zodiacId` — a stable slug validated against the fixed twelve (`aries`…
 * `pisces`). There are exactly twelve zodiac signs and that is NOT a CMS
 * decision (resolves #PLAN_UNCERTAINTY: validate at the boundary). A free string
 * permits a typo'd sign that `DailyHoroscopeResult` rows can never match (no FK).
 * Immutable in `PATCH`. #EXPORT_CRITICAL.
 */
export const zodiacIdSlug = z.enum(ZODIAC_SLUGS);

export const AdminZodiacListQuery = adminPaginationQuery
  .extend(sortQuery(ZODIAC_SORT_FIELDS).shape)
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    enabled: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  });
export type AdminZodiacListQueryInput = z.infer<typeof AdminZodiacListQuery>;

export const AdminZodiacCreateBody = z
  .object({
    zodiacId: zodiacIdSlug,
    displayName: z.string().trim().min(1).max(64),
    localizedDisplayName: localeMap,
    iconAssetUrl: mediaUrl,
    sortOrder: z.number().int().default(0),
    enabled: z.boolean().default(true),
  })
  .strict()
  .meta({ id: "AdminZodiacCreateBody" });
export type AdminZodiacCreateInput = z.infer<typeof AdminZodiacCreateBody>;

/** No `zodiacId`: immutable business key (rejected by `.strict()`). */
export const AdminZodiacPatchBody = z
  .object({
    expectedUpdatedAt,
    displayName: z.string().trim().min(1).max(64).optional(),
    localizedDisplayName: localeMap.optional(),
    iconAssetUrl: mediaUrl.optional(),
    sortOrder: z.number().int().optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .meta({ id: "AdminZodiacPatchBody" });
export type AdminZodiacPatchInput = z.infer<typeof AdminZodiacPatchBody>;

/** `DELETE` = deactivate (`enabled = false`); reversible via `PATCH`. */
export const AdminZodiacDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminZodiacDeleteBody" });
export type AdminZodiacDeleteInput = z.infer<typeof AdminZodiacDeleteBody>;

export const AdminZodiacView = z
  .object({
    id: z.string(),
    zodiacId: z.string(),
    displayName: z.string(),
    localizedDisplayName: z.record(z.string(), z.string()),
    iconAssetUrl: mediaUrl,
    sortOrder: z.number().int(),
    enabled: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminZodiacView" });

// ===========================================================================
// HoroscopeMode — /admin/horoscope/modes
// ===========================================================================

/** `modeId` — `@unique` business key (`daily_horoscope`); immutable in `PATCH`. */
export const modeIdKey = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:_[a-z0-9]+)*$/,
    "modeId must be lowercase alphanumerics separated by single underscores"
  );

export const AdminModeListQuery = adminPaginationQuery
  .extend(sortQuery(HOROSCOPE_MODE_SORT_FIELDS).shape)
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    enabled: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    phase: z.coerce.number().int().optional(),
  });
export type AdminModeListQueryInput = z.infer<typeof AdminModeListQuery>;

export const AdminModeCreateBody = z
  .object({
    modeId: modeIdKey,
    modeName: z.string().trim().min(1).max(120),
    phase: z.number().int().default(1),
    enabled: z.boolean().default(true),
  })
  .strict()
  .meta({ id: "AdminModeCreateBody" });
export type AdminModeCreateInput = z.infer<typeof AdminModeCreateBody>;

/** No `modeId`: immutable business key. */
export const AdminModePatchBody = z
  .object({
    expectedUpdatedAt,
    modeName: z.string().trim().min(1).max(120).optional(),
    phase: z.number().int().optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .meta({ id: "AdminModePatchBody" });
export type AdminModePatchInput = z.infer<typeof AdminModePatchBody>;

export const AdminModeDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminModeDeleteBody" });
export type AdminModeDeleteInput = z.infer<typeof AdminModeDeleteBody>;

export const AdminModeView = z
  .object({
    id: z.string(),
    modeId: z.string(),
    modeName: z.string(),
    enabled: z.boolean(),
    phase: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminModeView" });

// ===========================================================================
// HoroscopeStepConfig — /admin/horoscope/steps (DATA-DRIVEN ordered steps)
// ===========================================================================

/** `stepId` — a stable config key; uniqueness is per-`(modeId, stepId)`. */
export const stepIdKey = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:_[a-z0-9]+)*$/,
    "stepId must be lowercase alphanumerics separated by single underscores"
  );

/** `providerMapping` — the key the provider maps a step to; non-empty bounded. */
export const providerMapping = z.string().trim().min(1).max(120);

export const AdminStepListQuery = adminPaginationQuery
  .extend(sortQuery(STEP_CONFIG_SORT_FIELDS).shape)
  .extend({
    modeId: z.string().trim().min(1).max(64).optional(),
    enabled: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  });
export type AdminStepListQueryInput = z.infer<typeof AdminStepListQuery>;

export const AdminStepCreateBody = z
  .object({
    stepId: stepIdKey,
    modeId: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(200),
    localizedTitle: localeMap,
    order: z.number().int().nonnegative(),
    contentType: stepContentType,
    providerMapping,
    safetyCategory,
    ttsEnabled: z.boolean().default(true),
    enabled: z.boolean().default(true),
  })
  .strict()
  .meta({ id: "AdminStepCreateBody" });
export type AdminStepCreateInput = z.infer<typeof AdminStepCreateBody>;

/** No `stepId`/`modeId`: immutable business keys. */
export const AdminStepPatchBody = z
  .object({
    expectedUpdatedAt,
    title: z.string().trim().min(1).max(200).optional(),
    localizedTitle: localeMap.optional(),
    order: z.number().int().nonnegative().optional(),
    contentType: stepContentType.optional(),
    providerMapping: providerMapping.optional(),
    safetyCategory: safetyCategory.optional(),
    ttsEnabled: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .meta({ id: "AdminStepPatchBody" });
export type AdminStepPatchInput = z.infer<typeof AdminStepPatchBody>;

export const AdminStepDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminStepDeleteBody" });
export type AdminStepDeleteInput = z.infer<typeof AdminStepDeleteBody>;

export const AdminStepView = z
  .object({
    id: z.string(),
    stepId: z.string(),
    modeId: z.string(),
    title: z.string(),
    localizedTitle: z.record(z.string(), z.string()),
    order: z.number().int(),
    enabled: z.boolean(),
    contentType: stepContentType,
    providerMapping: z.string(),
    ttsEnabled: z.boolean(),
    safetyCategory: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminStepView" });

// ===========================================================================
// DailyHoroscopeResult — /admin/horoscope/results (the Phase-1 product)
// ===========================================================================

export const AdminResultListQuery = adminPaginationQuery
  .extend(sortQuery(DAILY_RESULT_SORT_FIELDS).shape)
  .extend({
    zodiacId: z.string().trim().min(1).max(64).optional(),
    modeId: z.string().trim().min(1).max(64).optional(),
    dateIst: dateIst.optional(),
    dateFrom: dateIst.optional(),
    dateTo: dateIst.optional(),
    languageCode: resultLanguageCode.optional(),
  });
export type AdminResultListQueryInput = z.infer<typeof AdminResultListQuery>;

/**
 * `contentSafetyStatus` is NOT accepted from the client — it is SERVER-COMPUTED
 * (resolves #PLAN_UNCERTAINTY): the service re-runs `validateContentSafety` over
 * every step and sets `"passed"` only when all steps pass, else 400. An
 * admin-settable value would be an admin-forged safety attestation. #EXPORT_CRITICAL.
 */
export const AdminResultCreateBody = z
  .object({
    zodiacId: zodiacIdSlug,
    modeId: z.string().trim().min(1).max(64),
    dateIst,
    languageCode: resultLanguageCode,
    steps: resultSteps,
    providerName: z.string().trim().min(1).max(64).default("cms"),
    generatedAt: z.string().datetime().optional(),
  })
  .strict()
  .meta({ id: "AdminResultCreateBody" });
export type AdminResultCreateInput = z.infer<typeof AdminResultCreateBody>;

/**
 * No `zodiacId`/`modeId`/`dateIst`/`languageCode`: all four determinism-key
 * components are immutable — changing one is "a different day's horoscope", i.e.
 * a create, not an update. `contentSafetyStatus` stays server-computed.
 */
export const AdminResultPatchBody = z
  .object({
    expectedUpdatedAt,
    steps: resultSteps.optional(),
    providerName: z.string().trim().min(1).max(64).optional(),
    generatedAt: z.string().datetime().optional(),
  })
  .strict()
  .meta({ id: "AdminResultPatchBody" });
export type AdminResultPatchInput = z.infer<typeof AdminResultPatchBody>;

/** `DELETE` is a genuine HARD delete (dated leaf content; no liveness flag). */
export const AdminResultDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminResultDeleteBody" });
export type AdminResultDeleteInput = z.infer<typeof AdminResultDeleteBody>;

export const AdminResultView = z
  .object({
    id: z.string(),
    zodiacId: z.string(),
    modeId: z.string(),
    dateIst: z.string(),
    languageCode: z.string(),
    steps: z.array(resultStep),
    providerName: z.string(),
    generatedAt: z.string().datetime(),
    contentSafetyStatus: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminResultView" });

// ===========================================================================
// MediaAsset — /admin/horoscope/media-assets (horoscope-owned; NOT TAM-84)
// ===========================================================================

/** `assetKey` — `@unique` stable idempotent config key; immutable in `PATCH`. */
export const assetKey = z.string().trim().min(1).max(120);

export const AdminMediaAssetListQuery = adminPaginationQuery
  .extend(sortQuery(MEDIA_ASSET_SORT_FIELDS).shape)
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
  });
export type AdminMediaAssetListQueryInput = z.infer<
  typeof AdminMediaAssetListQuery
>;

export const AdminMediaAssetCreateBody = z
  .object({
    assetKey,
    resultBackgroundVideoUrl: mediaUrl,
    resultBackgroundStaticFallbackUrl: mediaUrl,
    assetVersion: z.number().int().positive().default(1),
  })
  .strict()
  .meta({ id: "AdminMediaAssetCreateBody" });
export type AdminMediaAssetCreateInput = z.infer<
  typeof AdminMediaAssetCreateBody
>;

/** No `assetKey`: immutable business key. */
export const AdminMediaAssetPatchBody = z
  .object({
    expectedUpdatedAt,
    resultBackgroundVideoUrl: mediaUrl.optional(),
    resultBackgroundStaticFallbackUrl: mediaUrl.optional(),
    assetVersion: z.number().int().positive().optional(),
  })
  .strict()
  .meta({ id: "AdminMediaAssetPatchBody" });
export type AdminMediaAssetPatchInput = z.infer<
  typeof AdminMediaAssetPatchBody
>;

export const AdminMediaAssetView = z
  .object({
    id: z.string(),
    assetKey: z.string(),
    resultBackgroundVideoUrl: mediaUrl,
    resultBackgroundStaticFallbackUrl: mediaUrl,
    assetVersion: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: "AdminMediaAssetView" });

// ---------------------------------------------------------------------------
// response envelopes
// ---------------------------------------------------------------------------

/**
 * Single-item admin success envelope. Defined locally (rather than importing
 * another module's `envelope`) so the horoscope module owns its own contract.
 */
function adminEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

export const AdminZodiacResponse = adminEnvelope(AdminZodiacView).meta({
  id: "AdminZodiacResponse",
});
export const AdminZodiacListResponse = adminPagedEnvelope(AdminZodiacView).meta({
  id: "AdminZodiacListResponse",
});
export const AdminModeResponse = adminEnvelope(AdminModeView).meta({
  id: "AdminModeResponse",
});
export const AdminModeListResponse = adminPagedEnvelope(AdminModeView).meta({
  id: "AdminModeListResponse",
});
export const AdminStepResponse = adminEnvelope(AdminStepView).meta({
  id: "AdminStepResponse",
});
export const AdminStepListResponse = adminPagedEnvelope(AdminStepView).meta({
  id: "AdminStepListResponse",
});
export const AdminResultResponse = adminEnvelope(AdminResultView).meta({
  id: "AdminResultResponse",
});
export const AdminResultListResponse = adminPagedEnvelope(AdminResultView).meta({
  id: "AdminResultListResponse",
});
export const AdminResultDeleteResponse = adminEnvelope(z.null()).meta({
  id: "AdminResultDeleteResponse",
});
export const AdminMediaAssetResponse = adminEnvelope(AdminMediaAssetView).meta({
  id: "AdminMediaAssetResponse",
});
export const AdminMediaAssetListResponse = adminPagedEnvelope(
  AdminMediaAssetView
).meta({ id: "AdminMediaAssetListResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "AdminHoroscopeErrorEnvelope" });
