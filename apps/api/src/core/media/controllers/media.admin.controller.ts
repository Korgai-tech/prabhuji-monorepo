import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@api/shared/errors";
import { sendSuccess } from "@api/shared/response";
import type { MediaService } from "@api/core/media/services";
import type {
  MediaStatusQueryInput,
  PresignBodyInput,
} from "@api/core/media/routes/media.admin.schemas.js";

/**
 * HTTP boundary for the admin media surface (TAM-84). Envelope responses only;
 * all enforcement (allowlist, caps, key minting) lives in `MediaService`.
 */
export class MediaAdminController {
  constructor(private readonly service: MediaService) {}

  async presign(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = req.body as PresignBodyInput;
    const user = req.user;
    if (!user) {
      // Defensive: registerAdminRoute always runs authMiddleware first, so this
      // is unreachable. Fail closed rather than trust an absent subject.
      throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    }
    // uploadedBy is the JWT subject — NEVER a client-supplied body field.
    const result = await this.service.presign({ ...body, uploadedBy: user.id });
    void sendSuccess(reply, result, "Presigned upload created", 201);
  }

  /** TAM-267 — the CMS polls this while a `processing` upload is optimised. */
  async status(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { key } = req.query as MediaStatusQueryInput;
    const result = await this.service.status(key);
    void sendSuccess(reply, result, result.ready ? "Media ready" : "Media processing");
  }
}
