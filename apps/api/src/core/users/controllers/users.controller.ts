import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { UsersService } from "@api/core/users/services";
import type { UpdateMeInput } from "@api/core/users/types";

/**
 * Thin HTTP boundary: `authMiddleware` populated `req.user`; Zod already
 * validated the body; the service handles business rules; the envelope
 * helper writes the reply.
 */
export class UsersController {
  constructor(private readonly service: UsersService) {}

  getMe = async (
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    // Both reads are independent, so pay for one round trip rather than two —
    // this is the call the app boots on.
    // `app_version` is the mobile client's own header (`dio_client.dart`), and
    // the landing resolver needs it twice over: to floor the experiment at the
    // release that can render `status`/`ringtone`, and to hand the abtesting
    // service its targeting input. Forwarding it is safe here — the hazard
    // `paywall.service.ts` documents applies to an apiId with several entry
    // points, some of which have no version; these two have exactly one.
    const appVersion = readAppVersionHeader(req);
    // All three reads are independent, so pay for one round trip rather than
    // three — this is the call the app boots on.
    const [user, chatConfig, landing] = await Promise.all([
      this.service.getMe(req.user.id),
      this.service.getChatConfig(req.user.id),
      this.service.getLanding(req.user.id, appVersion),
    ]);
    // `show_kuldeveta_chat`, `kuldeveta_name` and `chat_type` are the
    // snake_case keys this API publishes on chatConfig — the first two by
    // request (and misspelled "kuldeveta" on purpose, for the client
    // contract), the third to match the mobile analytics wire (`chat_type`).
    // Renamed here, at the boundary, so `ChatConfig` stays idiomatic
    // everywhere behind this line.
    const { showKuldevtaChat, kuldevtaName, chatType, ...rest } = chatConfig;
    return sendSuccess(
      reply,
      {
        user,
        chatConfig: {
          ...rest,
          show_kuldeveta_chat: showKuldevtaChat,
          kuldeveta_name: kuldevtaName,
          chat_type: chatType,
        },
        landing,
      },
      "OK"
    );
  };

  updateMe = async (
    req: FastifyRequest<{ Body: UpdateMeInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    const user = await this.service.updateMe(req.user.id, req.body);
    return sendSuccess(reply, { user }, "Profile updated");
  };
}

/**
 * The mobile client's `app_version` header — `PackageInfo.version`, the
 * marketing semver only (e.g. `"1.2.0"`).
 *
 * Absent on any non-mobile caller and on builds that predate the header, and
 * `""` when the client's platform channel throws. Every one of those reads as
 * "very old client" downstream, which is the safe direction: the landing floor
 * denies rather than guesses. Identical to the home module's reader.
 */
function readAppVersionHeader(req: FastifyRequest): string | undefined {
  const raw = req.headers["app_version"];
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) return raw[0];
  return raw;
}
