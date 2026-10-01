import type { ZodiacCard } from "@api/core/horoscope/types";

/**
 * Public facade for the Horoscope module (TAM-73).
 *
 * The ONLY surface sibling modules use to reach horoscope content — via
 * `performServiceCall("horoscope", …)`, never by importing this module's files.
 * Registered into `GlobalServiceMap` from the composition root.
 *
 * Exposes the FREE zodiac grid (`getZodiacSigns`) — the discovery surface a
 * sibling (e.g. Home/TAM-61) may embed. The Pro-gated daily RESULT is
 * intentionally absent: entitlement gating is per-request and owned by the
 * horoscope module's own HTTP surface, never resolved for a sibling caller.
 */
export interface IHoroscopeApi {
  /** The enabled zodiac grid localized to `locale` (FREE discovery). */
  getZodiacSigns(locale: string): Promise<ZodiacCard[]>;
}
