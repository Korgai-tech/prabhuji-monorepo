import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@api/shared/errors";
import { sendSuccess } from "@api/shared/response";
import type { DownloadsService } from "@api/core/downloads/services";
import type { DownloadPathParamsInput } from "@api/core/downloads/routes/downloads.schemas";

/**
 * Thin HTTP boundary for the Downloads module (TAM-125).
 *
 * Orchestration only — resolves the JWT subject (`req.user.id`), delegates to
 * the service, and replies via `sendSuccess`. The entitlement gate + business
 * rules live in the service; the controller never touches the signed URL.
 */
export class DownloadsController {
  constructor(private readonly service: DownloadsService) {}

  getManifest = async (
    req: FastifyRequest<{ Params: DownloadPathParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const manifest = await this.service.getDownloadManifest({
      userId,
      type: req.params.type,
      id: req.params.id,
    });
    return sendSuccess(reply, manifest, "OK");
  };

  private requireUserId(req: FastifyRequest): string {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return req.user.id;
  }
}
