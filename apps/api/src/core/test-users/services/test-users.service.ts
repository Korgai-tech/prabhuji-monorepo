import { assignTestSubjectBucket } from "@api/shared/abtest";
import { OTP_PROVIDER, loadEnv } from "@api/shared/config";
import { readSubscriptionStatuses } from "@api/shared/entitlement";
import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";
import type {
  TestUserListParams,
  TestUsersRepository,
} from "@api/core/test-users/repositories";
import type {
  CreateTestUserInput,
  CreateTestUserResult,
  TestUserBucketResult,
  TestUserPage,
} from "@api/core/test-users/types";

const log = createModuleLogger("test-users:service");

/** Stored on the abtesting test-subject when the admin leaves the note empty. */
const DEFAULT_NOTE = "prabhuji admin test user";

/** `provider` on an admin-granted Pro row — see `COMPLIMENTARY_PROVIDER` in core/subscription. */
const COMPLIMENTARY_PROVIDER = "admin_test";

export class TestUsersService {
  constructor(private readonly repo: TestUsersRepository) {}

  /**
   * Create (or re-apply settings to) an admin test user: a phone account that
   * logs in with the environment's `TEST_OTP`, optionally with complimentary
   * lifetime Pro, optionally pinned to an abtesting bucket.
   *
   * Idempotent for a test user — re-submitting the same number updates its
   * premium state and bucket, which is also how an admin retries a failed
   * bucket assignment. A number that already belongs to a REAL account is a
   * 409: turning someone's account into a fixed-OTP one would hand their login
   * to anyone who knows the test code.
   */
  async createTestUser(
    input: CreateTestUserInput,
    adminUserId: string
  ): Promise<CreateTestUserResult> {
    const env = loadEnv();
    // Without TEST_OTP the OTP provider sends this account a real SMS to a
    // number nobody holds — the account could never log in. The stub provider
    // accepts its own fixed code for everyone, so it needs no TEST_OTP.
    if (env.AUTH_OTP_PROVIDER !== OTP_PROVIDER.STUB && !env.TEST_OTP) {
      throw new AppError(
        "TEST_OTP is not configured on this environment, so a test user could not log in",
        409,
        "TEST_OTP_NOT_CONFIGURED"
      );
    }

    const user = await this.repo.ensureTestUser(input.phoneCountryCode, input.phoneNumber);
    if (!user.isTestUser) {
      throw new AppError(
        "This phone number already belongs to a real account",
        409,
        "PHONE_BELONGS_TO_REAL_USER"
      );
    }

    // Seed first so a revoke (`premium: false`) has a row to land on; the seed
    // is a no-op for a row that already exists.
    await performServiceCall(
      "subscription",
      (svc) => svc.createFreeSubscriptionForUser(user.id),
      "test-users:create",
      "failed to seed the test user's subscription"
    );
    await performServiceCall(
      "subscription",
      (svc) => svc.setComplimentaryPro(user.id, input.premium),
      "test-users:create",
      "failed to set the test user's premium state"
    );

    const bucket = await this.assignBucket(user.id, input);

    // The full number IS logged, as the OTP provider logs a test number: this
    // is a login bypass, and its audit trail must say which account it opened.
    log.warn(
      {
        event: "admin_test_user_saved",
        admin_user_id: adminUserId,
        user_id: user.id,
        phone_number: `${input.phoneCountryCode}${input.phoneNumber}`,
        created: user.created,
        premium: input.premium,
        bucket: bucket.requested,
        bucket_assigned: bucket.assigned,
      },
      user.created ? "admin created a test user" : "admin updated a test user"
    );

    return {
      userId: user.id,
      phoneCountryCode: input.phoneCountryCode,
      phoneNumber: input.phoneNumber,
      created: user.created,
      premium: input.premium,
      bucket,
    };
  }

  /**
   * The user and its premium state are already committed by now, so a failed
   * assignment is REPORTED rather than thrown — the admin sees what is missing
   * and re-submits, instead of getting an error for an account that exists.
   */
  private async assignBucket(
    userId: string,
    input: CreateTestUserInput
  ): Promise<TestUserBucketResult> {
    if (input.bucket === undefined || input.bucket === null) {
      return { requested: null, assigned: false, error: null };
    }
    // The subject id is the user's UUID — what every experiment evaluates on
    // (see `otp.service.ts`), not the phone number.
    const note = input.note?.trim() || DEFAULT_NOTE;
    const outcome = await assignTestSubjectBucket(userId, input.bucket, note);
    if (!outcome.ok) {
      return { requested: input.bucket, assigned: false, error: outcome.message };
    }
    // Recorded only once the service has it, so the list never shows a bucket
    // the user is not actually pinned to.
    await this.repo.recordBucket(userId, input.bucket);
    return { requested: input.bucket, assigned: true, error: null };
  }

  /** A page of test users with their premium state and recorded bucket. */
  async listTestUsers(params: TestUserListParams): Promise<TestUserPage> {
    const { rows, total } = await this.repo.listTestUsers(params);
    const statuses = await readSubscriptionStatuses(
      rows.map((row) => row.id),
      "test-users:list"
    );
    return {
      items: rows.map((row) => {
        const status = statuses[row.id];
        return {
          userId: row.id,
          phoneCountryCode: row.phoneCountryCode,
          phoneNumber: row.phoneNumber,
          premium: status?.isEntitled ?? false,
          subscriptionStatus: status?.status ?? "free",
          complimentary: status?.provider === COMPLIMENTARY_PROVIDER,
          bucket: row.testBucket,
          firstLoginAt: row.phoneVerifiedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        };
      }),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }
}
