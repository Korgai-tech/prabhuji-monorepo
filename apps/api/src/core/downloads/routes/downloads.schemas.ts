import { z } from "zod";

/**
 * Zod schemas for the Downloads module (TAM-125) — the single source of truth
 * for the OpenAPI contract emitted by `pnpm nx run api:openapi` and the
 * generated TS + Dart clients.
 *
 * #EXPORT_CRITICAL:
 *   - `type` is a HARDCODED enum (`aarti | bhajan | mantra`). Adding a fourth
 *     kind requires an explicit schema change (audit trail).
 *   - `signedUrl` is minted by the SERVICE only when the caller passed the Pro
 *     entitlement gate. This schema does NOT model a null variant — a free /
 *     lapsed caller receives a `403 ErrorEnvelope`, not a `200` with a null URL.
 *   - `durationMs` is nullable while the data-engineer backfill lands (spec
 *     §Database Tasks); the mobile client falls back to a local `just_audio`
 *     probe on `null`. Tighten to non-nullable in a follow-up once the backfill
 *     is 100% on prod.
 */

/** Path params for `GET /content/:type/:id/download`. */
export const DownloadPathParams = z.object({
  /** Client display label — echoed back on the response for analytics. */
  type: z.enum(["aarti", "bhajan", "mantra"]),
  /** Content uuid (aarti/bhajan share `audio_items`; mantra hits `mantra_audio_items`). */
  id: z.string().uuid(),
});
export type DownloadPathParamsInput = z.infer<typeof DownloadPathParams>;

/**
 * The download manifest payload (`data` inside the success envelope).
 *
 * `.meta({ id: "DownloadManifest" })` makes it a named OpenAPI component so
 * the Dart generator emits ONE `DownloadManifest` model (not an anonymous
 * struct per endpoint). Its `id` collides with nothing — see
 * `apps/api/openapi.json` for the reserved namespace.
 */
export const DownloadManifest = z
  .object({
    /** Short-TTL (5 min) presigned GET the client fetches directly from S3. */
    signedUrl: z.string().url(),
    /** Byte length of the source object; a positive int, safe for audio (`< 2^53`). */
    // Accepts 0 when the row hasn't been backfilled yet on stage/prod — the
    // mobile client treats 0 as "unknown size" and uses the actual bytes
    // streamed from S3 to derive the real size after completion. Downloads
    // work end-to-end without waiting on the backfill script; the only UX
    // degradation is that the progress ring stays indeterminate during the
    // download of a not-yet-backfilled row.
    sizeBytes: z.number().int().nonnegative(),
    /**
     * Duration in milliseconds — nullable while backfill lands. The mobile
     * client falls back to a local `just_audio` probe on first play.
     */
    durationMs: z.number().int().nonnegative().nullable(),
    /**
     * Lowercase-hex SHA-256 of the source object (64 chars) — nullable while
     * backfill lands. The mobile client verifies after download and treats a
     * mismatch as `failure_reason: server_error` (with a retry).
     */
    checksum: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    /** ISO-8601 UTC expiry of `signedUrl` (mint time + `PRESIGN_TTL_SECONDS`). */
    expiresAt: z.string().datetime(),
  })
  .meta({ id: "DownloadManifest" });
export type DownloadManifestInput = z.infer<typeof DownloadManifest>;

/**
 * The `{success, message, data}` success envelope for the manifest endpoint.
 * `.meta({ id: "DownloadManifestResponse" })` names the OpenAPI component so
 * downstream generators can emit a stable wrapper type.
 */
export const DownloadManifestResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: DownloadManifest,
  })
  .meta({ id: "DownloadManifestResponse" });

/**
 * Standard error envelope — a per-module clone of the aarti/mantras shape so
 * the OpenAPI emitter has a distinct `id` per module (avoids component-name
 * collisions when the swagger generator flattens components).
 */
export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "DownloadsErrorEnvelope" });
