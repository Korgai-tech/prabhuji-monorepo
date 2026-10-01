import { getPrisma } from "@api/shared/database";

/**
 * Dev-tools repository — the ONLY place `@prisma/client` (via `getPrisma`) may
 * be touched for this module. Reads the `users` table by phone number and writes
 * the `subscriptions` row directly (this throwaway module intentionally does not
 * route through the subscription module's facade, whose write surface is a
 * free-tier-only upsert).
 */
export interface MarkProRow {
  userId: string;
  status: string;
  expiresAt: Date | null;
}

export class DevtoolsRepository {
  /** Resolve a userId from the same compound phone key the OTP module writes. */
  async findUserIdByPhone(
    phoneCountryCode: string,
    phoneNumber: string
  ): Promise<string | null> {
    const user = await getPrisma().user.findUnique({
      where: { user_phone_unique: { phoneCountryCode, phoneNumber } },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  /**
   * Upsert the user's subscription to `status: 'active'`. Creates the row if the
   * free-tier seed never ran; otherwise overwrites the state to active. `provider`
   * is stamped `devtools` so these rows are greppable when this module is removed.
   */
  async markPro(userId: string, expiresAt: Date): Promise<MarkProRow> {
    const now = new Date();
    const active = {
      status: "active",
      provider: "devtools",
      activePlanId: "devtools-pro",
      activeProductId: "devtools-pro",
      startedAt: now,
      expiresAt,
    };
    const row = await getPrisma().subscription.upsert({
      where: { userId },
      create: { userId, ...active },
      update: active,
      select: { userId: true, status: true, expiresAt: true },
    });
    return row;
  }
}
