-- TAM-125 — downloads-manifest metadata.
--
-- ADDITIVE: three nullable columns on each of `audio_items` (aarti + bhajan
-- share this table) and `mantra_audio_items`. No existing columns change; an
-- OLD task rolling alongside a NEW one keeps working (it simply never reads or
-- writes the new columns).
--
-- WHY: `GET /content/:type/:id/download` must return `{ sizeBytes, durationMs,
-- checksum }` alongside a short-TTL signed URL so the mobile client can size
-- the download, show `type · duration · size` in the library row, and verify
-- the file after transfer. None of that lives on the current audio row (only
-- `audio_stream_url` / `audio_url` does), so the manifest endpoint cannot be
-- populated from data that doesn't exist yet. This migration IS the data
-- surface.
--
-- Nullability, per column:
--   - `size_bytes` — filled by a S3 HEAD-object backfill
--     (`apps/api/src/core/downloads/scripts/backfill-download-metadata.ts`).
--     Nullable during the backfill window; the manifest service treats
--     `NULL` as "not yet indexed" and refuses to mint a URL (avoids handing the
--     client a signed URL for an object we can't size-verify).
--   - `duration_ms` — probed from S3 `x-amz-meta-duration-ms` when present,
--     otherwise left `NULL`. The manifest Zod schema is `.nullable()` and the
--     mobile client falls back to `just_audio`'s local probe on first play, so
--     `NULL` here is a legitimate steady state, not just a backfill-window
--     artifact.
--   - `checksum` — lowercase-hex SHA-256 of the source object (64 chars). The
--     backfill prefers S3 `ETag` when the bucket is configured for SHA-256
--     (single-part upload with the SHA-256 checksum algorithm); on any other
--     ETag shape the backfill skips checksum for that row rather than
--     re-hashing multi-GB objects. Mobile checksum-verifies after download; a
--     mismatch is treated as `failure_reason: server_error` with a retry, so a
--     row that reaches production with `checksum = NULL` degrades to
--     "download without post-verify" — not a crash.
--
-- Not indexed: nothing filters on any of these three columns; they are pure
-- payload for the manifest response, so an index would only add write cost.

-- AlterTable
ALTER TABLE "audio_items"
  ADD COLUMN "size_bytes"  BIGINT,
  ADD COLUMN "duration_ms" INTEGER,
  ADD COLUMN "checksum"    TEXT;

-- AlterTable
ALTER TABLE "mantra_audio_items"
  ADD COLUMN "size_bytes"  BIGINT,
  ADD COLUMN "duration_ms" INTEGER,
  ADD COLUMN "checksum"    TEXT;
