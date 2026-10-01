import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { RingtoneService } from "@api/core/ringtone/services";
import type {
  PlayCountBodyInput,
  RingtoneGridQueryInput,
  RingtoneIdParamInput,
  RingtoneSearchQueryInput,
  SetCountBodyInput,
} from "@api/core/ringtone/routes/ringtone.schemas";

/**
 * Thin HTTP boundary for the Ringtone module (TAM-67).
 *
 * Orchestration only — resolves the JWT subject (`req.user.id`), delegates to
 * the service, and replies via `sendSuccess`. The entitlement gate + business
 * rules live in the service; the controller never touches the audio/preview URL.
 */
export class RingtoneController {
  constructor(private readonly service: RingtoneService) {}

  getGrid = async (
    req: FastifyRequest<{ Querystring: RingtoneGridQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    this.requireUserId(req);
    const { deityId, locale, cursor, limit } = req.query;
    const page = await this.service.getGrid({ deityId, locale, cursor, limit });
    return sendSuccess(reply, page, "OK");
  };

  search = async (
    req: FastifyRequest<{ Querystring: RingtoneSearchQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    this.requireUserId(req);
    const { q, locale, cursor, limit } = req.query;
    const page = await this.service.search({ q, locale, cursor, limit });
    return sendSuccess(reply, page, "OK");
  };

  getDetail = async (
    req: FastifyRequest<{ Params: RingtoneIdParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getDetail(req.params.id, userId);
    return sendSuccess(reply, data, "OK");
  };

  recordPlayCount = async (
    req: FastifyRequest<{
      Params: RingtoneIdParamInput;
      Body: PlayCountBodyInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.recordPlayCount({
      id: req.params.id,
      userId,
      sessionToken: req.body.sessionToken,
      playbackPositionSeconds: req.body.playbackPositionSeconds,
    });
    return sendSuccess(reply, data, "OK");
  };

  recordSetCount = async (
    req: FastifyRequest<{
      Params: RingtoneIdParamInput;
      Body: SetCountBodyInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.recordSetCount(req.params.id, userId);
    return sendSuccess(reply, data, "Ringtone set");
  };

  toggleLike = async (
    req: FastifyRequest<{ Params: RingtoneIdParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.toggleLike(req.params.id, userId);
    return sendSuccess(reply, data, "OK");
  };

  recordShare = async (
    req: FastifyRequest<{ Params: RingtoneIdParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.recordShare(req.params.id, userId);
    return sendSuccess(reply, data, "OK");
  };

  private requireUserId(req: FastifyRequest): string {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return req.user.id;
  }
}
