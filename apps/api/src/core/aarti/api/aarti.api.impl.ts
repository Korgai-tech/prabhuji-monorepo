import type { AartiService } from "@api/core/aarti/services";
import type { AudioSummary, DownloadSource } from "@api/core/aarti/types";
import type { IAartiApi } from "./aarti.api.js";

/**
 * Facade implementation — a thin passthrough to the module's `AartiService`
 * singleton built in the composition root, so cross-module callers and the
 * module's own HTTP controller share identical behavior.
 */
export class AartiApi implements IAartiApi {
  constructor(private readonly service: AartiService) {}

  async getAudioSummary(id: string): Promise<AudioSummary | null> {
    return this.service.getAudioSummary(id);
  }

  async getDownloadSource(
    id: string,
    contentType: "aarti" | "bhajan"
  ): Promise<DownloadSource | null> {
    return this.service.getDownloadSource(id, contentType);
  }
}
