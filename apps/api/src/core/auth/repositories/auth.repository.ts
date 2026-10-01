import type { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import { ADMIN_ROLE, type LoginType, type UserRole } from "@api/shared/schemas";
import type { AdminUserPage, ListUsersParams } from "@api/core/auth/types";

/**
 * `email` and `passwordHash` are nullable because a phone account has neither —
 * `loginType` is what says which of them a row is supposed to carry, and the
 * `user_login_type_shape` CHECK is what guarantees the row agrees. `login`
 * branches on `loginType` before it ever reaches bcrypt.
 */
export interface UserRecord {
  id: string;
  email: string | null;
  name: string | null;
  passwordHash: string | null;
  role: UserRole;
  loginType: LoginType;
}

function toRecord(u: {
  id: string;
  email: string | null;
  name: string | null;
  passwordHash: string | null;
  role: UserRole;
  loginType: LoginType;
}): UserRecord {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    passwordHash: u.passwordHash,
    role: u.role,
    loginType: u.loginType,
  };
}

export class AuthRepository {
  /**
   * TAM-82: `role` is a REQUIRED parameter, not an optional with a `user`
   * default. A default would let a future caller create a user without
   * thinking about the role at all; requiring it forces every creation site to
   * state its intent, and there are exactly two: `register` (always `"user"`)
   * and the bootstrap-admin path (`"admin"`).
   *
   * `loginType` is required for the same reason, and both callers pass
   * `EMAIL_LOGIN` — this repository only ever creates credentialed accounts.
   * Phone accounts are created by `core/otp`, which owns the `otp` side.
   */
  async createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
    role: UserRole;
    loginType: LoginType;
  }): Promise<UserRecord> {
    const u = await getPrisma().user.create({ data: input });
    return toRecord(u);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const u = await getPrisma().user.findUnique({ where: { email } });
    return u ? toRecord(u) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const u = await getPrisma().user.findUnique({ where: { id } });
    return u ? toRecord(u) : null;
  }

  /**
   * Promote/demote a user's role. TAM-82 has exactly ONE caller: the boot-time
   * bootstrap-admin path. It is deliberately NOT reachable from any route,
   * controller, or facade — `IUsersApi` exposes `getRole` (read) and nothing
   * else, so no request can ever change a role.
   */
  async updateRole(id: string, role: UserRole): Promise<void> {
    await getPrisma().user.update({ where: { id }, data: { role } });
  }

  /**
   * One page of the admin user list (ADR §C2 — offset + a `total`, because an
   * editor needs "page 7 of 23"). The `count` is a second query against the
   * SAME `where`, which is the accepted cost of rendering that.
   *
   * PII: this method READS `phoneNumber` (plaintext) and must never log it —
   * the repo-wide rule is `country_code` + length only. There is no log line
   * here at all, which is the easiest way to keep that true.
   */
  async listUsers(params: ListUsersParams): Promise<AdminUserPage> {
    const where = buildUserWhere(params.q);

    const [rows, total] = await Promise.all([
      getPrisma().user.findMany({
        where,
        // No `sort` ⇒ newest first. An admin opening the list wants the people
        // who just signed up, not the oldest rows in the table.
        orderBy: params.sort
          ? { [params.sort]: params.order }
          : { createdAt: "desc" },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_LIST_SELECT,
      }),
      getPrisma().user.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        // Null is meaningful here, not missing data: TAM-154 writes the row at
        // OTP send, so a null is someone who asked for a code and never entered
        // it — a lead, not a signup.
        phoneVerifiedAt: row.phoneVerifiedAt?.toISOString() ?? null,
      })),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }
}

// No `role`: `buildUserWhere` excludes admins, so every row here is a non-admin
// and the column would be a constant on the wire.
const ADMIN_LIST_SELECT = {
  id: true,
  email: true,
  name: true,
  phoneCountryCode: true,
  phoneNumber: true,
  loginType: true,
  createdAt: true,
  phoneVerifiedAt: true,
} as const;

/**
 * A full UUID, which is what `User.id` is. Used to decide whether `q` is an id.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The `q` filter: one search box over id / phone / email / name, because the
 * editor has one identifier in hand and does not know which column it lives in.
 *
 * The id clause is an EXACT match on a full UUID, not a `contains`. Two reasons,
 * and the first is fatal on its own: `id` is `@db.Uuid`, so a `contains` becomes
 * `uuid LIKE text` in Postgres — an "operator does not exist" error, not a slow
 * query. Second, a partial id is not something anyone types; ids get pasted
 * whole, out of a log line or a support ticket.
 *
 * The phone clause matches on DIGITS ONLY. `phoneNumber` is stored bare
 * ("9876543210") with the country code in its own column, so a search typed or
 * pasted the way the number is *displayed* — "+91 98765 43210" — matches
 * nothing under a raw `contains`. Stripping to digits fixes the spaces; the
 * `slice(-10)` fallback fixes the pasted country code (as one extra OR term,
 * not a second round-trip).
 *
 * ponytail: `slice(-10)` assumes a 10-digit national number, which is every
 * number this app stores today (+91). If a country with a different length is
 * ever onboarded, match against `phoneCountryCode || phoneNumber` in raw SQL
 * instead — Prisma cannot express a concat comparison.
 */
export function buildUserWhere(q?: string): Prisma.UserWhereInput {
  // ADMINS ARE NEVER LISTED. This is the endpoint's contract, not a UI default:
  // the list is the app's user base, and a CMS operator account is not part of
  // it. Applied HERE rather than as an optional filter param so there is no
  // querystring that turns it off, and so the `total` an editor reads is the
  // count of what they can actually see.
  //
  // `not: admin` rather than `= user` so a third role added later (an editor,
  // say) still shows up as a non-admin account instead of vanishing silently.
  const notAdmin = { role: { not: ADMIN_ROLE } } satisfies Prisma.UserWhereInput;

  if (!q) return notAdmin;

  const digits = q.replace(/\D/g, "");
  const phoneTerms = digits
    ? [digits, ...(digits.length > 10 ? [digits.slice(-10)] : [])]
    : [];

  // `role` and `OR` are ANDed — the search narrows the non-admin set, it does
  // not widen it back to include admins.
  return {
    ...notAdmin,
    OR: [
      ...(UUID_RE.test(q) ? [{ id: q }] : []),
      ...phoneTerms.map((term) => ({ phoneNumber: { contains: term } })),
      { email: { contains: q, mode: "insensitive" as const } },
      { name: { contains: q, mode: "insensitive" as const } },
    ],
  };
}
