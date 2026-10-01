import type {
  DownloadSource,
  MantraPlaylistSource,
  MantraShareInfo,
  MantraSummary,
} from "@api/core/mantras/types";

/**
 * Public facade for the Mantras & Stutis module (TAM-65).
 *
 * The ONLY surface sibling modules use to reach mantra content — via
 * `performServiceCall("mantras", …)`, never by importing this module's files.
 * Registered into `GlobalServiceMap` from the composition root.
 *
 * Exposes a minimal read surface: a compact `getItemSummary`, share metadata
 * (`getItemForShare`) for a cross-module share sheet, and server-resolved
 * `resolvePlaylist` so a sibling can prefetch "what plays next" without
 * duplicating the ordering rules. The stream URL is intentionally absent —
 * entitlement gating is per-request and owned by the mantras module's own HTTP
 * surface, never resolved for a sibling caller.
 */
export interface IMantrasApi {
  /** Compact summary for a content id, or `null` if unknown/inactive. */
  getItemSummary(id: string): Promise<MantraSummary | null>;

  /** Share metadata for a content id, or `null` if unknown/inactive. */
  getItemForShare(id: string): Promise<MantraShareInfo | null>;

  /** The ordered playlist (compact summaries) for a surface — never a stream URL. */
  resolvePlaylist(params: {
    source: MantraPlaylistSource;
    sourceId?: string;
    userId: string;
  }): Promise<MantraSummary[]>;

  /**
   * TAM-125 downloads: resolve the object key + download metadata for a mantra
   * id, or `null` if unknown/inactive. Same contract as the aarti facade — the
   * downloads service is the caller and does the entitlement gate BEFORE this
   * lookup.
   */
  getDownloadSource(id: string): Promise<DownloadSource | null>;
}
