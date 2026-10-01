import type { FastifyReply } from "fastify";

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}

export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  message = "OK",
  statusCode = 200
): FastifyReply {
  const body: ApiResponse<T> = { success: true, message, data };
  return reply.code(statusCode).send(body);
}

export function sendError(
  reply: FastifyReply,
  message: string,
  statusCode = 400,
  errorCode?: string
): FastifyReply {
  const body: ApiResponse<null> & { errorCode?: string } = {
    success: false,
    message,
    data: null,
  };
  if (errorCode) body.errorCode = errorCode;
  return reply.code(statusCode).send(body);
}
