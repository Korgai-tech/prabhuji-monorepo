import type { RingtoneService } from "@api/core/ringtone/services";
import type {
  RingtonePreview,
  RingtoneShareInfo,
} from "@api/core/ringtone/types";
import type { IRingtoneApi } from "./ringtone.api.js";

/**
 * Facade implementation — a thin passthrough to the module's `RingtoneService`
 * singleton built in the composition root, so cross-module callers and the
 * module's own HTTP controller share identical behavior.
 */
export class RingtoneApi implements IRingtoneApi {
  constructor(private readonly service: RingtoneService) {}

  async getPreview(id: string): Promise<RingtonePreview | null> {
    return this.service.getPreview(id);
  }

  async getForShare(id: string): Promise<RingtoneShareInfo | null> {
    return this.service.getForShare(id);
  }
}
