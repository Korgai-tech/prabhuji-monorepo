import { z } from "zod";
import {
  mediaUrl,
  pagedEnvelope,
  paginationQuery,
  requiredLocaleQuery,
} from "@api/shared/schemas";

/**
 * Zod schemas for `GET /deities?locale=<code>&cursor=&limit=` (TAM-57).
 *
 * Single source of truth for the OpenAPI contract emitted by
 * `pnpm nx run api:openapi` and the generated TS + Dart clients.
 *
 * The endpoint is cursor-paginated with the shared `paginationQuery` +
 * `pagedEnvelope` helpers — the deity taxonomy is small, but paginating it
 * exercises the repo-wide list convention end-to-end (the module tickets
 * TAM-61… copy this exact shape). `locale` reuses `LanguageCodeSchema` (the
 * eight Phase-1 client locales); the server resolves an `en` fallback
 * internally so `localeServed` never leaks a non-client locale onto the wire.
 */

// ---- request ---------------------------------------------------------------

/**
 * Inline (un-`.meta`-tagged) — `@fastify/swagger` can't resolve named refs for
 * querystring params. Merges the shared `paginationQuery` (cursor + limit) with
 * the required `locale`.
 */
export const DeityListQuery = paginationQuery.extend(requiredLocaleQuery.shape);

export type DeityListQueryInput = z.infer<typeof DeityListQuery>;

// ---- response components ---------------------------------------------------

export const DeityView = z
  .object({
    slug: z.string(),
    displayName: z.string(),
    iconUrl: mediaUrl,
    sortOrder: z.number().int(),
  })
  .meta({ id: "DeityView" });

export const DeityListResponse = pagedEnvelope(DeityView).meta({
  id: "DeityListResponse",
});

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "DeityErrorEnvelope" });
