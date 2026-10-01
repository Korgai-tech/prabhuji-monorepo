import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { AartiService } from "@api/core/aarti/services";
import type {
  AartiListQueryInput,
  AartiLocaleQueryInput,
  AartiPlayBodyInput,
  AudioIdParamInput,
} from "@api/core/aarti/routes/aarti.schemas";

/**
 * Thin HTTP boundary for the Aarti & Bhajans module (TAM-63).
 *
 * Orchestration only — resolves the JWT subject (`req.user.id`), delegates to
 * the service, and replies via `sendSuccess`. The entitlement gate + business
 * rules live in the service; the controller never touches the stream URL.
 */
export class AartiController {
  constructor(private readonly service: AartiService) {}

  getMain = async (
    req: FastifyRequest<{ Querystring: AartiLocaleQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getMain(userId, req.query.locale);
    return sendSuccess(reply, data, "OK");
  };

  listAudios = async (
    req: FastifyRequest<{ Querystring: AartiListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const { categoryId, deityId, sectionType, sectionId, locale, cursor, limit } =
      req.query;
    const page = await this.service.listAudios({
      userId,
      categoryId,
      deityId,
      sectionType,
      sectionId,
      locale,
      cursor,
      limit,
    });
    return sendSuccess(reply, page, "OK");
  };

  getDetail = async (
    req: FastifyRequest<{
      Params: AudioIdParamInput;
      Querystring: AartiLocaleQueryInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getAudioDetail(
      req.params.id,
      userId,
      req.query.locale
    );
    return sendSuccess(reply, data, "OK");
  };

  play = async (
    req: FastifyRequest<{ Params: AudioIdParamInput; Body: AartiPlayBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.recordPlay({
      id: req.params.id,
      userId,
      lastPositionSeconds: req.body?.lastPositionSeconds,
    });
    return sendSuccess(reply, data, "Playback recorded");
  };

  toggleLike = async (
    req: FastifyRequest<{ Params: AudioIdParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.toggleLike(req.params.id, userId);
    return sendSuccess(reply, data, "OK");
  };

  private requireUserId(req: FastifyRequest): string {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return req.user.id;
  }
}
