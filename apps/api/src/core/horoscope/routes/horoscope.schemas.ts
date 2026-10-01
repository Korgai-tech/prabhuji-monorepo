import { z } from "zod";
import { localeQuery, mediaUrl } from "@api/shared/schemas";
import { STEP_CONTENT_TYPES, ZODIAC_SLUGS } from "@api/core/horoscope/types";

/**
 * Zod schemas for the Horoscope module (TAM-73) — the single source of truth for
 * the OpenAPI contract emitted by `pnpm nx run api:openapi` and the generated
 * TS + Dart clients.
 *
 * #EXPORT_CRITICAL: there is NO free-tier variant of the daily-result shape. The
 * result body (`steps` with `displayText`/`ttsText`) is only ever serialized for
 * a Pro caller — a free caller is stopped with a `403` ErrorEnvelope in the
 * service BEFORE any step is assembled, so no partial/preview payload exists to
 * leak. The zodiac grid is intentionally free and carries NO lock/Pro flags.
 */

// ---- requests -------------------------------------------------------------

/**
 * `GET /horoscope/zodiac-signs` query. `locale` is optional (defaults to `en`);
 * a plain ZodObject so `@fastify/swagger` emits the querystring param cleanly.
 */
export const ZodiacSignsQuery = z.object({
  ...localeQuery.shape,
});
export type ZodiacSignsQueryInput = z.infer<typeof ZodiacSignsQuery>;

/**
 * `GET /horoscope/daily` query. `zodiac` is the stable slug validated against the
 * 12-member enum (unknown → `400`); `locale` is a free string — an unsupported
 * locale is NOT an error, it triggers the hi→en fallback path.
 */
export const DailyQuery = z.object({
  zodiac: z.enum(ZODIAC_SLUGS),
  ...localeQuery.shape,
});
export type DailyQueryInput = z.infer<typeof DailyQuery>;

// ---- response components --------------------------------------------------

/** One zodiac grid card (FREE discovery — no lock badge, no Pro flag). */
export const ZodiacCardSchema = z
  .object({
    zodiacId: z.enum(ZODIAC_SLUGS),
    displayName: z.string(),
    sortOrder: z.number().int(),
  })
  .meta({ id: "HoroscopeZodiacCard" });

export const ZodiacSignsResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({ signs: z.array(ZodiacCardSchema) }),
  })
  .meta({ id: "HoroscopeZodiacSignsResponse" });

/** One resolved daily step (Pro-only payload). */
export const DailyStepSchema = z
  .object({
    stepId: z.string(),
    title: z.string(),
    displayText: z.string(),
    ttsText: z.string(),
    order: z.number().int(),
    contentType: z.enum(STEP_CONTENT_TYPES),
    ttsEnabled: z.boolean(),
  })
  .meta({ id: "HoroscopeDailyStep" });

/** Shared result-background media (placeholder URLs per TAM-56 Decision 2). */
export const HoroscopeMediaSchema = z
  .object({
    backgroundVideoUrl: mediaUrl,
    backgroundStaticFallbackUrl: mediaUrl,
  })
  .meta({ id: "HoroscopeMedia" });

export const DailyResultSchema = z
  .object({
    zodiacId: z.enum(ZODIAC_SLUGS),
    dateIst: z.string(),
    localeServed: z.string(),
    fallbackUsed: z.boolean(),
    steps: z.array(DailyStepSchema),
    media: HoroscopeMediaSchema,
  })
  .meta({ id: "HoroscopeDailyResult" });

export const DailyResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: DailyResultSchema,
  })
  .meta({ id: "HoroscopeDailyResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "HoroscopeErrorEnvelope" });
