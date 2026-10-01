import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { WallpaperService } from "@api/core/wallpaper/services";
import type {
  WallpaperCountBodyInput,
  WallpaperHomeQueryInput,
  WallpaperIdParamInput,
  WallpaperListQueryInput,
} from "@api/core/wallpaper/routes/wallpaper.schemas";

/**
 * Thin HTTP boundary for the Wallpaper module (TAM-69).
 *
 * Orchestration only — resolves the JWT subject (`req.user.id`), delegates to
 * the service, and replies via `sendSuccess`. There is NO entitlement gate here
 * (discovery is free by design); the routes require only the JWT guard.
 */
export class WallpaperController {
  constructor(private readonly service: WallpaperService) {}

  getHome = async (
    req: FastifyRequest<{ Querystring: WallpaperHomeQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getHome(
      userId,
      req.query.deityId,
      req.query.locale
    );
    return sendSuccess(reply, data, "OK");
  };

  list = async (
    req: FastifyRequest<{ Querystring: WallpaperListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const { deityId, rowId, cursor, limit, locale } = req.query;
    const page = await this.service.list({
      userId,
      deityId,
      rowId,
      cursor,
      limit,
      locale,
    });
    return sendSuccess(reply, page, "OK");
  };

  getDetail = async (
    req: FastifyRequest<{ Params: WallpaperIdParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getDetail(req.params.id, userId);
    return sendSuccess(reply, data, "OK");
  };

  toggleLike = async (
    req: FastifyRequest<{ Params: WallpaperIdParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.toggleLike(req.params.id, userId);
    return sendSuccess(reply, data, "OK");
  };

  recordCount = async (
    req: FastifyRequest<{
      Params: WallpaperIdParamInput;
      Body: WallpaperCountBodyInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.recordCount(req.params.id, userId, req.body.type);
    return sendSuccess(reply, data, "OK");
  };

  private requireUserId(req: FastifyRequest): string {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return req.user.id;
  }
}
