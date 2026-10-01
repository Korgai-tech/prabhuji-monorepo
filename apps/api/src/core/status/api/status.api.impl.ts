import type { StatusService } from "@api/core/status/services";
import type { StatusPreview } from "@api/core/status/types";
import type { IStatusApi } from "./status.api.js";

/**
 * Facade implementation — a thin passthrough to the module's `StatusService`
 * singleton built in the composition root, so cross-module callers and the
 * module's own HTTP controller share identical behavior.
 */
export class StatusApi implements IStatusApi {
  constructor(private readonly service: StatusService) {}

  async getPreview(id: string): Promise<StatusPreview | null> {
    return this.service.getPreview(id);
  }

  async getPinValidation(
    id: string
  ): Promise<{ deitySlug: string | null } | null> {
    return this.service.getPinValidation(id);
  }

  async getReportTarget(id: string): Promise<{ creatorId: string } | null> {
    return this.service.getReportTarget(id);
  }
}
