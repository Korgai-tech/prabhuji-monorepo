import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AuthController } from "@api/core/auth/controllers";
import { authMiddleware } from "@api/core/auth/middleware";
import type { AuthService } from "@api/core/auth/services";
import type { LoginInput, RegisterInput } from "@api/core/auth/types";
import {
  LoginBody,
  RegisterBody,
  PublicUser,
  LoginData,
  ErrorEnvelope,
  envelope,
} from "./auth.schemas.js";

export function registerAuthRoutes(app: FastifyInstance, service: AuthService): void {
  const controller = new AuthController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Controller methods resolve `reply.send()` and return `FastifyReply` for internal
  // consistency (see sendSuccess/sendError). Fastify's Zod-aware handler typing infers
  // the return type FROM the `response` schema, so we discard the resolved reply here
  // (`void`) to satisfy that inference without changing the controller/envelope contract.
  r.post(
    "/register",
    {
      schema: {
        body: RegisterBody,
        response: { 201: envelope(PublicUser), 400: ErrorEnvelope, 500: ErrorEnvelope },
      },
    },
    async (req: FastifyRequest<{ Body: RegisterInput }>, reply: FastifyReply): Promise<void> => {
      await controller.register(req, reply);
    }
  );

  r.post(
    "/login",
    {
      schema: {
        body: LoginBody,
        response: {
          200: envelope(LoginData),
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
    },
    async (req: FastifyRequest<{ Body: LoginInput }>, reply: FastifyReply): Promise<void> => {
      await controller.login(req, reply);
    }
  );

  r.get(
    "/me",
    {
      schema: {
        response: { 200: envelope(PublicUser), 401: ErrorEnvelope, 500: ErrorEnvelope },
      },
      preHandler: authMiddleware,
    },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await controller.me(req, reply);
    }
  );

  // NOTE: the user LIST is deliberately not here. It lives at GET /admin/users
  // (admin-session.routes.ts) behind the admin guard pair. It was previously
  // GET /auth/users guarded by `authMiddleware` alone, which let any phone-OTP
  // user enumerate every account in the system — ids and emails, admins
  // included. Authentication is not authorization; do not re-add it here.
}
