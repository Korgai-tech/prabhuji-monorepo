import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { HoroscopeService } from "@api/core/horoscope/services";
import type {
  DailyQueryInput,
  ZodiacSignsQueryInput,
} from "@api/core/horoscope/routes/horoscope.schemas";

/** Default locale when the client omits `?locale=`. */
const DEFAULT_LOCALE = "en";

/**
 * Thin HTTP boundary for the Horoscope module (TAM-73).
 *
 * Orchestration only — resolves the JWT subject (`req.user.id`), delegates to the
 * service, and replies via `sendSuccess`. The #EXPORT_CRITICAL Pro-entitlement
 * gate + the locale fallback + content safety live in the SERVICE; the daily
 * controller never assembles or inspects a step payload for a free caller.
 */
export class HoroscopeController {
  constructor(private readonly service: HoroscopeService) {}

  getZodiacSigns = async (
    req: FastifyRequest<{ Querystring: ZodiacSignsQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    this.requireUserId(req); // JWT required for identity (FREE — no Pro gate)
    const locale = req.query.locale ?? DEFAULT_LOCALE;
    const signs = await this.service.getZodiacSigns(locale);
    return sendSuccess(reply, { signs }, "OK");
  };

  getDaily = async (
    req: FastifyRequest<{ Querystring: DailyQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const result = await this.service.getDailyResult({
      userId,
      zodiacId: req.query.zodiac,
      localeRequested: req.query.locale ?? DEFAULT_LOCALE,
    });
    return sendSuccess(reply, result, "OK");
  };

  private requireUserId(req: FastifyRequest): string {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return req.user.id;
  }
}
