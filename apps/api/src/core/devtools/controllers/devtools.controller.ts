import type { FastifyReply, FastifyRequest } from "fastify";

import { sendSuccess } from "@api/shared/response";
import type { DevtoolsService } from "@api/core/devtools/services";
import type { MarkProInput } from "@api/core/devtools/types";

export class DevtoolsController {
  constructor(private readonly service: DevtoolsService) {}

  markPro = async (
    req: FastifyRequest<{ Body: MarkProInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.markPro(req.body);
    return sendSuccess(reply, result, "User marked Pro");
  };
}
