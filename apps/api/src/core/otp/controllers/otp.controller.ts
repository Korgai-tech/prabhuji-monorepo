import type { FastifyReply, FastifyRequest } from "fastify";
import { readDeviceContext } from "@api/shared/analytics";
import { sendSuccess } from "@api/shared/response";
import type { OtpService } from "@api/core/otp/services";
import type {
  ResendOtpInput,
  SendOtpInput,
  VerifyOtpInput,
} from "@api/core/otp/types";

export class OtpController {
  constructor(private readonly service: OtpService) {}

  send = async (
    req: FastifyRequest<{ Body: SendOtpInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.sendOtp(req.body);
    return sendSuccess(reply, result, "OTP sent");
  };

  verify = async (
    req: FastifyRequest<{ Body: VerifyOtpInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    // The headers ride into the service rather than being cached here, because
    // the ordering matters: verify is the FIRST moment a user id exists for this
    // device, and its own analytics events are emitted inside `verifyOtp`. See
    // the write there.
    const result = await this.service.verifyOtp(req.body, readDeviceContext(req.headers));
    return sendSuccess(reply, result, "OTP verified");
  };

  resend = async (
    req: FastifyRequest<{ Body: ResendOtpInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.resendOtp(req.body);
    return sendSuccess(reply, result, "OTP resent");
  };
}
