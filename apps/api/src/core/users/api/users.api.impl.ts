import { AppError } from "@api/shared/errors";
import type { UserRole } from "@api/shared/schemas";
import type { DeityPreferenceService, UsersService } from "@api/core/users/services";
import type { DeityPreference, UserPublic } from "@api/core/users/types";
import type { IUsersApi } from "./users.api.js";

/**
 * Facade implementation — delegates `getUserPublic` to the service.
 *
 * The service throws `AppError(401)` on "user not found" (its default
 * assumption is a JWT-holding caller). For a facade caller — which may be
 * looking up any userId, not necessarily their own — that 401 is the wrong
 * signal. Catch it here and translate to `null` so consumers get a clean
 * "unknown user" indicator without a status-code surprise.
 */
export class UsersApi implements IUsersApi {
  constructor(
    private readonly service: UsersService,
    private readonly deityPreferences: DeityPreferenceService
  ) {}

  async getUserPublic(userId: string): Promise<UserPublic | null> {
    try {
      return await this.service.getMe(userId);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 401) return null;
      throw err;
    }
  }

  /**
   * Straight delegation — and note it deliberately does NOT apply the
   * 401→`null` translation `getUserPublic` does. The only caller is the
   * fail-closed `adminMiddleware`, which must deny on any failure; swallowing
   * the throw here would hand it an "everything's fine, role is unknown"
   * answer, which is precisely the shape of an accidental allow.
   */
  getRole(userId: string): Promise<UserRole> {
    return this.service.getRole(userId);
  }

  getRazorpayCustomerId(userId: string): Promise<string | null> {
    return this.service.getRazorpayCustomerId(userId);
  }

  rememberRazorpayCustomerId(userId: string, customerId: string): Promise<void> {
    return this.service.rememberRazorpayCustomerId(userId, customerId);
  }

  /**
   * Straight delegation, and NO 401→`null` translation like `getUserPublic`
   * does: "this user has no preference" and "this user does not exist" are the
   * same answer here on purpose. The feed's behaviour is identical either way
   * (fall through to the any-god pool), so distinguishing them would only
   * invite a caller to branch on something that must not change the feed.
   */
  getDeityPreference(userId: string): Promise<DeityPreference | null> {
    return this.deityPreferences.getPreference(userId);
  }
}
