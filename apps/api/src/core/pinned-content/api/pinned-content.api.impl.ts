import type { PinnedContentLookupService } from "@api/core/pinned-content/services";
import type { ActivePinnedId, PinSurface } from "@api/core/pinned-content/types";
import type { IPinnedContentApi } from "./pinned-content.api.js";

/**
 * Facade implementation — a thin passthrough to the module's read-side
 * `PinnedContentLookupService` singleton built in the composition root. Kept
 * separate from the write-path service so a cross-module read never resolves
 * a class carrying admin-write dependencies (audit repo, deity facade), which
 * would otherwise show up in every consumer's dep graph via the facade type.
 */
export class PinnedContentApi implements IPinnedContentApi {
  constructor(private readonly service: PinnedContentLookupService) {}

  async getActivePinnedIds(input: {
    surface: PinSurface;
    deitySlug?: string;
    atMs: number;
  }): Promise<ActivePinnedId[]> {
    return this.service.getActivePinnedIds(input);
  }
}
