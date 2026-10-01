import type { FastifyReply, FastifyRequest } from "fastify";
import { performServiceCall } from "@api/shared/workspace";
import { sendError } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { AuthUser } from "@api/core/auth/types";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function authMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    void sendError(reply, "Missing bearer token", 401, "UNAUTHORIZED");
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    req.user = await performServiceCall(
      "auth",
      (s) => s.verifyToken(token),
      "authMiddleware",
      "Authentication failed"
    );
  } catch (err) {
    if (err instanceof AppError && err.statusCode !== 401) {
      void sendError(reply, err.message, err.statusCode, err.errorCode);
      return;
    }
    void sendError(reply, "Invalid or expired token", 401, "UNAUTHORIZED");
  }
}
