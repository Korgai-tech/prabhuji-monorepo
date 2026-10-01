import type { AuthUser } from "../types.js";

export interface IAuthApi {
  verifyToken(token: string): Promise<AuthUser>;
}
