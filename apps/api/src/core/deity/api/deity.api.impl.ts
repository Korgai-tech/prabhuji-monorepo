import type { DeityService } from "@api/core/deity/services";
import type { DeitySummary, LocalizedDeity } from "@api/core/deity/types";
import type { IDeityApi } from "./deity.api.js";

/**
 * Facade implementation — a thin passthrough to the module's `DeityService`
 * singleton built in the composition root, so cross-module callers and the
 * module's own HTTP controller see identical behavior.
 */
export class DeityApi implements IDeityApi {
  constructor(private readonly service: DeityService) {}

  async getActiveDeities(params: {
    locale: string;
  }): Promise<LocalizedDeity[]> {
    return this.service.getActiveDeities(params);
  }

  async getBySlug(slug: string): Promise<DeitySummary | null> {
    return this.service.getBySlug(slug);
  }
}
