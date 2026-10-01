import { createModuleLogger } from "@api/shared/logs";
import { EXPIRE_SWEEP_BATCH } from "@api/core/subscription/repositories";
import type {
  SubscriptionRepository,
  SubscriptionRow,
} from "@api/core/subscription/repositories";
import { subscriptionAnalytics } from "./subscription-analytics.service.js";
import type {
  DebitFailedInput,
  DebitSucceededInput,
  MandateAuthorizedInput,
  MandateAuthorizedResult,
  MandateEndedInput,
  PendingMandateInput,
  SubscriptionStatus,
  SubscriptionStatusValue,
  SubscriptionTxHandle,
} from "@api/core/subscription/types";

const log = createModuleLogger("subscription:service");

/**
 * Known status values recognized by the API. Anything else in the DB gets
 * defensively narrowed to `'free'` at read time — protects the wire
 * response against manual DB edits inserting unexpected strings.
 */
const KNOWN_STATUSES: readonly SubscriptionStatusValue[] = [
  "free",
  "pending",
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "expired",
];

/**
 * The subset of a subscription row `computeIsEntitled` needs. Structural, so
 * both a full `SubscriptionRow` and a hand-built test fixture satisfy it.
 */
export interface EntitlementInput {
  status: string;
  expiresAt: Date | null;
  trialEndsAt: Date | null;
  graceUntil: Date | null;
}

/**
 * THE entitlement rule. Pure, total, and the single definition in the
 * codebase — five content modules used to duplicate `status === "active"`,
 * which was wrong in two directions:
 *
 *   - it locked out `trialing` and in-grace `past_due` users, who HAVE paid
 *     (or are inside a trial we granted) and must see Pro content;
 *   - it let an `active` row whose `expiresAt` passed keep full access
 *     forever, because nothing on the read path ever compared it to now.
 *     Devtools rows carry a ~100-year expiry, which is why that never bit.
 *
 * A null date means "no deadline" and grants access — an `active` row with
 * no `expiresAt` is a lifetime grant (that's exactly what devtools writes).
 * Fail-OPEN on a null date is safe here; fail-CLOSED on an unknown status is
 * handled upstream by `narrowStatus`, which collapses anything unrecognized
 * to `free`.
 */
/** The later of two deadlines, treating null as "no deadline of this kind". */
function laterOf(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

export function computeIsEntitled(row: EntitlementInput, now: Date): boolean {
  const before = (deadline: Date | null): boolean =>
    deadline === null || now < deadline;

  switch (narrowStatus(row.status)) {
    case "trialing":
      return before(row.trialEndsAt);
    case "active":
      return before(row.expiresAt);
    // Dunning: entitled only while the grace window is open. A null
    // `graceUntil` on a `past_due` row means the window was never opened, so
    // this is the one case where null does NOT grant access.
    case "past_due":
      return row.graceUntil !== null && now < row.graceUntil;
    // Cancelled but paid through the end of the current period — OR still
    // inside the trial we granted. Whichever runs out later wins: a user who
    // cancels keeps exactly what they already had, and cancelling must never
    // take away access they have not yet used up.
    //
    // Both dates are earned before they can be read here. `expiresAt` is only
    // ever written by `applyDebitSucceeded` (a debit that actually settled),
    // and `trialEndsAt` only by `applyMandateAuthorized` (an approval that
    // actually happened) — so a FUTURE deadline on a cancelled row always
    // corresponds to something real. That is what makes it safe to grant here
    // without asking why the mandate ended.
    //
    // Unlike `active`, a null date grants NOTHING rather than being a lifetime
    // pass: with both null there is no period to be inside of, which is the
    // shape of a mandate that ended before it ever paid for anything.
    case "cancelled": {
      const until = laterOf(row.expiresAt, row.trialEndsAt);
      return until !== null && now < until;
    }
    case "free":
    case "pending":
    case "expired":
      return false;
  }
}

/**
 * WHEN the current entitlement runs out, or `null` for "no deadline".
 *
 * The companion to `computeIsEntitled`, and deliberately adjacent to it: the two
 * must agree, and the shared table test asserts the pairing in both directions
 * (entitled ⇒ now is before the deadline; past the deadline ⇒ not entitled).
 *
 * Exists so the CLIENT can hold a deadline instead of a bare boolean.
 * `EntitlementNotifier` caches `isEntitled` and — correctly — keeps the previous
 * value when a refresh fails, so a user whose trial ends while the app is
 * backgrounded kept a Pro UI indefinitely, with every failed refresh extending
 * it. Publishing the deadline lets the client REVOKE on its own without ever
 * being able to GRANT: it holds an expiry, never the rule.
 *
 * A null return means "nothing to expire", which is not the same as "not
 * entitled" — an `active` row with no `expiresAt` is a lifetime grant (that is
 * exactly what devtools writes).
 */
export function entitlementDeadline(row: EntitlementInput): Date | null {
  switch (narrowStatus(row.status)) {
    case "trialing":
      return row.trialEndsAt;
    case "active":
      return row.expiresAt;
    case "past_due":
      return row.graceUntil;
    case "cancelled":
      return row.expiresAt;
    case "free":
    case "pending":
    case "expired":
      return null;
  }
}

/**
 * Business-logic layer for the subscription module (TAM-47).
 *
 * Phase 1 responsibilities:
 *   1. Read the current subscription state for a user. If no row exists
 *      (data bug — every user SHOULD have one after the OTP module seeds
 *      it), return the free shape defensively so the wire response is
 *      still well-formed. Log the anomaly.
 *   2. Idempotently seed the free-tier row for a new user. This is the
 *      hook TAM-43's OTP verify calls via the facade + `performServiceCall`.
 *
 * `status` is still returned verbatim — the write path owns transitions, and
 * a stale `active` row is NOT rewritten to `expired` on read (reads stay
 * pure; the billing-cycle sweep owns that). What the read path DOES do is
 * compute `isEntitled` against `now`, so a lapsed row grants nothing even
 * before the sweep gets to it.
 *
 * Explicitly NOT here:
 *   - Any `activate` / `cancel` / `expire` state transition.
 *
 * PII hygiene: log lines carry `userId` + `status` only. Never
 * `providerSubscriptionId`, never `expiresAt` co-located with a user
 * identifier in a way that could correlate.
 */
export class SubscriptionService {
  constructor(private readonly repo: SubscriptionRepository) {}

  async getStatus(userId: string): Promise<SubscriptionStatus> {
    const startedAt = Date.now();
    const row = await this.repo.findByUserId(userId);
    if (!row) {
      // Every user gets a row seeded by the OTP module at creation time —
      // absence here is a data bug (missed seed, manual delete). Fall back
      // to the free shape so the client isn't broken, and log at `warn` so
      // ops notice the anomaly. We MUST NOT auto-seed here — reads stay
      // pure; the write path is the sole owner.
      log.warn(
        { user_id: userId, event: "subscription_status_missing_row" },
        "no subscription row for user — defaulting to free"
      );
      return FREE_STATUS;
    }

    // One `now` for the whole computation — reading the clock twice could
    // straddle a trial/grace boundary and produce a response whose
    // `isEntitled` disagrees with its own `trialEndsAt`.
    const response = toStatus(row, new Date());
    const { status, isEntitled } = response;

    log.info(
      {
        event: "subscription_status_fetched",
        user_id: userId,
        status,
        is_entitled: isEntitled,
        latency_ms: Date.now() - startedAt,
      },
      "subscription status fetched"
    );

    return response;
  }

  /**
   * TAM-187 — `getStatus` for a batch, keyed by userId, in ONE query. For
   * admin listings; a user with no row gets the free shape, as in `getStatus`.
   */
  async getStatuses(userIds: string[]): Promise<Record<string, SubscriptionStatus>> {
    const rows = await this.repo.findByUserIds(userIds);
    const now = new Date();
    const byUser = new Map(rows.map((row) => [row.userId, row]));
    return Object.fromEntries(
      userIds.map((id) => {
        const row = byUser.get(id);
        return [id, row ? toStatus(row, now) : { ...FREE_STATUS }];
      })
    );
  }

  /**
   * Idempotent seed hook — the OTP module calls this via the facade after
   * a new User is created so every user gets a `subscriptions` row with
   * `status: 'free'`. Safe to call for existing users (the underlying
   * repository upsert no-ops on update).
   *
   * `tx` is optional — pass the Prisma transaction client when the seed
   * should join a caller's `$transaction(...)`. The OTP module currently
   * calls this AFTER the User transaction commits (spec §"Final approach"
   * step 3) so passes no `tx` — best-effort atomicity is acceptable because
   * `getStatus` defensively returns the free shape when no row exists.
   */
  async createFreeSubscriptionForUser(
    userId: string,
    tx?: SubscriptionTxHandle
  ): Promise<void> {
    const row = await this.repo.upsertFreeForUser(userId, tx);
    log.info(
      {
        event: "subscription_free_seeded",
        user_id: userId,
        // Whether the upsert created a new row vs. found an existing one is
        // not exposed by Prisma's `upsert` — approximate by comparing
        // createdAt vs updatedAt. Purely informational.
        was_new: row.createdAt.getTime() === row.updatedAt.getTime(),
      },
      "free subscription row seeded"
    );
  }

  /**
   * Has this user ever been granted a free trial?
   *
   * `trialConsumedAt` is stamped the first time a trial is actually granted
   * and never cleared, so this is the ONLY correct answer to "may they have a
   * trial". A missing row means a brand-new user, who may.
   */
  async hasConsumedTrial(userId: string): Promise<boolean> {
    const row = await this.repo.findByUserId(userId);
    return row?.trialConsumedAt != null;
  }

  // ---- billing transitions -------------------------------------------------
  //
  // Thin over the repository, which enforces idempotence + monotonicity in the
  // `WHERE` clause. The value added here is the audit log: every one of these
  // moves money-backed entitlement, so each logs whether it actually changed a
  // row. A `changed: 0` is not an error — it means the guard correctly
  // rejected a replay or an out-of-order callback — but it must be visible,
  // because a burst of them is how a genuinely stuck subscription looks.

  async applyPendingMandate(input: PendingMandateInput): Promise<void> {
    const changed = await this.repo.applyPendingMandate(input);
    this.logTransition("pending_mandate", input.userId, changed);
  }

  /**
   * Reports its result, unlike most of its siblings — see
   * `MandateAuthorizedResult`. `core/payment` emits `bk_trial_success` off
   * `trialFirstConsumed`, so the answer has to survive the trip back up.
   */
  async applyMandateAuthorized(
    input: MandateAuthorizedInput
  ): Promise<MandateAuthorizedResult> {
    const result = await this.repo.applyMandateAuthorized({
      ...input,
      now: new Date(),
    });
    this.logTransition("mandate_authorized", input.userId, result.changed, {
      granted_trial: input.trialEndsAt !== null,
      // The once-per-user fact, in the audit log as well as the return value:
      // a "missing trial start" report is answered from here.
      trial_first_consumed: result.trialFirstConsumed,
    });
    return result;
  }

  async applyDebitSucceeded(input: DebitSucceededInput): Promise<void> {
    const changed = await this.repo.applyDebitSucceeded(input);
    this.logTransition("debit_succeeded", input.userId, changed, {
      period_end: input.periodEnd.toISOString(),
    });
  }

  /**
   * Returns the changed-row count, unlike its siblings. The payment module's
   * billing cycle emits `bk_subscription_past_due` off this, and the
   * `DUNNABLE_STATES` guard can legitimately reject the write — a row that
   * never moved into dunning must not report that it did.
   */
  async applyDebitFailed(input: DebitFailedInput): Promise<number> {
    const changed = await this.repo.applyDebitFailed(input);
    this.logTransition("debit_failed", input.userId, changed, {
      grace_until: input.graceUntil.toISOString(),
    });
    return changed;
  }

  async applyMandateEnded(input: MandateEndedInput): Promise<void> {
    const changed = await this.repo.applyMandateEnded(input);
    this.logTransition("mandate_ended", input.userId, changed, {
      reason: input.reason,
    });
  }

  /**
   * Sweep rows whose entitlement deadline has passed so `status` agrees with
   * what `computeIsEntitled` already reports. Returns the count for the
   * billing-cycle report.
   *
   * `bk_subscription_expired` is emitted HERE, per swept row, rather than by
   * the billing cycle that calls this: expiry is the one entitlement transition
   * with no mandate in scope, so the payment module has nothing to add and the
   * facade keeps returning a plain count.
   */
  async expireLapsed(now: Date): Promise<number> {
    const rows = await this.repo.expireLapsed(now);
    if (rows.length > 0) {
      log.info(
        {
          event: "subscription_expire_sweep",
          expired_count: rows.length,
          // The tick hit its ceiling, so there is very likely a backlog left
          // for the next one. Visible rather than silently truncated.
          batch_capped: rows.length >= EXPIRE_SWEEP_BATCH,
        },
        "swept lapsed subscriptions to expired"
      );
      // Awaited, not `void`ed: the sweep runs in a one-off task that exits when
      // it returns, and a floating promise there is an event dropped at process
      // exit. It cannot reject — see `SubscriptionAnalyticsService`.
      await subscriptionAnalytics.trackSubscriptionsExpired(rows, now);
    }
    return rows.length;
  }

  /**
   * TAM-187 — grant (`enabled`) or revoke complimentary lifetime Pro on an
   * admin-created test user. Only `core/test-users` calls this, and only for a
   * user it has confirmed is a test account.
   */
  async setComplimentaryPro(userId: string, enabled: boolean): Promise<void> {
    await this.repo.setComplimentaryPro(userId, enabled);
    log.warn(
      { event: "subscription_complimentary_pro", user_id: userId, enabled },
      enabled ? "complimentary Pro granted" : "complimentary Pro revoked"
    );
  }

  private logTransition(
    transition: string,
    userId: string,
    changed: number,
    extra: Record<string, unknown> = {}
  ): void {
    log.info(
      {
        event: "subscription_transition",
        transition,
        user_id: userId,
        // 0 ⇒ the monotonicity guard rejected this write (replayed or
        // out-of-order callback). Expected in normal operation; a sustained
        // run of them on one user means that user is wedged.
        changed,
        ...extra,
      },
      changed > 0
        ? "subscription transition applied"
        : "subscription transition skipped by guard"
    );
  }
}

const FREE_STATUS: SubscriptionStatus = {
  status: "free",
  isEntitled: false,
  entitledUntil: null,
  activePlanId: null,
  activeProductId: null,
  provider: null,
  expiresAt: null,
  trialEndsAt: null,
  startedAt: null,
};

function narrowStatus(value: string): SubscriptionStatusValue {
  return (KNOWN_STATUSES as readonly string[]).includes(value)
    ? (value as SubscriptionStatusValue)
    : "free";
}

/** Exported for the facade impl (`api/subscription.api.impl.ts`). */
export function isKnownStatus(value: string): value is SubscriptionStatusValue {
  return (KNOWN_STATUSES as readonly string[]).includes(value);
}

/** Exported for the facade / tests that need the canonical free shape. */
export function freeStatusShape(): SubscriptionStatus {
  return { ...FREE_STATUS };
}

export type { SubscriptionRow };

/** One subscription row as the wire status, evaluated at `now`. */
function toStatus(row: SubscriptionRow, now: Date): SubscriptionStatus {
  const deadline = entitlementDeadline(row);
  return {
    status: narrowStatus(row.status),
    isEntitled: computeIsEntitled(row, now),
    activePlanId: row.activePlanId,
    activeProductId: row.activeProductId,
    provider: row.provider,
    // Wire format is ISO 8601. Prisma gives us a `Date`; convert at the
    // service boundary so the Zod `z.string().datetime()` check on the
    // response schema succeeds.
    expiresAt: row.expiresAt !== null ? row.expiresAt.toISOString() : null,
    trialEndsAt:
      row.trialEndsAt !== null ? row.trialEndsAt.toISOString() : null,
    // TAM-125: "member since" for the Manage Subscription screen. Null on
    // free rows and on legacy rows written before the column existed.
    startedAt: row.startedAt !== null ? row.startedAt.toISOString() : null,
    entitledUntil: deadline !== null ? deadline.toISOString() : null,
  };
}
