import type {
  WallpaperPreview,
  WallpaperShareInfo,
} from "@api/core/wallpaper/types";

/**
 * Public facade for the Wallpaper module (TAM-69).
 *
 * The ONLY surface sibling modules use to reach wallpaper content — via
 * `performServiceCall("wallpaper", …)`, never by importing this module's files.
 * Registered into `GlobalServiceMap` from the composition root.
 *
 * Exposes a minimal read surface: a compact `getPreview` and share metadata
 * (`getForShare`) for a cross-module share sheet / home embed. There is no
 * entitlement gating on wallpaper content, so these carry the FREE discovery
 * fields directly.
 */
export interface IWallpaperApi {
  /** Compact preview for a wallpaper id, or `null` if unknown/inactive. */
  getPreview(id: string): Promise<WallpaperPreview | null>;

  /** Share metadata for a wallpaper id, or `null` if unknown/inactive. */
  getForShare(id: string): Promise<WallpaperShareInfo | null>;
}
