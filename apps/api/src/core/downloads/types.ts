/**
 * Downloads module public types (TAM-125).
 *
 * The Downloads module owns the Pro-only manifest endpoint
 * (`GET /content/:type/:id/download`). It is a THIN orchestrator: entitlement
 * gate → cross-module content lookup (aarti / mantras) → media presign. It
 * owns no persistent state in Phase 1 (a per-device index file replaces a DB
 * registry; the "restore downloads" affordance is Phase 2 — see spec §q2).
 *
 * Wire-facing shapes live in `routes/downloads.schemas.ts`; these are the
 * internal shapes the service / controller pass between themselves.
 */

/** The wire-facing content-type enum, hardcoded per #EXPORT_CRITICAL. */
export const DOWNLOAD_CONTENT_TYPES = ["aarti", "bhajan", "mantra"] as const;
export type DownloadContentType = (typeof DOWNLOAD_CONTENT_TYPES)[number];

/**
 * Args to `DownloadsService.getDownloadManifest` — JWT subject + validated
 * path params (the route's Zod schema has already checked `type` + `id`).
 */
export interface DownloadManifestArgs {
  userId: string;
  type: DownloadContentType;
  id: string;
}

/** The manifest payload returned to the controller (Zod-validated on output). */
export interface DownloadManifest {
  signedUrl: string;
  sizeBytes: number;
  durationMs: number | null;
  checksum: string | null;
  /** ISO-8601 UTC. */
  expiresAt: string;
}
