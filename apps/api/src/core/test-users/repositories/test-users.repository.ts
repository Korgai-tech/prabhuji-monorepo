import { getPrisma } from "@api/shared/database";
import { OTP_LOGIN } from "@api/shared/schemas";

export interface TestUserRow {
  id: string;
  isTestUser: boolean;
}

export interface TestUserListRow {
  id: string;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  testBucket: number | null;
  phoneVerifiedAt: Date | null;
  createdAt: Date;
}

export interface TestUserListParams {
  page: number;
  pageSize: number;
  /** Substring of the national number. */
  q?: string;
}

/**
 * Test-users repository — the only place this module touches Prisma. Writes the
 * `User` row in the same shape the OTP send writes (`ensureUserForPhone`), plus
 * `isTestUser`.
 */
export class TestUsersRepository {
  /**
   * Find-or-create the row for a phone, flagged as a test user ONLY if this call
   * creates it. `createMany` + `skipDuplicates` is one
   * `INSERT ... ON CONFLICT DO NOTHING`, so an existing row — a real user who
   * got there first, even concurrently — keeps `isTestUser: false`, and the
   * caller refuses on that. `created` is the insert count, the only race-free
   * answer to "did this call make it".
   */
  async ensureTestUser(
    phoneCountryCode: string,
    phoneNumber: string
  ): Promise<TestUserRow & { created: boolean }> {
    const prisma = getPrisma();
    const { count } = await prisma.user.createMany({
      data: [{ phoneCountryCode, phoneNumber, loginType: OTP_LOGIN, isTestUser: true }],
      skipDuplicates: true,
    });
    const row = await prisma.user.findUniqueOrThrow({
      where: { user_phone_unique: { phoneCountryCode, phoneNumber } },
      select: { id: true, isTestUser: true },
    });
    return { ...row, created: count === 1 };
  }

  /**
   * Record the bucket the abtesting service just ACCEPTED. Guarded on
   * `isTestUser` so a real account can never carry one.
   */
  async recordBucket(userId: string, bucket: number): Promise<void> {
    await getPrisma().user.updateMany({
      where: { id: userId, isTestUser: true },
      data: { testBucket: bucket },
    });
  }

  /** One page of test users, newest first. */
  async listTestUsers(
    params: TestUserListParams
  ): Promise<{ rows: TestUserListRow[]; total: number }> {
    const where = {
      isTestUser: true,
      ...(params.q ? { phoneNumber: { contains: params.q } } : {}),
    };
    const [rows, total] = await Promise.all([
      getPrisma().user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          id: true,
          phoneCountryCode: true,
          phoneNumber: true,
          testBucket: true,
          phoneVerifiedAt: true,
          createdAt: true,
        },
      }),
      getPrisma().user.count({ where }),
    ]);
    return { rows, total };
  }
}
