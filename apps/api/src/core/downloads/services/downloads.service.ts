import { PRESIGN_TTL_SECONDS } from "@api/core/media/services";
import { resolveProEntitlement } from "@api/shared/entitlement";
import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";
import type {
  DownloadManifest,
  DownloadManifestArgs,
} from "@api/core/downloads/types";

const log = createModuleLogger("downloads:service");

/**
 * Downloads business logic (TAM-125) — Prisma-free, SDK-free.
 *
 * #EXPORT_CRITICAL: DOWNLOADS ARE A PRO BENEFIT. Every manifest fetch
 * re-resolves entitlement server-side (fail-CLOSED via `resolveProEntitlement`;
 * an error resolving the subscription facade is treated as FREE). The gate
 * throws BEFORE any existence check — a free caller is not told whether the id
 * exists (mirrors the aarti/mantras play gate).
 *
 * Responsibilities:
 *   1. Server-side entitlement re-check on EVERY request (never cached).
 *   2. Cross-module content lookup by type:
 *        - `aarti | bhajan` → `IAartiApi.getDownloadSource(id, type)` (same
 *          `AudioItem` row; `type` is a client display label echoed for
 *          analytics — see spec #PATH_DECISION on splitting aarti vs bhajan).
 *        - `mantra`         → `IMantrasApi.getDownloadSource(id)` (separate
 *          `MantraAudioItem` table).
 *      Both facades return `null` for unknown/inactive rows → `AppError(404)`.
 *   3. Mint a short-TTL presigned GET via `IMediaApi.presignGet(objectKey,
 *      PRESIGN_TTL_SECONDS)`. NEVER imports `S3MediaRepository` directly —
 *      that would cross the module boundary (`arch-boundaries.json` allows the
 *      `media` facade only). NEVER logs the returned URL.
 *   4. Compose `expiresAt = now + PRESIGN_TTL_SECONDS` as ISO-8601 UTC. The
 *     TTL on the wire is EXACTLY what `S3MediaRepository.presignGet` signed —
 *     any drift here means the client tries a URL after S3 already 403'd.
 */
export class DownloadsService {
  /**
   * `GET /content/:type/:id/download` — mint the download manifest for a Pro
   * caller. Throws `AppError` on any negative path (`403` free/lapsed, `404`
   * unknown id, `500` service unavailable / call failed via the shared helper).
   */
  async getDownloadManifest(args: DownloadManifestArgs): Promise<DownloadManifest> {
    const { userId, type, id } = args;

    // 1. Entitlement gate — throw BEFORE any existence check.
    const isPro = await resolveProEntitlement(userId, "downloads:entitlement");
    if (!isPro) {
      throw new AppError("Downloads are a Pro benefit", 403, "FORBIDDEN");
    }

    // 2. Cross-module content lookup. Aarti and bhajan share the single
    // AudioItem table (no discriminator); `type` is echoed for analytics.
    const source =
      type === "mantra"
        ? await performServiceCall(
            "mantras",
            (api) => api.getDownloadSource(id),
            "downloads:lookup",
            "mantras content lookup failed"
          )
        : await performServiceCall(
            "aarti",
            (api) => api.getDownloadSource(id, type),
            "downloads:lookup",
            "aarti content lookup failed"
          );

    if (!source) {
      throw new AppError("Content not found", 404, "NOT_FOUND");
    }

    // 3. Mint the presigned GET via the media facade — the SERVICE never
    // touches @aws-sdk/*, and the key was already stripped of the public
    // base URL by the source-owning module via IMediaApi.toKey.
    const signedUrl = await performServiceCall(
      "media",
      (api) => api.presignGet(source.objectKey, PRESIGN_TTL_SECONDS),
      "downloads:presign",
      "failed to mint download signed URL"
    );

    // 4. `expiresAt` is derived from the SAME TTL constant the signer used, so
    // wire time and S3-enforced time cannot drift.
    const expiresAt = new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000).toISOString();

    log.info(
      {
        event: "download_manifest_minted",
        user_id: userId,
        content_id: id,
        content_type: type,
        ttl_seconds: PRESIGN_TTL_SECONDS,
        // NEVER include signedUrl in a log line — it is a bearer read-capability.
      },
      "download manifest minted"
    );

    return {
      signedUrl,
      sizeBytes: source.sizeBytes,
      durationMs: source.durationMs,
      checksum: source.checksum,
      expiresAt,
    };
  }
}
