import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { HomeService } from "@api/core/home/services";
import type {
  HomeEngagementBodyInput,
  HomeFeedQueryInput,
  HomeLocaleQueryInput,
  HomeShareBodyInput,
} from "@api/core/home/routes/home.schemas";

/**
 * Thin HTTP boundary for the Home module (TAM-61).
 *
 * Orchestration only — resolves the JWT subject (`req.user.id`), delegates to
 * the service, and replies via `sendSuccess`. There is NO entitlement gate here
 * (Home is never Pro-gated); the routes require only the JWT guard. The JWT
 * subject — never a body field — is the identity for `likedByMe` + every
 * engagement write.
 */
export class HomeController {
  constructor(private readonly service: HomeService) {}

  getBanners = async (
    req: FastifyRequest<{ Querystring: HomeLocaleQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    this.requireUserId(req);
    const data = await this.service.getBanners({ locale: req.query.locale });
    return sendSuccess(reply, data, "OK");
  };

  getShortcuts = async (
    req: FastifyRequest<{ Querystring: HomeLocaleQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    // TAM-174 — the id is now USED, not just asserted: it is the A/B subject for
    // the shortcut-grid gradient experiment.
    const userId = this.requireUserId(req);
    // TAM-132 backwards-compat gate — the mobile client sends its bundle
    // semver in the `app_version` request header (see
    // `apps/mobile/lib/core/dio_client.dart`). Fastify lower-cases inbound
    // header names, so the lookup key is snake-case. A duplicated header
    // arrives as `string[]`; take the first value (the mobile client only
    // ever sends one, but the primitive is defensive).
    const appVersion = readAppVersionHeader(req);
    const data = await this.service.getShortcuts({
      locale: req.query.locale,
      appVersion,
      userId,
    });
    return sendSuccess(reply, data, "OK");
  };

  getFeed = async (
    req: FastifyRequest<{ Querystring: HomeFeedQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const { cursor, limit, locale } = req.query;
    const page = await this.service.getFeed({ userId, cursor, limit, locale });
    return sendSuccess(reply, page, "OK");
  };

  like = async (
    req: FastifyRequest<{ Body: HomeEngagementBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const { contentType, contentId } = req.body;
    const data = await this.service.toggleLike(userId, contentType, contentId);
    return sendSuccess(reply, data, "OK");
  };

  view = async (
    req: FastifyRequest<{ Body: HomeEngagementBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const { contentType, contentId } = req.body;
    const data = await this.service.recordView(userId, contentType, contentId);
    return sendSuccess(reply, data, "OK");
  };

  share = async (
    req: FastifyRequest<{ Body: HomeShareBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const { contentType, contentId, channel } = req.body;
    const data = await this.service.recordShare(userId, contentType, contentId, channel);
    return sendSuccess(reply, data, "OK");
  };

  private requireUserId(req: FastifyRequest): string {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return req.user.id;
  }
}

/**
 * Best-effort pull of the mobile `app_version` header. Fastify lower-cases
 * inbound header names, so the lookup is snake-case. Header values may arrive
 * as `string | string[] | undefined`; we take the first entry of an array and
 * pass the string through untouched (parse tolerance lives in the service
 * helper, `parseAppVersion`). Never throws.
 */
function readAppVersionHeader(req: FastifyRequest): string | undefined {
  const raw = req.headers["app_version"];
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) return raw[0];
  return raw;
}
