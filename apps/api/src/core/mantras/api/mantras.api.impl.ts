import type { MantrasService } from "@api/core/mantras/services";
import type {
  DownloadSource,
  MantraPlaylistSource,
  MantraShareInfo,
  MantraSummary,
} from "@api/core/mantras/types";
import type { IMantrasApi } from "./mantras.api.js";

/**
 * Facade implementation — a thin passthrough to the module's `MantrasService`
 * singleton built in the composition root, so cross-module callers and the
 * module's own HTTP controller share identical behavior.
 */
export class MantrasApi implements IMantrasApi {
  constructor(private readonly service: MantrasService) {}

  async getItemSummary(id: string): Promise<MantraSummary | null> {
    return this.service.getItemSummary(id);
  }

  async getItemForShare(id: string): Promise<MantraShareInfo | null> {
    return this.service.getItemForShare(id);
  }

  async resolvePlaylist(params: {
    source: MantraPlaylistSource;
    sourceId?: string;
    userId: string;
  }): Promise<MantraSummary[]> {
    return this.service.resolvePlaylist(params);
  }

  async getDownloadSource(id: string): Promise<DownloadSource | null> {
    return this.service.getDownloadSource(id);
  }
}
