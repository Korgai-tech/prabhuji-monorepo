import { getPrisma } from "@api/shared/database";
import { OTP_LOGIN } from "@api/shared/schemas";

export interface UpsertResult {
  user: {
    id: string;
    phoneCountryCode: string | null;
    phoneNumber: string | null;
    /**
     * The row's insert moment, which since TAM-154 is the OTP SEND, not this
     * verify. Read by `bk_account_created`'s `account_created_at`.
     */
    createdAt: Date;
  };
  isNewUser: boolean;
}

/**
 * OTP module repository. All Prisma access lives here per the layered
 * architecture (arch-boundaries.json enforces this).
 *
 * A phone signup writes a phone and NOTHING else. It used to have to fabricate
 * an `otp-<id>@prabhuji.internal` address and 32 random bytes of hex, because
 * `email` and `passwordHash` were NOT NULL for the email-login path — which also
 * forced a create-then-update, since the fake address embedded the id Prisma
 * only assigns on insert. Both columns are nullable now and `loginType` states
 * which credentials a row is supposed to have, so this is a single insert.
 *
 * TAM-154 split that single insert in two. The row is now written at OTP SEND
 * (`ensureUserForPhone`) so a lead who never comes back still leaves a userId and
 * a number someone can call; the verify handler only STAMPS it
 * (`markPhoneVerified`). That means "a row exists" no longer proves the phone was
 * verified — `phoneVerifiedAt` does, and it is also where `isNewUser` now comes
 * from.
 */
export class OtpRepository {
  /**
   * Find-or-create the row for a phone, unverified. Called on every accepted
   * send, so it must be idempotent AND race-free: `/auth/otp/send` is public, and
   * two sends for the same number can be in flight at once.
   *
   * `createMany` + `skipDuplicates` is one `INSERT ... ON CONFLICT DO NOTHING`,
   * which is why it beats `upsert` here — Prisma lowers `upsert` to a native
   * upsert only when it judges the query to qualify, and otherwise emits a
   * SELECT-then-INSERT that throws P2002 under exactly that concurrency. Same
   * call shape, same reason, as `EngagementRepository.like`.
   *
   * `email` and `passwordHash` are left NULL deliberately — there is no password
   * path for this account, and `user_login_type_shape` rejects the row outright
   * if `loginType` and the populated columns ever disagree.
   *
   * Returns the id. `createMany` cannot report it (`ON CONFLICT DO NOTHING`
   * returns no row on the conflicting path, which is the common one here), so
   * the id comes from a follow-up read on the same unique key — the insert
   * above guarantees the row is there.
   */
  async ensureUserForPhone(
    phoneCountryCode: string,
    phoneNumber: string
  ): Promise<string> {
    const prisma = getPrisma();

    await prisma.user.createMany({
      data: [{ phoneCountryCode, phoneNumber, loginType: OTP_LOGIN }],
      skipDuplicates: true,
    });

    const { id } = await prisma.user.findUniqueOrThrow({
      where: { user_phone_unique: { phoneCountryCode, phoneNumber } },
      select: { id: true },
    });

    return id;
  }

  /**
   * TAM-187 — is this phone an admin-created test account? Read on every send
   * and resend by `LocalOtpProvider` (only when `TEST_OTP` is configured), so
   * it is a single-column lookup on the `user_phone_unique` index.
   */
  async isTestUserPhone(phoneCountryCode: string, phoneNumber: string): Promise<boolean> {
    const user = await getPrisma().user.findUnique({
      where: { user_phone_unique: { phoneCountryCode, phoneNumber } },
      select: { isTestUser: true },
    });
    return user?.isTestUser ?? false;
  }

  /**
   * Stamp the first successful verify, and report whether THIS call was the one
   * that did it.
   */
  async markPhoneVerified(
    phoneCountryCode: string,
    phoneNumber: string
  ): Promise<UpsertResult> {
    const prisma = getPrisma();

    // NOT redundant with the send-time write. OTP sessions live in Redis for
    // ~15 minutes, so a verify can still arrive for a code the PREVIOUS deploy
    // sent — back when nothing was written at send.
    await this.ensureUserForPhone(phoneCountryCode, phoneNumber);

    // Conditional single-statement flip, the same shape as
    // `UsersRepository.setRazorpayCustomerIdIfAbsent`. `count === 1` is the only
    // admissible source of `isNewUser`: two concurrent verifies that each READ a
    // null would both claim to be the first. Postgres re-evaluates the `IS NULL`
    // predicate after the row lock is released, so the loser gets 0.
    const flipped = await prisma.user.updateMany({
      where: { phoneCountryCode, phoneNumber, phoneVerifiedAt: null },
      data: { phoneVerifiedAt: new Date() },
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { user_phone_unique: { phoneCountryCode, phoneNumber } },
      select: {
        id: true,
        phoneCountryCode: true,
        phoneNumber: true,
        createdAt: true,
      },
    });
    return { user, isNewUser: flipped.count === 1 };
  }

  /**
   * The userId behind a phone, or null if there is none.
   *
   * Exists for the analytics on a FAILED verify, which has no user on its stack
   * — the send-time row (TAM-154) is what makes that attributable at all, and
   * before it a failed login was structurally anonymous. Null is still possible
   * for a session whose row was deleted, so the caller must handle it.
   */
  async findIdByPhone(
    phoneCountryCode: string,
    phoneNumber: string
  ): Promise<string | null> {
    const row = await getPrisma().user.findUnique({
      where: { user_phone_unique: { phoneCountryCode, phoneNumber } },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * When this user's first campaign was reported, or null if it never was.
   *
   * The once-only marker for `bk_first_utm_source_success`. It has to be a column
   * because the upstream referral service's `/latest` route returns exactly ONE
   * row — the newest touch — and carries no id or timestamp for the oldest one, so
   * "is this the user's first campaign?" is not answerable from the response. Our
   * own "have we ever reported one for them" is, and this is where that lives.
   *
   * Null also covers "no such user" (a session whose row was deleted). The stamp
   * below is guarded, so treating that as a first capture writes nothing.
   */
  async findFirstUtmReportedAt(userId: string): Promise<Date | null> {
    const row = await getPrisma().user.findUnique({
      where: { id: userId },
      select: { firstUtmReportedAt: true },
    });
    return row?.firstUtmReportedAt ?? null;
  }

  /**
   * Stamp the marker — and, with it, the campaign that earned it (TAM-258).
   *
   * `updateMany` with the `IS NULL` predicate for the same reason
   * `markPhoneVerified` uses one: two verifies in flight for the same phone both
   * read a null marker, and the guard means the loser overwrites nothing. The
   * count is deliberately not returned — the caller has already emitted by the
   * time it lands, and the duplicate `first` that a race produces is collapsible
   * because its `insert_id` is keyed on the user.
   *
   * `firstUtmGroup` rides the SAME guarded write rather than getting its own.
   * That is what makes the two columns unable to disagree: the ad group named
   * here is, by construction, the one from the touch that stamped the marker. A
   * separate write could be interleaved by a concurrent verify and leave the
   * marker from one campaign beside the group from another — and because both
   * are once-only, nothing downstream would ever correct it.
   *
   * A blank or absent group writes `null`: "" is not a campaign name, and
   * storing it would make `utm_unmatched` (a real ad group we could not read)
   * indistinguishable from `utm_missing` (organic).
   */
  async markFirstUtmReported(
    userId: string,
    at: Date,
    firstUtmGroup: string | null
  ): Promise<void> {
    const group = (firstUtmGroup ?? "").trim();
    await getPrisma().user.updateMany({
      where: { id: userId, firstUtmReportedAt: null },
      data: { firstUtmReportedAt: at, firstUtmGroup: group === "" ? null : group },
    });
  }
}
