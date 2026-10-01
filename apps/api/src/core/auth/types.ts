import type { LoginType } from "@api/shared/schemas";

/**
 * The authenticated caller, as `authMiddleware` puts it on `req.user`.
 *
 * `email` is NULLABLE because it is null for every `otp` account — the mobile
 * app's entire user base. Only `email`-login accounts (the admin CMS) have one.
 * Anything reading it must handle null; anything that genuinely requires an
 * email is, by construction, an admin-only surface.
 */
export interface AuthUser {
  id: string;
  email: string | null;
}

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

/**
 * The `sort` allowlist for `GET /admin/users` (ADR §C2). Deliberately short:
 * `createdAt` is "when did they sign up", which is the only ordering an editor
 * actually asks for, and `email` keeps the pre-existing alphabetical view.
 *
 * NOTHING else may be added without thought — this list becomes Prisma's
 * `orderBy` column, and `User` holds `passwordHash`.
 */
export const USER_SORT_FIELDS = ["createdAt", "email"] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

/** Params `GET /admin/users` passes down to the repository. */
export interface ListUsersParams {
  page: number;
  pageSize: number;
  sort?: UserSortField;
  order: "asc" | "desc";
  /** Free-text match over phone / email / name. */
  q?: string;
}

/**
 * One admin list row — always a NON-admin account (the repository excludes
 * admins, so there is no `role` to carry). `phoneNumber` is plaintext PII —
 * never log it.
 */
export interface AdminUserListRow {
  id: string;
  email: string | null;
  name: string | null;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  loginType: LoginType;
  /** ISO-8601 on the wire; the repository maps the Prisma `Date`. */
  createdAt: string;
  /**
   * When the phone was proved reachable (TAM-154). NULL is a real state, not
   * missing data — the row is written at OTP SEND, so a null here is a lead who
   * never entered the code. Always null for email-login accounts.
   */
  phoneVerifiedAt: string | null;
}

export interface AdminUserPage {
  items: AdminUserListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * What the boot-time bootstrap-admin path did (TAM-82). Returned so `src/index.ts`
 * can log a precise, password-free line and so the outcome is assertable.
 *
 *   "created"   — no such user; created with role admin + a bcrypt-hashed password
 *   "promoted"  — user existed as a non-admin; role set to admin, password untouched
 *   "unchanged" — user existed and was already an admin (the steady state)
 */
export type BootstrapAdminOutcome = "created" | "promoted" | "unchanged";
