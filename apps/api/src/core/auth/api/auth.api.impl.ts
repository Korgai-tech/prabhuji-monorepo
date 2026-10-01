import type { AuthService } from "@api/core/auth/services";
import type { AuthUser } from "@api/core/auth/types";
import type { IAuthApi } from "./auth.api.js";

export class AuthApi implements IAuthApi {
  constructor(private readonly service: AuthService) {}

  async verifyToken(token: string): Promise<AuthUser> {
    return this.service.verifyToken(token);
  }
}
