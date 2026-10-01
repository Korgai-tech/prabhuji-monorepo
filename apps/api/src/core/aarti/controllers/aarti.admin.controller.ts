import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import type { AartiAdminService } from "@api/core/aarti/services";
import type {
  AdminAartiIdParamsInput,
  AdminAudioCategoryCreateInput,
  AdminAudioCategoryDeleteInput,
  AdminAudioCategoryListQueryInput,
  AdminAudioCategoryPatchInput,
  AdminAudioCategoryTagsInput,
  AdminAudioItemCreateInput,
  AdminAudioItemDeleteInput,
  AdminAudioItemListQueryInput,
  AdminAudioItemPatchInput,
  AdminHomepageSectionCreateInput,
  AdminHomepageSectionDeleteInput,
  AdminHomepageSectionItemsInput,
  AdminHomepageSectionListQueryInput,
  AdminHomepageSectionPatchInput,
} from "@api/core/aarti/routes/aarti.admin.schemas";

/**
 * HTTP boundary for the `/admin/aarti/*` surface (TAM-90). Thin —
 * parse-validated input in, envelope out via `sendSuccess`; all business logic
 * and error semantics (404/409/media/deity validation) live in
 * `AartiAdminService`. The guard pair (`authMiddleware` + `adminMiddleware`) is
 * applied centrally by `registerAdminRoute`, so these handlers never touch auth;
 * `req.user` is guaranteed populated by the time they run.
 */
export class AartiAdminController {
  constructor(private readonly service: AartiAdminService) {}

  // ---- AudioCategory ------------------------------------------------------

  listCategories = async (
    req: FastifyRequest<{ Querystring: AdminAudioCategoryListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listCategories(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getCategory = async (
    req: FastifyRequest<{ Params: AdminAartiIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getCategoryById(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createCategory = async (
    req: FastifyRequest<{ Body: AdminAudioCategoryCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createCategory(req.body);
    return sendSuccess(reply, row, "Category created", 201);
  };

  updateCategory = async (
    req: FastifyRequest<{
      Params: AdminAartiIdParamsInput;
      Body: AdminAudioCategoryPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateCategory(req.params.id, req.body);
    return sendSuccess(reply, row, "Category updated");
  };

  deactivateCategory = async (
    req: FastifyRequest<{
      Params: AdminAartiIdParamsInput;
      Body: AdminAudioCategoryDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateCategory(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, row, "Category deactivated");
  };

  // ---- AudioItem ----------------------------------------------------------

  listItems = async (
    req: FastifyRequest<{ Querystring: AdminAudioItemListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listItems(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getItem = async (
    req: FastifyRequest<{ Params: AdminAartiIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getItemById(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createItem = async (
    req: FastifyRequest<{ Body: AdminAudioItemCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createItem(req.body);
    return sendSuccess(reply, row, "Audio item created", 201);
  };

  updateItem = async (
    req: FastifyRequest<{
      Params: AdminAartiIdParamsInput;
      Body: AdminAudioItemPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateItem(req.params.id, req.body);
    return sendSuccess(reply, row, "Audio item updated");
  };

  deactivateItem = async (
    req: FastifyRequest<{
      Params: AdminAartiIdParamsInput;
      Body: AdminAudioItemDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateItem(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, row, "Audio item deactivated");
  };

  setCategoryTags = async (
    req: FastifyRequest<{
      Params: AdminAartiIdParamsInput;
      Body: AdminAudioCategoryTagsInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.setCategoryTags(
      req.params.id,
      req.body.categoryIds
    );
    return sendSuccess(reply, row, "Category tags updated");
  };

  // ---- HomepageSection ----------------------------------------------------

  listSections = async (
    req: FastifyRequest<{ Querystring: AdminHomepageSectionListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listSections(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getSection = async (
    req: FastifyRequest<{ Params: AdminAartiIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getSectionById(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createSection = async (
    req: FastifyRequest<{ Body: AdminHomepageSectionCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createSection(req.body);
    return sendSuccess(reply, row, "Section created", 201);
  };

  updateSection = async (
    req: FastifyRequest<{
      Params: AdminAartiIdParamsInput;
      Body: AdminHomepageSectionPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateSection(req.params.id, req.body);
    return sendSuccess(reply, row, "Section updated");
  };

  setSectionItems = async (
    req: FastifyRequest<{
      Params: AdminAartiIdParamsInput;
      Body: AdminHomepageSectionItemsInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const items = await this.service.setSectionItems(
      req.params.id,
      req.body.audioIds
    );
    return sendSuccess(reply, items, "Section items updated");
  };

  deactivateSection = async (
    req: FastifyRequest<{
      Params: AdminAartiIdParamsInput;
      Body: AdminHomepageSectionDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateSection(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, row, "Section deactivated");
  };
}
