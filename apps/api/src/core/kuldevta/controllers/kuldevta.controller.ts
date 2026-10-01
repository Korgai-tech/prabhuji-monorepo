import type { FastifyReply, FastifyRequest } from "fastify";

import { AppError } from "@api/shared/errors";
import { sendSuccess } from "@api/shared/response";
import type { IdentifyDeps } from "@api/core/kuldevta/services";
import { ProfileParseError, identifyKuldevta } from "@api/core/kuldevta/services";

import type { IdentifyInput } from "../routes/kuldevta.schemas.js";

/**
 * Thin HTTP boundary for `POST /kuldevta/identify`.
 *
 * NOTE: no Prisma, no repository import here — arch-boundaries.json forbids
 * both under `/controllers/`. `deps.saveAssignment` is wired at the module
 * composition root (`kuldevta/index.ts`), same as `deity`'s
 * repo→service→controller wiring.
 *
 * `req.user` is `AuthUser | undefined` on the Fastify type (see the
 * `declare module "fastify"` block in `auth.middleware.ts`) even though the
 * `authMiddleware` preHandler guarantees it is set by the time this runs —
 * the `!req.user` guard keeps that honest at the type level and matches
 * `DeityController`.
 */
export class KuldevtaController {
  constructor(private readonly deps: IdentifyDeps) {}

  identify = async (
    req: FastifyRequest<{ Body: IdentifyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    const userId = req.user.id;

    try {
      const result = await identifyKuldevta(userId, req.body, this.deps);
      return sendSuccess(reply, result, "OK");
    } catch (err) {
      if (err instanceof ProfileParseError) {
        // Deliberately NOT `{ err }`: pino's default `err` serializer emits
        // every own enumerable property, and `ProfileParseError.raw` is the
        // full unparsed LLM output — the family's answers, verbatim, which
        // can contain the term `scrubSati` exists to keep out of our systems
        // (spec §9.2). Log only the safe, structural bits of the error.
        req.log.error(
          { err: { name: err.name, message: err.message } },
          "kuldevta parser returned unparseable profile"
        );
        throw new AppError(
          "Could not read the answers. Please try again.",
          502,
          "PARSER_UNAVAILABLE"
        );
      }
      throw err;
    }
  };
}
