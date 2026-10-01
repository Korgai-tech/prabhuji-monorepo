import type { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import type {
  MandateAuthorizedResult,
  SubscriptionTxHandle,
} from "@api/core/subscription/types";

/**
 * Prisma-level projection of a subscription row for internal consumption
 * inside the subscription module. Fields mirror `Subscription` in
 * `prisma/schema.prisma` — kept in a repo-local type so the service +
 * facade layers stay Prisma-free (arch-boundaries.json enforces this).
 */
export interface SubscriptionRow {
  id: string;
  userId: string;
  status: string;
  activePlanId: string | null;
  activeProductId: string | null;
  provider: string | null;
  providerSubscriptionId: string | null;
  expiresAt: Date | null;
  startedAt: Date | null;
  trialEndsAt: Date | null;
  trialConsumedAt: Date | null;
  graceUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SELECT = {
  id: true,
  userId: true,
  status: true,
  activePlanId: true,
  activeProductId: true,
  provider: true,
  providerSubscriptionId: true,
  expiresAt: true,
  startedAt: true,
  trialEndsAt: true,
  trialConsumedAt: true,
  graceUntil: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * States from which a *new* mandate may claim the subscription. A user who is
 * already `trialing` or `active` must not be knocked back to `pending` by a
 * second registration attempt — that would revoke access they currently have.
 */
const CLAIMABLE_STATES = ["free", "pending", "cancelled", "expired"] as const;

/**
 * States a dunning failure may move. A `free`/`pending`/`expired` row has
 * nothing to dun; writing `past_due` there would invent a grace window for a
 * user who never paid.
 */
const DUNNABLE_STATES = ["trialing", "active", "past_due"] as const;

/**
 * Ceiling on how many rows ONE `expireLapsed` tick moves.
 *
 * The sweep used to be unbounded, which was harmless while it only returned a
 * count. Now that every swept row also produces an analytics event, a first run
 * after an outage would be one unbounded SELECT plus one unbounded event batch.
 * The cap bounds both; the remainder is picked up by the next billing tick,
 * and a capped run is logged so a backlog is visible instead of silently
 * truncated.
 */
export const EXPIRE_SWEEP_BATCH = 500;

/**
 * `provider` stamped on an admin-granted complimentary Pro row (TAM-187), so
 * those rows are distinguishable from paid ones in every query and report.
 */
export const COMPLIMENTARY_PROVIDER = "admin_test";

/**
 * Subscription module repository — the ONLY place `@prisma/client` may be
 * imported for this module.
 *
 * Two write surfaces:
 *
 *   1. `upsertFreeForUser` — the idempotent free-tier seed called on user
 *      creation.
 *   2. The `apply*` billing transitions, driven by the payment module through
 *      the facade. Every one of them is **idempotent** (a replayed provider
 *      callback must not compound) and **monotonic** (a late-arriving callback
 *      for an older event must not overwrite a newer state). Both properties
 *      are enforced here with `updateMany` + a `status` precondition rather
 *      than a read-then-write, so two concurrent callbacks cannot interleave.
 */
export class SubscriptionRepository {
  async findByUserId(userId: string): Promise<SubscriptionRow | null> {
    const row = await getPrisma().subscription.findUnique({
      where: { userId },
      select: SELECT,
    });
    return row;
  }

  /** TAM-187 — rows for a batch of users (admin listing); absent users are simply missing. */
  async findByUserIds(userIds: string[]): Promise<SubscriptionRow[]> {
    if (userIds.length === 0) return [];
    return getPrisma().subscription.findMany({
      where: { userId: { in: userIds } },
      select: SELECT,
    });
  }

  /**
   * Idempotent seed of the free-tier row. Called by the OTP module (via the
   * facade + `performServiceCall`) after a new User is created — safe to
   * re-run because the OTP verify handler doesn't distinguish "user just
   * created" from "user existed" in every code path.
   *
   * When `tx` is provided the write joins the caller's Prisma transaction;
   * otherwise it runs against the top-level client. The `tx` parameter is
   * accepted as the opaque `SubscriptionTxHandle` because the service +
   * facade layers can't import `@prisma/client`; we narrow it here where
   * Prisma types are legal.
   */
  async upsertFreeForUser(
    userId: string,
    tx?: SubscriptionTxHandle
  ): Promise<SubscriptionRow> {
    const client = pickSubscriptionDelegate(tx) ?? getPrisma().subscription;
    const row = await client.upsert({
      where: { userId },
      // On create: seed the row with `status: 'free'` and every nullable
      // provider column left at NULL.
      create: {
        userId,
        status: "free",
      },
      // On update: intentionally no-op. We MUST NOT overwrite an existing
      // 'active' / 'pending' / 'cancelled' / 'expired' state — that data
      // will be provider-authoritative once the payment ticket lands. Empty
      // `update` keeps the row untouched (Prisma still triggers `updatedAt`;
      // ok — informational only).
      update: {},
      select: SELECT,
    });
    return row;
  }

  /**
   * TAM-187 — grant or revoke complimentary Pro on an admin-created test user.
   *
   * Granting stamps `active` with a NULL `expiresAt`, which `computeIsEntitled`
   * reads as a lifetime grant and `expireLapsed` never sweeps (`null < now` is
   * false). `provider` is the greppable `COMPLIMENTARY_PROVIDER` marker.
   *
   * Revoking only ever touches a row THIS method granted: the `provider`
   * precondition means a revoke can never knock a real payer's mandate-backed
   * `active` row back to `free`.
   */
  async setComplimentaryPro(userId: string, enabled: boolean): Promise<void> {
    const prisma = getPrisma();
    if (enabled) {
      const active = {
        status: "active",
        provider: COMPLIMENTARY_PROVIDER,
        activePlanId: COMPLIMENTARY_PROVIDER,
        activeProductId: COMPLIMENTARY_PROVIDER,
        providerSubscriptionId: null,
        startedAt: new Date(),
        expiresAt: null,
        trialEndsAt: null,
        graceUntil: null,
      };
      await prisma.subscription.upsert({
        where: { userId },
        create: { userId, ...active },
        update: active,
      });
      return;
    }
    await prisma.subscription.updateMany({
      where: { userId, provider: COMPLIMENTARY_PROVIDER },
      data: {
        status: "free",
        provider: null,
        activePlanId: null,
        activeProductId: null,
        startedAt: null,
        expiresAt: null,
      },
    });
  }

  // ---- billing transitions (driven by core/payment via the facade) --------

  /**
   * A mandate was created but the user has not approved it yet. Records the
   * provider handle so a callback carrying only the mandate id can be traced
   * back to a user, without granting any entitlement.
   *
   * No-ops for an already-entitled user: re-registering while `active` must
   * not knock them back to `pending`.
   */
  async applyPendingMandate(input: {
    userId: string;
    provider: string;
    providerSubscriptionId: string;
    planId: string;
    productId: string;
  }): Promise<number> {
    const res = await getPrisma().subscription.updateMany({
      where: { userId: input.userId, status: { in: [...CLAIMABLE_STATES] } },
      data: {
        status: "pending",
        provider: input.provider,
        providerSubscriptionId: input.providerSubscriptionId,
        activePlanId: input.planId,
        activeProductId: input.productId,
      },
    });
    return res.count;
  }

  /**
   * The user approved the mandate. Grants entitlement.
   *
   * `trialEndsAt` non-null ⇒ `trialing`; null ⇒ `pending` (mandate is live but
   * the first debit hasn't landed, so there is nothing paid for yet). The
   * caller decides — a re-registration after a consumed trial passes null.
   *
   * `pending` here is NOT the end of the story for a re-registration. Without a
   * trial the caller charged the full plan price at registration, so it follows
   * this with `applyDebitSucceeded` for the period that money bought — see the
   * `state === "active"` branch of `MandateService.onStateChanged`. Keeping the
   * grant there rather than widening this method is deliberate: only the payment
   * module knows whether a charge was dispatched, and `applyDebitSucceeded`
   * already carries the monotonic `expiresAt` guard that makes a replay safe.
   *
   * `trialConsumedAt` is stamped with the SAME guard the column exists for:
   * once set it is never cleared and never overwritten, so a second mandate
   * cannot hand out a second free trial.
   */
  async applyMandateAuthorized(input: {
    userId: string;
    providerSubscriptionId: string;
    planId: string;
    productId: string;
    trialEndsAt: Date | null;
    startedAt: Date;
    now: Date;
  }): Promise<MandateAuthorizedResult> {
    const res = await getPrisma().subscription.updateMany({
      // Not `active`: money has already moved for an active user, and a
      // delayed authorization callback must not pull them back to a trial.
      where: { userId: input.userId, status: { in: [...CLAIMABLE_STATES] } },
      data: {
        status: input.trialEndsAt !== null ? "trialing" : "pending",
        providerSubscriptionId: input.providerSubscriptionId,
        activePlanId: input.planId,
        activeProductId: input.productId,
        trialEndsAt: input.trialEndsAt,
        startedAt: input.startedAt,
        graceUntil: null,
      },
    });
    let trialFirstConsumed = false;
    if (res.count > 0 && input.trialEndsAt !== null) {
      // Separate statement so the `null` precondition applies only to this
      // column — folding it into the update above would overwrite an earlier
      // stamp and re-open the trial.
      //
      // THE COUNT IS THE ANSWER, and it is returned rather than discarded
      // (TAM-181). `UPDATE … WHERE trial_consumed_at IS NULL` is atomic: among
      // concurrent racers exactly one moves the row, so `count > 0` means "this
      // call granted this user their first trial, ever". `core/payment` gates
      // `bk_trial_success` on it, which is what makes that event fire once per
      // user instead of once per re-entry of the authorization path.
      //
      // Do NOT substitute a read of the column here. A read-then-emit re-opens
      // exactly the race this guarded write closes — two callers would both read
      // "not consumed" and both emit.
      const stamp = await getPrisma().subscription.updateMany({
        where: { userId: input.userId, trialConsumedAt: null },
        data: { trialConsumedAt: input.now },
      });
      trialFirstConsumed = stamp.count > 0;
    }
    return { changed: res.count, trialFirstConsumed };
  }

  /**
   * A debit settled. The single transition that always wins — money moving is
   * the newest truth regardless of what state we thought we were in.
   *
   * `periodEnd` is computed by the caller from the cycle date, NOT by adding a
   * month to the current value. That is what makes a replayed callback a no-op
   * instead of granting a free extra month: the same cycle always yields the
   * same `periodEnd`. The `expiresAt` guard then only ever moves time forward.
   */
  async applyDebitSucceeded(input: {
    userId: string;
    periodEnd: Date;
    planId: string;
    productId: string;
  }): Promise<number> {
    const res = await getPrisma().subscription.updateMany({
      where: {
        userId: input.userId,
        OR: [{ expiresAt: null }, { expiresAt: { lt: input.periodEnd } }],
      },
      data: {
        status: "active",
        activePlanId: input.planId,
        activeProductId: input.productId,
        expiresAt: input.periodEnd,
        // The trial is over the moment a debit succeeds.
        trialEndsAt: null,
        graceUntil: null,
      },
    });
    return res.count;
  }

  /**
   * A debit failed and dunning has begun. The user STAYS entitled until
   * `graceUntil` — a retryable bank failure (insufficient balance at 3am) must
   * not instantly revoke access someone has been paying for.
   */
  async applyDebitFailed(input: {
    userId: string;
    graceUntil: Date;
  }): Promise<number> {
    const res = await getPrisma().subscription.updateMany({
      where: { userId: input.userId, status: { in: [...DUNNABLE_STATES] } },
      data: { status: "past_due", graceUntil: input.graceUntil },
    });
    return res.count;
  }

  /**
   * The mandate ended — user cancelled, provider revoked, or NPCI auto-revoked
   * after a failed first debit.
   *
   * On `cancelled`, BOTH deadlines are left untouched: a user who cancels
   * mid-month keeps what they paid for, and one who cancels mid-trial keeps the
   * trial they were granted. `computeIsEntitled` grants `cancelled` until
   * whichever of `expiresAt` / `trialEndsAt` runs out last.
   *
   * `trialEndsAt` used to be nulled here for both reasons, which silently made
   * cancellation harsher than intended for exactly the users least committed to
   * paying: a trialing subscriber has no `expiresAt` (only a settled debit
   * writes one, and a trial has not had one yet), so wiping the trial left
   * nothing for the `cancelled` branch to grant and access ended the instant
   * they cancelled.
   *
   * `expired` still clears both — that reason means nothing was ever paid for,
   * so there is no window to honour.
   */
  async applyMandateEnded(input: {
    userId: string;
    reason: "cancelled" | "expired";
    now: Date;
  }): Promise<number> {
    const ENDABLE = ["pending", "trialing", "active", "past_due"] as const;

    if (input.reason === "expired") {
      const res = await getPrisma().subscription.updateMany({
        where: { userId: input.userId, status: { in: [...ENDABLE] } },
        data: {
          status: "expired",
          providerSubscriptionId: null,
          expiresAt: null,
          trialEndsAt: null,
          graceUntil: null,
        },
      });
      return res.count;
    }

    // `cancelled` only where something is still live to honour. Ordered first
    // so the sweep below cannot re-catch a row this one just settled.
    const live = await getPrisma().subscription.updateMany({
      where: {
        userId: input.userId,
        status: { in: [...ENDABLE] },
        OR: [{ expiresAt: { gt: input.now } }, { trialEndsAt: { gt: input.now } }],
      },
      data: {
        status: "cancelled",
        providerSubscriptionId: null,
        // Dunning is over: the grace window belongs to `past_due` and must not
        // outlive the mandate that was being dunned for. `expiresAt` and
        // `trialEndsAt` are deliberately untouched — they ARE what is kept.
        graceUntil: null,
      },
    });

    // Nothing left to honour, so `cancelled` would grant nothing anyway —
    // `computeIsEntitled` denies it without a future deadline. Writing
    // `expired` keeps the status honest rather than leaving a row that reads as
    // "still has access" to anyone not applying the entitlement rule.
    //
    // THIS is what an NPCI auto-revoke after a failed first debit lands on: the
    // mandate was `active`, so the caller asks for `cancelled`, but the trial it
    // was being debited at the end of has already lapsed — nothing was ever
    // paid, and `expired` is the truthful answer.
    const dead = await getPrisma().subscription.updateMany({
      where: {
        userId: input.userId,
        status: { in: [...ENDABLE] },
      },
      data: {
        status: "expired",
        providerSubscriptionId: null,
        expiresAt: null,
        trialEndsAt: null,
        graceUntil: null,
      },
    });

    return live.count + dead.count;
  }

  /**
   * Bulk sweep of rows whose entitlement deadline has passed, so `status`
   * eventually agrees with what `computeIsEntitled` has been reporting all
   * along. Purely cosmetic for access control — the read path already denies
   * these — but it keeps admin views and analytics honest.
   *
   * Deliberately does NOT touch `trialing`: a trial whose window closed is
   * mid-debit, and the billing cycle owns that outcome. Expiring it here would
   * race the presentation we just fired.
   *
   * A `cancelled` row is swept against BOTH deadlines, mirroring what
   * `computeIsEntitled` grants it — a user who cancelled mid-trial has a live
   * `trialEndsAt` and a null `expiresAt`, and matching only on `expiresAt`
   * would leave that row `cancelled` forever once the trial lapsed. Rows where
   * both are null are left alone: nothing here can say whether they ever had a
   * window, and the read path denies them regardless.
   *
   * Select-then-update rather than a bare `updateMany`, because the caller now
   * emits one analytics event per swept row and the event needs the row as it
   * was BEFORE the transition — `expiry_reason` IS the pre-transition status,
   * the only thing that distinguishes "ran out of paid time" from "was already
   * cancelled" from "dunning exhausted". The returned rows are therefore the
   * pre-transition ones.
   *
   * The update re-applies the SAME predicate on top of the selected ids, so a
   * row that changed between the two statements is left alone — the sweep stays
   * monotonic — and only rows the update actually confirmed are returned.
   */
  async expireLapsed(now: Date): Promise<SubscriptionRow[]> {
    const lapsed: Prisma.SubscriptionWhereInput = {
      OR: [
        { status: "active", expiresAt: { lt: now } },
        {
          status: "cancelled",
          // Every non-null deadline is in the past, and at least one exists.
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { lt: now } }] },
            { OR: [{ trialEndsAt: null }, { trialEndsAt: { lt: now } }] },
            { OR: [{ expiresAt: { not: null } }, { trialEndsAt: { not: null } }] },
          ],
        },
        { status: "past_due", graceUntil: { lt: now } },
      ],
    };

    const candidates = await getPrisma().subscription.findMany({
      where: lapsed,
      select: SELECT,
      take: EXPIRE_SWEEP_BATCH,
    });
    if (candidates.length === 0) return [];

    const updated = await getPrisma().subscription.updateManyAndReturn({
      where: { AND: [{ id: { in: candidates.map((row) => row.id) } }, lapsed] },
      data: { status: "expired" },
      select: { id: true },
    });

    const confirmed = new Set(updated.map((row) => row.id));
    return candidates.filter((row) => confirmed.has(row.id));
  }
}

/**
 * Narrow the opaque `SubscriptionTxHandle` to a Prisma subscription delegate.
 * Returns `undefined` when the handle is missing or malformed — callers fall
 * back to the top-level client. Kept file-local so the cast is documented in
 * exactly one place.
 */
function pickSubscriptionDelegate(
  tx: SubscriptionTxHandle | undefined
): Prisma.TransactionClient["subscription"] | undefined {
  if (!tx) return undefined;
  const candidate = tx.subscription as
    | Prisma.TransactionClient["subscription"]
    | undefined;
  return candidate;
}
