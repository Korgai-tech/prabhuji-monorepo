import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { FirebaseTokenService } from "@api/core/firebase-tokens/services";
import type {
  DeleteFirebaseTokenBodyInput,
  RegisterFirebaseTokenBodyInput,
} from "@api/core/firebase-tokens/routes/firebase-tokens.schemas";

/**
 * HTTP boundary for the Firebase Tokens module. Resolves the JWT subject
 * (`req.user.id`), delegates to the service, replies via `sendSuccess`.
 */
export class FirebaseTokenController {
  constructor(private readonly service: FirebaseTokenService) {}

  register = async (
    req: FastifyRequest<{ Body: RegisterFirebaseTokenBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    await this.service.register({
      userId,
      token: req.body.token,
      deviceId: req.body.deviceId,
      platform: req.body.platform,
    });
    return sendSuccess(
      reply,
      { deviceId: req.body.deviceId, platform: req.body.platform },
      "Firebase token registered"
    );
  };

  unregister = async (
    req: FastifyRequest<{ Body: DeleteFirebaseTokenBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const deleted = await this.service.unregister({
      userId,
      deviceId: req.body.deviceId,
    });
    return sendSuccess(reply, { deleted }, "Firebase token unregistered");
  };

  private requireUserId(req: FastifyRequest): string {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return req.user.id;
  }
}
