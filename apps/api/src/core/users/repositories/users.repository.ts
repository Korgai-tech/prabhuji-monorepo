import { getPrisma } from "@api/shared/database";
import type { UserRole } from "@api/shared/schemas";
import type { LandingUserRow } from "@api/core/users/types";

/**
 * Prisma-level projection of a user row for internal consumption inside the
 * users module. Includes fields the service needs to compute the
 * onboarding-complete flip, plus the phone, which `/users/me` now returns so the
 * app can show the number notifications will go to. Still excludes
 * `passwordHash` and `email` — neither leaves the repository.
 */
export interface UserRow {
  id: string;
  name: string | null;
  selectedLanguage: string | null;
  onboardingCompletedAt: Date | null;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
}

const SELECT = {
  id: true,
  name: true,
  selectedLanguage: true,
  onboardingCompletedAt: true,
  phoneCountryCode: true,
  phoneNumber: true,
} as const;

/**
 * Users module repository — the ONLY place `@prisma/client` may be imported
 * for the users module (arch-boundaries.json enforces this).
 */
export class UsersRepository {
  async findById(userId: string): Promise<UserRow | null> {
    const row = await getPrisma().user.findUnique({
      where: { id: userId },
      select: SELECT,
    });
    return row;
  }

  /**
   * Resolve a user's authorization role (TAM-82). `null` = no such user.
   *
   * Deliberately a separate, minimal `select` rather than a field on `SELECT`:
   * this runs on EVERY `/admin/*` request via `adminMiddleware` and must stay a
   * single indexed PK lookup reading one column. It is **never cached** — the
   * whole reason `role` is a DB column instead of a JWT claim is that
   * revocation must take effect on the demoted admin's very next request
   * (ADR §B1); a cache would reintroduce exactly the lag we rejected.
   */
  async findRoleById(userId: string): Promise<UserRole | null> {
    const row = await getPrisma().user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!row) return null;
    // Compile-time drift guard: if the Prisma `user_role` enum ever gains a
    // value that `UserRoleSchema` doesn't model, THIS assignment stops
    // typechecking — an unmodelled role can never silently reach the guard.
    const role: UserRole = row.role;
    return role;
  }

  /**
   * The payer's Razorpay customer handle, or null if they have never had one.
   *
   * A separate minimal `select` rather than a field on `SELECT`, for the same
   * reason `findRoleById` is: this column is payment-module business and has no
   * place on the `/users/me` projection that `UserRow` feeds.
   */
  async findRazorpayCustomerId(userId: string): Promise<string | null> {
    const row = await getPrisma().user.findUnique({
      where: { id: userId },
      select: { razorpayCustomerId: true },
    });
    return row?.razorpayCustomerId ?? null;
  }

  /**
   * Record the handle Razorpay minted for this payer.
   *
   * Guarded on `null` so it can only ever fill an empty column, never replace a
   * populated one. Overwriting would strand the tokens hanging off the previous
   * customer — `findRecurringToken` lists them by customer id, so a mandate
   * whose customer changed underneath it becomes permanently unreadable.
   * Concurrent registrations therefore race harmlessly: the first write wins and
   * the second is a no-op.
   */
  async setRazorpayCustomerIdIfAbsent(
    userId: string,
    customerId: string
  ): Promise<void> {
    await getPrisma().user.updateMany({
      where: { id: userId, razorpayCustomerId: null },
      data: { razorpayCustomerId: customerId },
    });
  }

  /**
   * The three columns the landing ladder reads (TAM-258). `null` = no such user.
   *
   * Its own minimal `select` rather than fields on `SELECT`, for the reason
   * `findRoleById` gives: none of this is profile data, and `/users/me`'s public
   * projection has no business carrying an experiment's bookkeeping.
   */
  async findLandingRow(userId: string): Promise<LandingUserRow | null> {
    const row = await getPrisma().user.findUnique({
      where: { id: userId },
      select: {
        phoneVerifiedAt: true,
        firstUtmGroup: true,
        adLandingConsumedAt: true,
      },
    });
    return row;
  }

  /**
   * Spend the one-time ad-arrival landing.
   *
   * `updateMany` with the `IS NULL` predicate, the same shape
   * `markFirstUtmReported` and `setRazorpayCustomerIdIfAbsent` use: two app
   * launches racing each other both read a null marker, and the guard means the
   * loser overwrites nothing. The consequence of the race is that both launches
   * serve the ad landing once — which is the correct outcome, since only one of
   * them is going to navigate.
   */
  async markAdLandingConsumed(userId: string, at: Date): Promise<void> {
    await getPrisma().user.updateMany({
      where: { id: userId, adLandingConsumedAt: null },
      data: { adLandingConsumedAt: at },
    });
  }

  async updateById(
    userId: string,
    data: {
      name?: string;
      selectedLanguage?: string;
      onboardingCompletedAt?: Date;
    }
  ): Promise<UserRow> {
    const row = await getPrisma().user.update({
      where: { id: userId },
      data,
      select: SELECT,
    });
    return row;
  }
}
