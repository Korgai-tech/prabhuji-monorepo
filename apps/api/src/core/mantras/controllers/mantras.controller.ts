import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { MantrasService } from "@api/core/mantras/services";
import type {
  CategoryPlaylistParamInput,
  CounterPreferenceBodyInput,
  DeityPlaylistParamInput,
  ItemIdParamInput,
  MantraDetailQueryInput,
  MantraListQueryInput,
  MantraSectionsQueryInput,
  RecentlyPlayedBodyInput,
} from "@api/core/mantras/routes/mantras.schemas";

/**
 * Thin HTTP boundary for the Mantras & Stutis module (TAM-65).
 *
 * Orchestration only — resolves the JWT subject (`req.user.id`), delegates to
 * the service, and replies via `sendSuccess`. The entitlement gate + business
 * rules live in the service; the controller never touches the stream URL.
 */
export class MantrasController {
  constructor(private readonly service: MantrasService) {}

  getSections = async (
    req: FastifyRequest<{ Querystring: MantraSectionsQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getSections(userId, req.query.locale);
    return sendSuccess(reply, data, "OK");
  };

  listItems = async (
    req: FastifyRequest<{ Querystring: MantraListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const { categoryId, deityId, locale, sectionType, sectionId, cursor, limit } =
      req.query;
    const page = await this.service.listItems({
      userId,
      categoryId,
      deityId,
      locale,
      sectionType,
      sectionId,
      cursor,
      limit,
    });
    return sendSuccess(reply, page, "OK");
  };

  getDetail = async (
    req: FastifyRequest<{
      Params: ItemIdParamInput;
      Querystring: MantraDetailQueryInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getItemDetail({
      id: req.params.id,
      userId,
      source: req.query.source,
      sourceId: req.query.sourceId,
      locale: req.query.locale,
    });
    return sendSuccess(reply, data, "OK");
  };

  getDeityPlaylist = async (
    req: FastifyRequest<{ Params: DeityPlaylistParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getDeityPlaylist(req.params.deityId, userId);
    return sendSuccess(reply, data, "OK");
  };

  getCategoryPlaylist = async (
    req: FastifyRequest<{ Params: CategoryPlaylistParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getCategoryPlaylist(
      req.params.categoryId,
      userId
    );
    return sendSuccess(reply, data, "OK");
  };

  recordRecentlyPlayed = async (
    req: FastifyRequest<{
      Params: ItemIdParamInput;
      Body: RecentlyPlayedBodyInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.recordRecentlyPlayed({
      id: req.params.id,
      userId,
      lastProgressSeconds: req.body?.lastProgressSeconds,
    });
    return sendSuccess(reply, data, "Playback recorded");
  };

  toggleLike = async (
    req: FastifyRequest<{ Params: ItemIdParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.toggleLike(req.params.id, userId);
    return sendSuccess(reply, data, "OK");
  };

  getCounterPreference = async (
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getCounterPreference(userId);
    return sendSuccess(reply, data, "OK");
  };

  setCounterPreference = async (
    req: FastifyRequest<{ Body: CounterPreferenceBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.setCounterPreference(
      userId,
      req.body.repeatTarget
    );
    return sendSuccess(reply, data, "Preference saved");
  };

  private requireUserId(req: FastifyRequest): string {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return req.user.id;
  }
}
