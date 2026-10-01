import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import type {
  RazorpayCheckout,
  MandateState,
  MandateType,
} from "@api/core/payment/types";

/**
 * Repo-local projection of a `mandates` row. Keeps the service + facade layers
 * Prisma-free (arch-boundaries.json enforces this).
 */
export interface MandateRow {
  id: string;
  userId: string;
  type: string;
  provider: string;
  referenceId: string;
  providerMandateId: string | null;
  providerTxnId: string | null;
  npciTransactionId: string | null;
  state: string;
  stateReason: string | null;
  planId: string;
  productId: string;
  amountPaise: number;
  currency: string;
  frequency: string;
  amountRule: string;
  ruleType: string;
  ruleValue: number;
  startDate: Date;
  endDate: Date;
  nextDebitDate: Date | null;
  trialEndsAt: Date | null;
  authUrl: string | null;
  /**
   * `mandates.provider_checkout`, straight off the column and NOT yet narrowed.
   *
   * `unknown` rather than `RazorpayCheckout | null` on purpose: this is a `Json?`
   * column, so a row written by an older build (or by hand) can hold any shape,
   * and typing it as the interface here would let a malformed row reach the wire
   * as a checkout object with no order in it. `readCheckout` in
   * `MandateService` is the single narrowing point — a shape that fails it
   * degrades to "no checkout available" instead of a sheet that can only fail.
   */
  providerCheckout: unknown;
  authExpiresAt: Date | null;
  payerHandleMasked: string | null;
  payerNameMasked: string | null;
  lastPolledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mandate persistence — the ONLY place `@prisma/client` is reachable for the
 * mandate table.
 *
 * Note what is NOT here: no "upsert by user". A user legitimately accumulates
 * multiple mandate rows over time (NPCI auto-revokes after a failed first
 * debit, and re-consent mints a new one), so every registration is an insert
 * and history is preserved.
 */
export class MandateRepository {
  /**
   * Insert the row BEFORE calling the provider. If the create-mandate request
   * then times out, the provider may still have registered it — and this row,
   * keyed by our `referenceId`, is the only way to find out.
   */
  async createInitiated(input: {
    userId: string;
    type: MandateType;
    provider: string;
    referenceId: string;
    planId: string;
    productId: string;
    amountPaise: number;
    currency: string;
    frequency: string;
    amountRule: string;
    ruleType: string;
    ruleValue: number;
    startDate: Date;
    endDate: Date;
    /**
     * Written HERE rather than at activation. It is the schedule we chose when
     * we read the plan's trial, and the plan is not in scope by the time the
     * provider says the mandate went live.
     */
    nextDebitDate: Date;
    /** Null when this mandate carries no trial. See `Mandate.trialEndsAt`. */
    trialEndsAt: Date | null;
  }): Promise<MandateRow> {
    return getPrisma().mandate.create({ data: { ...input, state: "initiated" } });
  }

  async findById(id: string): Promise<MandateRow | null> {
    return getPrisma().mandate.findUnique({ where: { id } });
  }

  async findByReferenceId(referenceId: string): Promise<MandateRow | null> {
    return getPrisma().mandate.findUnique({ where: { referenceId } });
  }

  async findByProviderMandateId(
    providerMandateId: string
  ): Promise<MandateRow | null> {
    return getPrisma().mandate.findUnique({ where: { providerMandateId } });
  }

  /** Most recent mandate for a user, whatever its state. Drives `GET /payment/mandate`. */
  async findLatestForUser(userId: string): Promise<MandateRow | null> {
    return getPrisma().mandate.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * A mandate the user could still complete or is already using — so a second
   * tap on Pay Now returns the existing approval link instead of minting a new
   * `referenceId` and orphaning the first.
   */
  async findReusableForUser(
    userId: string,
    now: Date
  ): Promise<MandateRow | null> {
    return getPrisma().mandate.findFirst({
      where: {
        userId,
        OR: [
          { state: "active" },
          // `pending`/`initiated` only while the approval link still works.
          {
            state: { in: ["initiated", "pending"] },
            authExpiresAt: { gt: now },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Record what the provider returned from create-mandate. */
  async applyRegistration(
    id: string,
    input: {
      state: MandateState;
      providerMandateId: string | null;
      providerTxnId: string | null;
      /** Null on an SDK gateway, which has `providerCheckout` instead. */
      authUrl: string | null;
      providerCheckout: RazorpayCheckout | null;
      authExpiresAt: Date;
    }
  ): Promise<MandateRow> {
    return getPrisma().mandate.update({
      where: { id },
      data: {
        ...input,
        // `Prisma.DbNull` rather than a bare `null`: on a `Json?` column a JS
        // null means the JSON VALUE null, which would read back as a truthy
        // object and hand the client a checkout with no order in it.
        //
        // Spread, not the value itself: Prisma's `InputJsonValue` needs an index
        // signature and TypeScript never infers one for a named interface, so
        // passing `RazorpayCheckout` directly does not typecheck. Structure is
        // still enforced — by the type on `applyRegistration`'s parameter.
        providerCheckout: input.providerCheckout
          ? { ...input.providerCheckout }
          : Prisma.DbNull,
      },
    });
  }

  /**
   * Apply an authoritative status read.
   *
   * Only writes non-null fields: a status response that omits `nextDebitDate`
   * must not erase one we already know. Also stamps `lastPolledAt` so the
   * poll throttle has something to work from.
   */
  async applyStatus(
    id: string,
    input: {
      state: MandateState;
      stateReason: string | null;
      providerMandateId: string | null;
      providerTxnId: string | null;
      npciTransactionId: string | null;
      payerHandleMasked: string | null;
      payerNameMasked: string | null;
      nextDebitDate: Date | null;
      polledAt: Date;
    }
  ): Promise<MandateRow> {
    return getPrisma().mandate.update({
      where: { id },
      data: {
        state: input.state,
        stateReason: input.stateReason,
        lastPolledAt: input.polledAt,
        ...(input.providerMandateId !== null
          ? { providerMandateId: input.providerMandateId }
          : {}),
        ...(input.providerTxnId !== null
          ? { providerTxnId: input.providerTxnId }
          : {}),
        ...(input.npciTransactionId !== null
          ? { npciTransactionId: input.npciTransactionId }
          : {}),
        ...(input.payerHandleMasked !== null
          ? { payerHandleMasked: input.payerHandleMasked }
          : {}),
        ...(input.payerNameMasked !== null
          ? { payerNameMasked: input.payerNameMasked }
          : {}),
        ...(input.nextDebitDate !== null
          ? { nextDebitDate: input.nextDebitDate }
          : {}),
      },
    });
  }

  async setState(
    id: string,
    state: MandateState,
    stateReason: string | null = null
  ): Promise<void> {
    await getPrisma().mandate.update({
      where: { id },
      data: { state, stateReason },
    });
  }

  async setNextDebitDate(id: string, nextDebitDate: Date): Promise<void> {
    await getPrisma().mandate.update({
      where: { id },
      data: { nextDebitDate },
    });
  }

  /**
   * Active mandates whose next debit falls within the PDN lead window.
   *
   * Deliberately a coarse date-range filter — the precise 24–48h and blackout
   * rules live in `npci-window.ts` and are applied per row by the caller, so
   * the timing policy has ONE definition rather than being half-encoded in a
   * query predicate.
   */
  async findDueForPdn(from: Date, to: Date): Promise<MandateRow[]> {
    return getPrisma().mandate.findMany({
      where: { state: "active", nextDebitDate: { gte: from, lte: to } },
      orderBy: { nextDebitDate: "asc" },
      take: 500,
    });
  }

  /**
   * Mandates stuck in a non-terminal state with a stale (or absent) poll —
   * the reconciliation net for a callback that never arrived.
   */
  async findStalePending(before: Date, limit = 200): Promise<MandateRow[]> {
    return getPrisma().mandate.findMany({
      where: {
        state: { in: ["initiated", "pending"] },
        OR: [{ lastPolledAt: null }, { lastPolledAt: { lt: before } }],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }
}
