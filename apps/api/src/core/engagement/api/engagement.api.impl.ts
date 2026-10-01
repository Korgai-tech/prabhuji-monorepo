import type { EngagementService } from "@api/core/engagement/services";
import type {
  ContentCounts,
  LikeState,
  ShareState,
  ViewState,
} from "@api/core/engagement/types";
import type { IEngagementApi } from "./engagement.api.js";

/**
 * Facade implementation — a thin passthrough to the module's
 * `EngagementService` singleton built in the composition root.
 */
export class EngagementApi implements IEngagementApi {
  constructor(private readonly service: EngagementService) {}

  async getCounts(params: {
    contentType: string;
    contentIds: string[];
  }): Promise<Record<string, ContentCounts>> {
    return this.service.getCounts(params);
  }

  async getUserLikes(params: {
    userId: string;
    contentType: string;
    contentIds: string[];
  }): Promise<string[]> {
    return this.service.getUserLikes(params);
  }

  async like(params: {
    userId: string;
    contentType: string;
    contentId: string;
  }): Promise<LikeState> {
    return this.service.like(params);
  }

  async unlike(params: {
    userId: string;
    contentType: string;
    contentId: string;
  }): Promise<LikeState> {
    return this.service.unlike(params);
  }

  async recordView(params: {
    contentType: string;
    contentId: string;
  }): Promise<ViewState> {
    return this.service.recordView(params);
  }

  async recordShare(params: {
    contentType: string;
    contentId: string;
  }): Promise<ShareState> {
    return this.service.recordShare(params);
  }
}
