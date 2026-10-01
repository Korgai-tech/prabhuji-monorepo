import type { WallpaperService } from "@api/core/wallpaper/services";
import type {
  WallpaperPreview,
  WallpaperShareInfo,
} from "@api/core/wallpaper/types";
import type { IWallpaperApi } from "./wallpaper.api.js";

/**
 * Facade implementation — a thin passthrough to the module's `WallpaperService`
 * singleton built in the composition root, so cross-module callers and the
 * module's own HTTP controller share identical behavior.
 */
export class WallpaperApi implements IWallpaperApi {
  constructor(private readonly service: WallpaperService) {}

  async getPreview(id: string): Promise<WallpaperPreview | null> {
    return this.service.getPreview(id);
  }

  async getForShare(id: string): Promise<WallpaperShareInfo | null> {
    return this.service.getForShare(id);
  }
}
