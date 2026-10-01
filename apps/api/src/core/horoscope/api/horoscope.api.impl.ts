import type { HoroscopeService } from "@api/core/horoscope/services";
import type { ZodiacCard } from "@api/core/horoscope/types";
import type { IHoroscopeApi } from "./horoscope.api.js";

/**
 * Facade implementation — a thin passthrough to the module's `HoroscopeService`
 * singleton built in the composition root, so cross-module callers and the
 * module's own HTTP controller share identical behavior.
 */
export class HoroscopeApi implements IHoroscopeApi {
  constructor(private readonly service: HoroscopeService) {}

  async getZodiacSigns(locale: string): Promise<ZodiacCard[]> {
    return this.service.getZodiacSigns(locale);
  }
}
