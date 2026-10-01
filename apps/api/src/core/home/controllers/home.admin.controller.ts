import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import type { HomeAdminService } from "@api/core/home/services";
import type {
  AdminBannerCreateInput,
  AdminBannerListQueryInput,
  AdminBannerPatchInput,
  AdminFeedCreateInput,
  AdminFeedListQueryInput,
  AdminFeedPatchInput,
  AdminHomeDeleteInput,
  AdminHomeIdParamsInput,
  AdminSettingsPatchInput,
  AdminShortcutCreateInput,
  AdminShortcutListQueryInput,
  AdminShortcutPatchInput,
} from "@api/core/home/routes/home.admin.schemas";

/**
 * HTTP boundary for the `/admin/home/*` surface (TAM-104).
 *
 * Thin — parse-validated input in, envelope out via `sendSuccess`; all business
 * logic and error semantics (destination safety, 404/409, slug/key conflicts)
 * live in `HomeAdminService`. The guard pair (`authMiddleware` +
 * `adminMiddleware`) is applied centrally by `registerAdminRoute`.
 */
export class HomeAdminController {
  constructor(private readonly service: HomeAdminService) {}

  // --- HomeBanner ----------------------------------------------------------

  listBanners = async (
    req: FastifyRequest<{ Querystring: AdminBannerListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listBanners(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getBanner = async (
    req: FastifyRequest<{ Params: AdminHomeIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getBanner(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createBanner = async (
    req: FastifyRequest<{ Body: AdminBannerCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createBanner(req.body);
    return sendSuccess(reply, row, "Banner created", 201);
  };

  updateBanner = async (
    req: FastifyRequest<{ Params: AdminHomeIdParamsInput; Body: AdminBannerPatchInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateBanner(req.params.id, req.body);
    return sendSuccess(reply, row, "Banner updated");
  };

  deactivateBanner = async (
    req: FastifyRequest<{ Params: AdminHomeIdParamsInput; Body: AdminHomeDeleteInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateBanner(req.params.id, req.body.expectedUpdatedAt);
    return sendSuccess(reply, row, "Banner deactivated");
  };

  // --- HomeFeedItem --------------------------------------------------------

  listFeedItems = async (
    req: FastifyRequest<{ Querystring: AdminFeedListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listFeedItems(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getFeedItem = async (
    req: FastifyRequest<{ Params: AdminHomeIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getFeedItem(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createFeedItem = async (
    req: FastifyRequest<{ Body: AdminFeedCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createFeedItem(req.body);
    return sendSuccess(reply, row, "Feed item created", 201);
  };

  updateFeedItem = async (
    req: FastifyRequest<{ Params: AdminHomeIdParamsInput; Body: AdminFeedPatchInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateFeedItem(req.params.id, req.body);
    return sendSuccess(reply, row, "Feed item updated");
  };

  deactivateFeedItem = async (
    req: FastifyRequest<{ Params: AdminHomeIdParamsInput; Body: AdminHomeDeleteInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateFeedItem(req.params.id, req.body.expectedUpdatedAt);
    return sendSuccess(reply, row, "Feed item deactivated");
  };

  // --- HomeShortcut --------------------------------------------------------

  listShortcuts = async (
    req: FastifyRequest<{ Querystring: AdminShortcutListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listShortcuts(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getShortcut = async (
    req: FastifyRequest<{ Params: AdminHomeIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getShortcut(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createShortcut = async (
    req: FastifyRequest<{ Body: AdminShortcutCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createShortcut(req.body);
    return sendSuccess(reply, row, "Shortcut created", 201);
  };

  updateShortcut = async (
    req: FastifyRequest<{ Params: AdminHomeIdParamsInput; Body: AdminShortcutPatchInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateShortcut(req.params.id, req.body);
    return sendSuccess(reply, row, "Shortcut updated");
  };

  deactivateShortcut = async (
    req: FastifyRequest<{ Params: AdminHomeIdParamsInput; Body: AdminHomeDeleteInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateShortcut(req.params.id, req.body.expectedUpdatedAt);
    return sendSuccess(reply, row, "Shortcut deactivated");
  };

  // --- HomeSettings (singleton) --------------------------------------------

  getSettings = async (
    _req: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getSettings();
    return sendSuccess(reply, row, "OK");
  };

  updateSettings = async (
    req: FastifyRequest<{ Body: AdminSettingsPatchInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateSettings(req.body);
    return sendSuccess(reply, row, "Settings updated");
  };
}
