import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { OtpController } from "@api/core/otp/controllers";
import type { OtpService } from "@api/core/otp/services";
import type {
  ResendOtpInput,
  SendOtpInput,
  VerifyOtpInput,
} from "@api/core/otp/types";
import {
  ErrorEnvelope,
  ResendOtpBody,
  ResendOtpData,
  SendOtpBody,
  SendOtpData,
  VerifyOtpBody,
  VerifyOtpData,
  envelope,
} from "./otp.schemas.js";

export function registerOtpRoutes(app: FastifyInstance, service: OtpService): void {
  const controller = new OtpController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/send",
    {
      schema: {
        body: SendOtpBody,
        response: {
          200: envelope(SendOtpData),
          400: ErrorEnvelope,
          429: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
    },
    async (req: FastifyRequest<{ Body: SendOtpInput }>, reply: FastifyReply): Promise<void> => {
      await controller.send(req, reply);
    }
  );

  r.post(
    "/verify",
    {
      schema: {
        body: VerifyOtpBody,
        response: {
          200: envelope(VerifyOtpData),
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          429: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
    },
    async (req: FastifyRequest<{ Body: VerifyOtpInput }>, reply: FastifyReply): Promise<void> => {
      await controller.verify(req, reply);
    }
  );

  r.post(
    "/resend",
    {
      schema: {
        body: ResendOtpBody,
        response: {
          200: envelope(ResendOtpData),
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          429: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
    },
    async (req: FastifyRequest<{ Body: ResendOtpInput }>, reply: FastifyReply): Promise<void> => {
      await controller.resend(req, reply);
    }
  );
}
