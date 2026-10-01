import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import type { MantrasAdminService } from "@api/core/mantras/services";
import type {
  AdminMantraCategoryCreateBodyInput,
  AdminMantraCategoryListQueryInput,
  AdminMantraCategoryPatchBodyInput,
  AdminMantraCategoryTagsBodyInput,
  AdminMantraDeleteBodyInput,
  AdminMantraIdParamsInput,
  AdminMantraItemCreateBodyInput,
  AdminMantraItemListQueryInput,
  AdminMantraItemPatchBodyInput,
  AdminMantraSectionCreateBodyInput,
  AdminMantraSectionItemsBodyInput,
  AdminMantraSectionListQueryInput,
  AdminMantraSectionPatchBodyInput,
} from "@api/core/mantras/routes/mantras.admin.schemas";

/**
 * HTTP boundary for the `/admin/mantras/*` surface (TAM-92). Thin — parsed input
 * in, envelope out via `sendSuccess`; all business logic + error semantics
 * (404/409/slug-conflict/media-validation/deity-slug-validation) live in
 * `MantrasAdminService`. The guard pair (`authMiddleware` + `adminMiddleware`)
 * is applied centrally by `registerAdminRoute`.
 */
export class MantrasAdminController {
  constructor(private readonly service: MantrasAdminService) {}

  // ---- categories ---------------------------------------------------------

  listCategories = async (
    req: FastifyRequest<{ Querystring: AdminMantraCategoryListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listCategories(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getCategory = async (
    req: FastifyRequest<{ Params: AdminMantraIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getCategoryById(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createCategory = async (
    req: FastifyRequest<{ Body: AdminMantraCategoryCreateBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createCategory(req.body);
    return sendSuccess(reply, row, "Category created", 201);
  };

  updateCategory = async (
    req: FastifyRequest<{
      Params: AdminMantraIdParamsInput;
      Body: AdminMantraCategoryPatchBodyInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateCategory(req.params.id, req.body);
    return sendSuccess(reply, row, "Category updated");
  };

  deactivateCategory = async (
    req: FastifyRequest<{
      Params: AdminMantraIdParamsInput;
      Body: AdminMantraDeleteBodyInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateCategory(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, row, "Category deactivated");
  };

  // ---- audio items --------------------------------------------------------

  listItems = async (
    req: FastifyRequest<{ Querystring: AdminMantraItemListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listItems(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getItem = async (
    req: FastifyRequest<{ Params: AdminMantraIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getItemById(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createItem = async (
    req: FastifyRequest<{ Body: AdminMantraItemCreateBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createItem(req.body);
    return sendSuccess(reply, row, "Mantra item created", 201);
  };

  updateItem = async (
    req: FastifyRequest<{
      Params: AdminMantraIdParamsInput;
      Body: AdminMantraItemPatchBodyInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateItem(req.params.id, req.body);
    return sendSuccess(reply, row, "Mantra item updated");
  };

  deactivateItem = async (
    req: FastifyRequest<{
      Params: AdminMantraIdParamsInput;
      Body: AdminMantraDeleteBodyInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateItem(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, row, "Mantra item deactivated");
  };

  setCategoryTags = async (
    req: FastifyRequest<{
      Params: AdminMantraIdParamsInput;
      Body: AdminMantraCategoryTagsBodyInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.setCategoryTags(
      req.params.id,
      req.body.categoryIds
    );
    return sendSuccess(reply, row, "Category tags updated");
  };

  // ---- homepage sections --------------------------------------------------

  listSections = async (
    req: FastifyRequest<{ Querystring: AdminMantraSectionListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listSections(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getSection = async (
    req: FastifyRequest<{ Params: AdminMantraIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getSectionById(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createSection = async (
    req: FastifyRequest<{ Body: AdminMantraSectionCreateBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createSection(req.body);
    return sendSuccess(reply, row, "Section created", 201);
  };

  updateSection = async (
    req: FastifyRequest<{
      Params: AdminMantraIdParamsInput;
      Body: AdminMantraSectionPatchBodyInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateSection(req.params.id, req.body);
    return sendSuccess(reply, row, "Section updated");
  };

  deactivateSection = async (
    req: FastifyRequest<{
      Params: AdminMantraIdParamsInput;
      Body: AdminMantraDeleteBodyInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateSection(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, row, "Section deactivated");
  };

  setSectionItems = async (
    req: FastifyRequest<{
      Params: AdminMantraIdParamsInput;
      Body: AdminMantraSectionItemsBodyInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const items = await this.service.setSectionItems(
      req.params.id,
      req.body.itemIds
    );
    return sendSuccess(reply, items, "Section items updated");
  };
}
