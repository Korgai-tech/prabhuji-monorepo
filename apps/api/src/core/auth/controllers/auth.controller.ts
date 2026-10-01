import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { AuthService } from "@api/core/auth/services";
import type { LoginInput, RegisterInput } from "@api/core/auth/types";
import type { AdminUserListQueryInput } from "@api/core/auth/routes/auth.schemas";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = async (
    req: FastifyRequest<{ Body: RegisterInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const user = await this.service.register(req.body);
    return sendSuccess(reply, user, "Registered", 201);
  };

  login = async (
    req: FastifyRequest<{ Body: LoginInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.login(req.body);
    return sendSuccess(reply, result, "Logged in");
  };

  me = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return sendSuccess(reply, req.user, "OK");
  };

  /**
   * `GET /admin/users` — the paged, filterable user list. Zod has already
   * coerced `page`/`pageSize` to clamped ints and checked `sort` against the
   * allowlist, so the query object goes straight to the service.
   */
  list = async (
    req: FastifyRequest<{ Querystring: AdminUserListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const page = await this.service.listUsers(req.query);
    return sendSuccess(reply, page, "OK");
  };

  /**
   * `GET /admin/session` (TAM-82) — the admin whoami. Self-gating by
   * construction: 401 = no/expired token, 403 = authenticated non-admin,
   * 200 = admin. TAM-86's `<AdminRoute>` renders off exactly that.
   *
   * No service call and no second SELECT: `authMiddleware` proved the identity
   * and `adminMiddleware` already resolved the role from the DB this request.
   * The `!req.adminRole` check is unreachable defence — `adminRole` is set only
   * after the guard decided "admin", so its absence would mean this route was
   * registered without `registerAdminRoute`, which the guard contract test
   * makes impossible to merge.
   */
  adminSession = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    if (!req.user || !req.adminRole) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    // Same unreachable-defence shape as the check above. `email` is nullable
    // because phone accounts have none, but an admin is an `email`-login account
    // by construction — the only writer of `role: admin` is the bootstrap path.
    // If that ever stopped holding, denying is right; emitting `""` as someone's
    // admin identity is not.
    if (req.user.email === null) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return sendSuccess(
      reply,
      { id: req.user.id, email: req.user.email, role: req.adminRole },
      "OK"
    );
  };
}
