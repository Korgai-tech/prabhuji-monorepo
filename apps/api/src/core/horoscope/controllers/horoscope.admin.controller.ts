import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import type { HoroscopeAdminService } from "@api/core/horoscope/services";
import type {
  AdminHoroscopeIdParamsInput,
  AdminMediaAssetCreateInput,
  AdminMediaAssetListQueryInput,
  AdminMediaAssetPatchInput,
  AdminModeCreateInput,
  AdminModeDeleteInput,
  AdminModeListQueryInput,
  AdminModePatchInput,
  AdminResultCreateInput,
  AdminResultDeleteInput,
  AdminResultListQueryInput,
  AdminResultPatchInput,
  AdminStepCreateInput,
  AdminStepDeleteInput,
  AdminStepListQueryInput,
  AdminStepPatchInput,
  AdminZodiacCreateInput,
  AdminZodiacDeleteInput,
  AdminZodiacListQueryInput,
  AdminZodiacPatchInput,
} from "@api/core/horoscope/routes/horoscope.admin.schemas";

/**
 * HTTP boundary for the `/admin/horoscope/*` surface (TAM-100).
 *
 * Thin — parse-validated input in, envelope out via `sendSuccess`; all business
 * logic and error semantics (404/409/conflict/content-safety) live in
 * `HoroscopeAdminService`. The guard pair (`authMiddleware` + `adminMiddleware`)
 * is applied centrally by `registerAdminRoute`.
 */
export class HoroscopeAdminController {
  constructor(private readonly service: HoroscopeAdminService) {}

  // --- ZodiacSign ----------------------------------------------------------

  listZodiac = async (
    req: FastifyRequest<{ Querystring: AdminZodiacListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listZodiac(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getZodiac = async (
    req: FastifyRequest<{ Params: AdminHoroscopeIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getZodiac(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createZodiac = async (
    req: FastifyRequest<{ Body: AdminZodiacCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createZodiac(req.body);
    return sendSuccess(reply, row, "Zodiac sign created", 201);
  };

  updateZodiac = async (
    req: FastifyRequest<{
      Params: AdminHoroscopeIdParamsInput;
      Body: AdminZodiacPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateZodiac(req.params.id, req.body);
    return sendSuccess(reply, row, "Zodiac sign updated");
  };

  deactivateZodiac = async (
    req: FastifyRequest<{
      Params: AdminHoroscopeIdParamsInput;
      Body: AdminZodiacDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateZodiac(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, row, "Zodiac sign deactivated");
  };

  // --- HoroscopeMode -------------------------------------------------------

  listModes = async (
    req: FastifyRequest<{ Querystring: AdminModeListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listModes(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getMode = async (
    req: FastifyRequest<{ Params: AdminHoroscopeIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getMode(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createMode = async (
    req: FastifyRequest<{ Body: AdminModeCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createMode(req.body);
    return sendSuccess(reply, row, "Mode created", 201);
  };

  updateMode = async (
    req: FastifyRequest<{
      Params: AdminHoroscopeIdParamsInput;
      Body: AdminModePatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateMode(req.params.id, req.body);
    return sendSuccess(reply, row, "Mode updated");
  };

  deactivateMode = async (
    req: FastifyRequest<{
      Params: AdminHoroscopeIdParamsInput;
      Body: AdminModeDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateMode(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, row, "Mode deactivated");
  };

  // --- HoroscopeStepConfig -------------------------------------------------

  listSteps = async (
    req: FastifyRequest<{ Querystring: AdminStepListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listSteps(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getStep = async (
    req: FastifyRequest<{ Params: AdminHoroscopeIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getStep(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createStep = async (
    req: FastifyRequest<{ Body: AdminStepCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createStep(req.body);
    return sendSuccess(reply, row, "Step config created", 201);
  };

  updateStep = async (
    req: FastifyRequest<{
      Params: AdminHoroscopeIdParamsInput;
      Body: AdminStepPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateStep(req.params.id, req.body);
    return sendSuccess(reply, row, "Step config updated");
  };

  deactivateStep = async (
    req: FastifyRequest<{
      Params: AdminHoroscopeIdParamsInput;
      Body: AdminStepDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateStep(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, row, "Step config deactivated");
  };

  // --- DailyHoroscopeResult ------------------------------------------------

  listResults = async (
    req: FastifyRequest<{ Querystring: AdminResultListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listResults(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getResult = async (
    req: FastifyRequest<{ Params: AdminHoroscopeIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getResult(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createResult = async (
    req: FastifyRequest<{ Body: AdminResultCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createResult(req.body);
    return sendSuccess(reply, row, "Daily result created", 201);
  };

  updateResult = async (
    req: FastifyRequest<{
      Params: AdminHoroscopeIdParamsInput;
      Body: AdminResultPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateResult(req.params.id, req.body);
    return sendSuccess(reply, row, "Daily result updated");
  };

  deleteResult = async (
    req: FastifyRequest<{
      Params: AdminHoroscopeIdParamsInput;
      Body: AdminResultDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    await this.service.deleteResult(req.params.id, req.body.expectedUpdatedAt);
    return sendSuccess(reply, null, "Daily result deleted");
  };

  // --- MediaAsset ----------------------------------------------------------

  listMediaAssets = async (
    req: FastifyRequest<{ Querystring: AdminMediaAssetListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listMediaAssets(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getMediaAsset = async (
    req: FastifyRequest<{ Params: AdminHoroscopeIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getMediaAsset(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createMediaAsset = async (
    req: FastifyRequest<{ Body: AdminMediaAssetCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createMediaAsset(req.body);
    return sendSuccess(reply, row, "Media asset created", 201);
  };

  updateMediaAsset = async (
    req: FastifyRequest<{
      Params: AdminHoroscopeIdParamsInput;
      Body: AdminMediaAssetPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateMediaAsset(req.params.id, req.body);
    return sendSuccess(reply, row, "Media asset updated");
  };
}
