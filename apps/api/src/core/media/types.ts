/**
 * Domain types for the media module (TAM-84). These are the shapes the service,
 * repositories, and the `IMediaApi` facade speak — kept free of Zod and Prisma
 * so every layer can import them.
 */

/** A `(module, entity, field)` triple identifying a media column. */
export interface MediaTarget {
  module: string;
  entity: string;
  field: string;
}

/** Presign request, after Zod validation at the route boundary. */
export interface PresignInput extends MediaTarget {
  /** The client's original filename — used for NOTHING that reaches the key. */
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** JWT subject of the presigning admin (`req.user.id`), never client-supplied. */
  uploadedBy: string;
}

/** Presign result returned to the admin browser. */
export interface PresignResult {
  /** The presigned S3 PUT URL. A 5-minute bearer write-capability — NEVER logged. */
  uploadUrl: string;
  /** The durable public (CDN) GET URL, built from `MEDIA_PUBLIC_BASE_URL`. */
  publicUrl: string;
  /** The immutable object key, `<module>/<entity>/<uuid>.<ext>`. */
  key: string;
  /** ISO-8601 expiry of `uploadUrl` (presign time + 5 minutes). */
  expiresAt: string;
  /**
   * The headers the PUT MUST carry, verbatim — every one of them is a SIGNED
   * header, so a missing or altered value is an S3 403 `SignatureDoesNotMatch`,
   * not a partial success.
   *
   * This is returned rather than left for the client to reconstruct because the
   * signature is built HERE: any client guessing the set is one server-side edit
   * away from silently 403ing every upload. That is not hypothetical — the SPA
   * sent only `Content-Type` while presign also signed `Cache-Control`, so no
   * browser upload could ever succeed against real S3 (floci does not enforce
   * signatures, which is why local dev never saw it).
   *
   * `Content-Length` is NOT here: the browser sets it from the body itself and
   * `xhr.setRequestHeader` is forbidden from touching it.
   */
  headers: Record<string, string>;
  /**
   * TAM-267. `true` when the upload is staged for the media optimizer: `uploadUrl`
   * then signs `incoming/<key>`, and the object at `key`/`publicUrl` appears only
   * once the optimizer has written it — the client polls `GET
   * /admin/media/status` until `ready` before saving `publicUrl`. `false` on the
   * direct path (flag off, or a field/extension that is never optimised), where
   * `uploadUrl` signs `key` itself exactly as before.
   */
  processing: boolean;
}

/** TAM-267 `GET /admin/media/status` — does the FINAL object exist yet? */
export interface MediaStatusResult {
  ready: boolean;
}

/** Optional behaviour switches for `MediaService`, resolved from env by the composition root. */
export interface MediaServiceOptions {
  /** `MEDIA_OPTIMIZE_UPLOADS` — stage optimisable uploads under `incoming/` (TAM-267). */
  optimizeUploads?: boolean;
}

/** Result of a HEAD against a stored object. */
export interface HeadResult {
  exists: boolean;
  contentType: string | null;
  sizeBytes: number | null;
  /**
   * S3 `ETag` with the surrounding double-quotes S3 wraps it in stripped away.
   * `null` if the object doesn't exist or ETag was absent. Optional so historical
   * callers that only care about `exists`/`contentType`/`sizeBytes` remain
   * source-compatible.
   *
   * (TAM-125) The downloads backfill uses this as a checksum candidate: for a
   * bucket configured with the SHA-256 checksum algorithm the ETag IS a
   * lowercase-hex SHA-256 (`^[0-9a-f]{64}$`) — otherwise (default MD5,
   * multipart-upload composite, etc.) the backfill skips the checksum rather
   * than re-hashing the object.
   */
  etag?: string | null;
  /**
   * User-defined S3 object metadata (the `x-amz-meta-*` headers), lowercased key
   * names with the `x-amz-meta-` prefix stripped by the AWS SDK. `null` if the
   * object doesn't exist. Optional so historical callers stay source-compatible.
   *
   * (TAM-125) The downloads backfill reads `duration-ms` from here when the
   * ingestion path stamped it at upload time; missing means the backfill leaves
   * `durationMs` null and the mobile client probes locally on first play.
   */
  metadata?: Record<string, string> | null;
}

/** Arguments the write-path ownership gate needs. */
export interface ValidateOwnedUrlInput extends MediaTarget {
  /** The `publicUrl` an admin submitted on an entity form. */
  url: string;
}

/** The signed headers S3 pins on a presigned PUT. */
export interface PresignPutParams {
  key: string;
  contentType: string;
  contentLength: number;
  cacheControl: string;
  expiresInSeconds: number;
}

/** Args for a presigned GET (TAM-125 downloads). No signable-headers. */
export interface PresignGetParams {
  key: string;
  expiresInSeconds: number;
}
