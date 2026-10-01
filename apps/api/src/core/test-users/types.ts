/**
 * TAM-187 — admin-created QA accounts. See `core/test-users/index.ts`.
 */

export interface CreateTestUserInput {
  phoneCountryCode: "+91";
  /** 10-digit Indian mobile, validated at the route boundary. */
  phoneNumber: string;
  /** Grant complimentary lifetime Pro (true) or leave/revert to free (false). */
  premium: boolean;
  /** Abtesting bucket to pin the user to, `[0, 1000)`; omit for none. */
  bucket?: number | null;
  /** Free-text note stored on the abtesting test-subject. */
  note?: string;
}

export interface TestUserBucketResult {
  /** The bucket that was asked for, or null when none was. */
  requested: number | null;
  assigned: boolean;
  /** Why the assignment failed; null when it succeeded or was not requested. */
  error: string | null;
}

export interface CreateTestUserResult {
  userId: string;
  phoneCountryCode: string;
  phoneNumber: string;
  /** False when the call re-applied settings to an existing test user. */
  created: boolean;
  premium: boolean;
  bucket: TestUserBucketResult;
}

export interface TestUserListItem {
  userId: string;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  /** Entitled to Pro right now — the same answer every Pro gate gets. */
  premium: boolean;
  /** Raw subscription status (`free`, `active`, `trialing`, …). */
  subscriptionStatus: string;
  /** True when the Pro is the admin grant, not a real purchase or trial. */
  complimentary: boolean;
  /** Last bucket the abtesting service accepted for this user; null if never pinned. */
  bucket: number | null;
  /** First successful OTP login; null if the tester has never logged in. */
  firstLoginAt: string | null;
  createdAt: string;
}

export interface TestUserPage {
  items: TestUserListItem[];
  total: number;
  page: number;
  pageSize: number;
}
