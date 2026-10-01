import type { AudioSummary, DownloadSource } from "@api/core/aarti/types";

/**
 * Public facade for the Aarti & Bhajans module (TAM-63).
 *
 * The ONLY surface sibling modules use to reach aarti content — via
 * `performServiceCall("aarti", …)`, never by importing this module's files.
 * Registered into `GlobalServiceMap` from the composition root.
 *
 * Home (TAM-61) references aarti audio by id and renders a compact card, so the
 * facade exposes a minimal `getAudioSummary`. The stream URL is intentionally
 * absent — entitlement gating is per-request and owned by the aarti module's
 * own HTTP surface, never resolved for a sibling caller.
 */
export interface IAartiApi {
  /** Compact summary for a content id, or `null` if unknown/inactive. */
  getAudioSummary(id: string): Promise<AudioSummary | null>;

  /**
   * TAM-125 downloads: resolve the object key + download metadata for an
   * aarti/bhajan id, or `null` if unknown/inactive. Downloads passes
   * `contentType` (`"aarti"` | `"bhajan"`) verbatim so the service can echo it
   * back on the response — aarti and bhajan share the same `AudioItem` table
   * (no discriminator column), so the DISPLAY label lives with the client.
   */
  getDownloadSource(
    id: string,
    contentType: "aarti" | "bhajan"
  ): Promise<DownloadSource | null>;
}
