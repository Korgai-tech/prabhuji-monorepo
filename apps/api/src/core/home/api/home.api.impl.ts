import type { HomeService } from "@api/core/home/services";
import type { ContentFeedCardInput } from "@api/core/home/types";
import type { IHomeApi } from "./home.api.js";

/**
 * Facade implementation — a thin passthrough to the module's `HomeService`
 * singleton built in the composition root, so cross-module callers and the
 * module's own HTTP controller share identical behavior.
 */
export class HomeApi implements IHomeApi {
  constructor(private readonly service: HomeService) {}

  async getActiveBannerCount(): Promise<number> {
    return this.service.getActiveBannerCount();
  }

  async upsertContentFeedCard(input: ContentFeedCardInput): Promise<void> {
    return this.service.upsertContentFeedCard(input);
  }

  async hasFeedItem(id: string): Promise<boolean> {
    return this.service.hasFeedItem(id);
  }
}
