import type {
  RingtonePreview,
  RingtoneShareInfo,
} from "@api/core/ringtone/types";

/**
 * Public facade for the Ringtone module (TAM-67).
 *
 * The ONLY surface sibling modules use to reach ringtone content — via
 * `performServiceCall("ringtone", …)`, never by importing this module's files.
 * Registered into `GlobalServiceMap` from the composition root.
 *
 * Exposes a minimal read surface: a compact `getPreview` and share metadata
 * (`getForShare`) for a cross-module share sheet (TAM-68 builds the native UI;
 * the API supplies the fields). The audio/preview URLs are intentionally absent —
 * entitlement gating is per-request and owned by the ringtone module's own HTTP
 * surface, never resolved for a sibling caller.
 */
export interface IRingtoneApi {
  /** Compact preview for a ringtone id, or `null` if unknown/inactive. */
  getPreview(id: string): Promise<RingtonePreview | null>;

  /** Share metadata for a ringtone id, or `null` if unknown/inactive. */
  getForShare(id: string): Promise<RingtoneShareInfo | null>;
}
