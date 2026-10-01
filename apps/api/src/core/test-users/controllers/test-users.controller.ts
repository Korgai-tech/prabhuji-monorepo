import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@api/shared/errors";
import { sendSuccess } from "@api/shared/response";
import type { TestUsersService } from "@api/core/test-users/services";
import type {
  AdminCreateTestUserInput,
  AdminTestUserListQueryInput,
} from "@api/core/test-users/routes/test-users.admin.schemas";

/** HTTP boundary for `/admin/test-users`. The guard pair is applied by `registerAdminRoute`. */
export class TestUsersController {
  constructor(private readonly service: TestUsersService) {}

  list = async (
    req: FastifyRequest<{ Querystring: AdminTestUserListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const data = await this.service.listTestUsers(req.query);
    return sendSuccess(reply, data, "OK");
  };

  create = async (
    req: FastifyRequest<{ Body: AdminCreateTestUserInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    // Always set behind the admin guard; checked for the audit log's sake.
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    const data = await this.service.createTestUser(req.body, req.user.id);
    return sendSuccess(reply, data, data.created ? "Test user created" : "Test user updated");
  };
}
