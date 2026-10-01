import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import type { WallpaperAdminService } from "@api/core/wallpaper/services";
import type {
  AdminWallpaperCreateInput,
  AdminWallpaperDeleteInput,
  AdminWallpaperIdParamsInput,
  AdminWallpaperListQueryInput,
  AdminWallpaperPatchInput,
  AdminWallpaperRowCreateInput,
  AdminWallpaperRowDeleteInput,
  AdminWallpaperRowIdParamsInput,
  AdminWallpaperRowItemsInput,
  AdminWallpaperRowListQueryInput,
  AdminWallpaperRowPatchInput,
} from "@api/core/wallpaper/routes/wallpaper.admin.schemas";

/**
 * HTTP boundary for the `/admin/wallpapers/*` surface (TAM-96). Thin —
 * parse-validated input in, envelope out via `sendSuccess`; all business logic
 * and error semantics (404/409/slug-conflict, media/deity validation, the
 * custom-only item rule) live in `WallpaperAdminService`. The guard pair
 * (`authMiddleware` + `adminMiddleware`) is applied centrally by
 * `registerAdminRoute`, so these handlers never touch auth.
 */
export class WallpaperAdminController {
  constructor(private readonly service: WallpaperAdminService) {}

  // ---- wallpapers ---------------------------------------------------------

  list = async (
    req: FastifyRequest<{ Querystring: AdminWallpaperListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.list(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getOne = async (
    req: FastifyRequest<{ Params: AdminWallpaperIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const wallpaper = await this.service.getById(req.params.id);
    return sendSuccess(reply, wallpaper, "OK");
  };

  create = async (
    req: FastifyRequest<{ Body: AdminWallpaperCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const wallpaper = await this.service.create(req.body);
    return sendSuccess(reply, wallpaper, "Wallpaper created", 201);
  };

  update = async (
    req: FastifyRequest<{
      Params: AdminWallpaperIdParamsInput;
      Body: AdminWallpaperPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const wallpaper = await this.service.update(req.params.id, req.body);
    return sendSuccess(reply, wallpaper, "Wallpaper updated");
  };

  deactivate = async (
    req: FastifyRequest<{
      Params: AdminWallpaperIdParamsInput;
      Body: AdminWallpaperDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const wallpaper = await this.service.deactivate(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, wallpaper, "Wallpaper deactivated");
  };

  // ---- homepage rows ------------------------------------------------------

  listRows = async (
    req: FastifyRequest<{ Querystring: AdminWallpaperRowListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listRows(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getRow = async (
    req: FastifyRequest<{ Params: AdminWallpaperRowIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getRowById(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createRow = async (
    req: FastifyRequest<{ Body: AdminWallpaperRowCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createRow(req.body);
    return sendSuccess(reply, row, "Homepage row created", 201);
  };

  updateRow = async (
    req: FastifyRequest<{
      Params: AdminWallpaperRowIdParamsInput;
      Body: AdminWallpaperRowPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateRow(req.params.id, req.body);
    return sendSuccess(reply, row, "Homepage row updated");
  };

  deactivateRow = async (
    req: FastifyRequest<{
      Params: AdminWallpaperRowIdParamsInput;
      Body: AdminWallpaperRowDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateRow(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, row, "Homepage row deactivated");
  };

  setRowItems = async (
    req: FastifyRequest<{
      Params: AdminWallpaperRowIdParamsInput;
      Body: AdminWallpaperRowItemsInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const items = await this.service.setRowItems(
      req.params.id,
      req.body.wallpaperIds
    );
    return sendSuccess(reply, items, "Row items updated");
  };
}
