import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { StatusService } from "@api/core/status/services";
import type {
  StatusAvatarPresignBodyInput,
  StatusFeedQueryInput,
  StatusIdParamInput,
  StatusProfileBodyInput,
} from "@api/core/status/routes/status.schemas";

/**
 * Thin HTTP boundary for the Status Sharing module (TAM-71).
 *
 * Orchestration only — resolves the JWT subject (`req.user.id`), delegates to
 * the service, and replies via `sendSuccess`. There is NO entitlement gate here
 * (everything is free by design); the routes require only the JWT guard. Every
 * profile read/write is scoped to the authenticated `userId` (never a body
 * field) so a user can only ever touch their own overlay profile.
 */
export class StatusController {
  constructor(private readonly service: StatusService) {}

  getFeed = async (
    req: FastifyRequest<{ Querystring: StatusFeedQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const { deityId, locale, cursor, limit, pinnedId } = req.query;
    const page = await this.service.getFeed({
      userId,
      deityId,
      locale,
      cursor,
      limit,
      pinnedId,
    });
    return sendSuccess(reply, page, "OK");
  };

  getById = async (
    req: FastifyRequest<{ Params: StatusIdParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const card = await this.service.getCard(userId, req.params.id);
    if (!card) throw new AppError("Status not found", 404, "NOT_FOUND");
    return sendSuccess(reply, card, "OK");
  };

  getProfile = async (
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getProfile(userId);
    return sendSuccess(reply, data, "OK");
  };

  saveProfile = async (
    req: FastifyRequest<{ Body: StatusProfileBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.saveProfile(userId, req.body);
    return sendSuccess(reply, data, "Saved");
  };

  toggleLike = async (
    req: FastifyRequest<{ Params: StatusIdParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.toggleLike(req.params.id, userId);
    return sendSuccess(reply, data, "OK");
  };

  recordView = async (
    req: FastifyRequest<{ Params: StatusIdParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.recordView(req.params.id, userId);
    return sendSuccess(reply, data, "OK");
  };

  presignAvatar = async (
    req: FastifyRequest<{ Body: StatusAvatarPresignBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.presignAvatar(userId, {
      contentType: req.body.contentType,
      sizeBytes: req.body.sizeBytes,
    });
    return sendSuccess(reply, data, "Avatar presign ready");
  };

  private requireUserId(req: FastifyRequest): string {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return req.user.id;
  }
}
