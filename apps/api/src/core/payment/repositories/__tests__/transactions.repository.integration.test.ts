import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { randomUUID } from "node:crypto";
import { getPrisma } from "@api/shared/database";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { MandateRepository } from "../mandate.repository.js";
import { TransactionsRepository } from "../transactions.repository.js";

/**
 * The `transactions` ledger's DATABASE PREDICATES, against real Postgres.
 *
 * This file exists because the design of this table lives in constraints, not in
 * TypeScript: a partial unique index decides whether a user can be charged
 * twice, and five CHECKs decide which rows are representable at all. A mocked
 * Prisma would happily agree with every one of them while they were wrong — the
 * same reasoning as the header of `billing-cycle.integration.test.ts`.
 *
 * Two of the assertions here are the ones that matter most:
 *
 *   - a BANK-DECLINED cycle can never be re-claimed (the hole the recovery path
 *     must not reopen), and
 *   - `succeeded` is impossible without the gateway's payment id (so money that
 *     moved is always traceable).
 *
 * Both are stated as "the database refuses", not "the service avoids".
 */

/**
 * Assert a write was refused by a specific named CHECK.
 *
 * Prisma surfaces a CHECK violation as a `PrismaClientUnknownRequestError` whose
 * message carries the raw Postgres error, so there is no structured code to
 * match on. Matching the constraint NAME is better than matching 23514 anyway:
 * it proves the write failed for the reason under test rather than tripping a
 * different invariant on the way past.
 */
async function expectRefusedBy(
  promise: Promise<unknown>,
  constraint: string
): Promise<void> {
  await expect(promise).rejects.toThrow(constraint);
}

let repo: TransactionsRepository;
let mandates: MandateRepository;

const CYCLE = new Date(Date.UTC(2026, 6, 30));

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  // Transactions, then notifications, then mandates — BOTH FKs are
  // `onDelete: Restrict`, and transactions point at notifications as well as at
  // mandates, so this is the only order that unwinds cleanly.
  await getPrisma().transaction.deleteMany({});
  await getPrisma().paymentPdnNotification.deleteMany({});
  await getPrisma().mandate.deleteMany({});
  repo = new TransactionsRepository();
  mandates = new MandateRepository();
});

async function seedMandate(): Promise<{ id: string; userId: string }> {
  const userId = randomUUID();
  const row = await mandates.createInitiated({
    userId,
    type: "upi",
    provider: "stub",
    referenceId: `pj_mnd_${randomUUID()}`,
    planId: "month",
    productId: "prabhuji_vip_month",
    amountPaise: 29900,
    currency: "INR",
    frequency: "MONTHLY",
    amountRule: "MAX",
    ruleType: "BEFORE",
    ruleValue: 28,
    startDate: CYCLE,
    endDate: new Date(Date.UTC(2056, 6, 30)),
    nextDebitDate: CYCLE,
    trialEndsAt: null,
  });
  return { id: row.id, userId };
}

function claimFor(
  mandate: { id: string; userId: string },
  overrides: Record<string, unknown> = {}
) {
  return {
    mandateId: mandate.id,
    userId: mandate.userId,
    provider: "stub",
    chargePhase: "submission" as const,
    cycleDate: CYCLE,
    amountPaise: 29900,
    currency: "INR",
    isFirstDebit: true,
    gatewayRequestId: `req_${randomUUID()}`,
    planId: "month",
    productId: "prabhuji_vip_month",
    ...overrides,
  };
}

/** Raw insert, so a shape the repository would never build can be attempted. */
async function rawInsert(data: Record<string, unknown>): Promise<void> {
  await getPrisma().transaction.create({
    data: {
      userId: randomUUID(),
      kind: "recurring_debit",
      provider: "stub",
      chargePhase: "submission",
      amountPaise: 100,
      ...data,
    } as never,
  });
}

describe("the recurring-cycle guard", () => {
  test("a second claim on the same cycle is refused", async () => {
    const mandate = await seedMandate();
    expect(await repo.claimRecurringCycle(claimFor(mandate))).not.toBeNull();
    expect(await repo.claimRecurringCycle(claimFor(mandate))).toBeNull();
  });

  /**
   * THE hole-closing test.
   *
   * `failed` is deliberately NOT excluded from the partial index, so a cycle
   * that reached the bank and was declined stays claimed forever. If someone
   * "helpfully" adds `AND status <> 'failed'` to the index predicate to make
   * stuck rows recoverable, this test is what fails — and what it is really
   * protecting is a user being debited twice for one month.
   */
  test("a bank-declined cycle can NEVER be re-claimed", async () => {
    const mandate = await seedMandate();
    const first = await repo.claimRecurringCycle(claimFor(mandate));
    await repo.settle(first!.id, {
      status: "failed",
      gatewayPaymentId: `cf_${randomUUID()}`,
      failurePhase: "settle",
      failureCode: "INSUFFICIENT_FUNDS",
      failureMessage: "declined",
      at: new Date(),
    });

    expect(await repo.claimRecurringCycle(claimFor(mandate))).toBeNull();
  });

  test.each(["pending", "notified", "submitted", "succeeded", "abandoned"])(
    "a cycle in %s is not re-claimable either",
    async (status) => {
      const mandate = await seedMandate();
      const first = await repo.claimRecurringCycle(claimFor(mandate));
      await getPrisma().transaction.update({
        where: { id: first!.id },
        // `succeeded` needs a gateway id (see the CHECK below), so supply one
        // unconditionally rather than branching.
        data: { status, gatewayPaymentId: `cf_${randomUUID()}` },
      });

      expect(await repo.claimRecurringCycle(claimFor(mandate))).toBeNull();
    }
  );

  test("only a superseded row releases its cycle", async () => {
    const mandate = await seedMandate();
    const first = await repo.claimRecurringCycle(claimFor(mandate));
    await repo.markNotifyFailed(first!.id, {
      failureCode: "PDN_ERROR",
      failureMessage: "timeout",
    });

    const replacement = await repo.supersedeCycleClaim({
      failedId: first!.id,
      claim: claimFor(mandate, { attemptNo: 2 }),
    });

    expect(replacement).not.toBeNull();
    expect(replacement!.attemptNo).toBe(2);

    const old = await repo.findById(first!.id);
    // The reason it failed SURVIVES being superseded — that is why supersede is
    // its own column rather than a status value.
    expect(old!.status).toBe("failed");
    expect(old!.failurePhase).toBe("notify");
    expect(old!.supersededAt).not.toBeNull();
    expect(old!.supersededByTransactionId).toBe(replacement!.id);

    // Exactly one row now satisfies the index predicate.
    const live = await getPrisma().transaction.count({
      where: { mandateId: mandate.id, kind: "recurring_debit", supersededAt: null },
    });
    expect(live).toBe(1);
  });

  test("a settled cycle cannot be superseded", async () => {
    const mandate = await seedMandate();
    const first = await repo.claimRecurringCycle(claimFor(mandate));
    await repo.settle(first!.id, {
      status: "succeeded",
      gatewayPaymentId: `cf_${randomUUID()}`,
      at: new Date(),
    });

    const replacement = await repo.supersedeCycleClaim({
      failedId: first!.id,
      claim: claimFor(mandate, { attemptNo: 2 }),
    });

    // Null, AND no orphan row left behind — the insert must roll back with it.
    expect(replacement).toBeNull();
    expect(
      await getPrisma().transaction.count({ where: { mandateId: mandate.id } })
    ).toBe(1);
  });
});

/**
 * `settle` and `markForRetry` answer "did THIS call move the row?" (TAM-260).
 *
 * `onDebitFailed` / `onDebitSucceeded` gate every side effect on that answer, so
 * it must be exactly one `true` when two resolvers (a webhook and the sweep)
 * race on one `submitted` attempt — decided by Postgres re-evaluating the guarded
 * `WHERE` after the first UPDATE's row lock releases, not by anything in Node.
 */
describe("the settle guard's return value", () => {
  async function submittedRow(): Promise<string> {
    const mandate = await seedMandate();
    const row = await repo.claimRecurringCycle(claimFor(mandate));
    await getPrisma().transaction.update({
      where: { id: row!.id },
      data: { status: "submitted", submittedAt: new Date() },
    });
    return row!.id;
  }

  const failure = {
    failureCode: "INSUFFICIENT_FUNDS",
    failureMessage: "declined",
  };

  test("two concurrent settles: exactly one moves the row", async () => {
    const id = await submittedRow();
    const at = new Date();
    const results = await Promise.all([
      repo.settle(id, { status: "failed", ...failure, at }),
      repo.settle(id, { status: "failed", ...failure, at }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repo.findById(id))!.status).toBe("failed");
  });

  test("two concurrent markForRetry calls: exactly one moves the row", async () => {
    const id = await submittedRow();
    const results = await Promise.all([
      repo.markForRetry(id, failure),
      repo.markForRetry(id, failure),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repo.findById(id))!.status).toBe("notified");
  });

  test("markForRetry after a settle is a no-op that says so", async () => {
    const id = await submittedRow();
    expect(await repo.settle(id, { status: "failed", ...failure, at: new Date() })).toBe(true);
    expect(await repo.markForRetry(id, failure)).toBe(false);
    // Still terminal: a retry can never resurrect a settled row.
    expect((await repo.findById(id))!.status).toBe("failed");
  });
});

describe("constraints", () => {
  test("succeeded without a gateway payment id is refused", async () => {
    const mandate = await seedMandate();
    const row = await repo.claimRecurringCycle(claimFor(mandate));

    await expectRefusedBy(
      getPrisma().transaction.update({
        where: { id: row!.id },
        data: { status: "succeeded" },
      }),
      "transactions_settled_has_gateway_id"
    );
  });

  test("a refund must be negative and a debit positive", async () => {
    const mandate = await seedMandate();
    await expectRefusedBy(
      rawInsert({ mandateId: mandate.id, cycleDate: CYCLE, amountPaise: -1 }),
      "transactions_amount_sign"
    );

    const parent = await repo.claimRecurringCycle(claimFor(mandate));
    await expectRefusedBy(
      rawInsert({
        kind: "refund",
        amountPaise: 100,
        parentTransactionId: parent!.id,
      }),
      "transactions_amount_sign"
    );
  });

  test("a recurring debit without a cycle date is unrepresentable", async () => {
    const mandate = await seedMandate();
    await expectRefusedBy(
      rawInsert({ mandateId: mandate.id, cycleDate: null }),
      "transactions_recurring_shape"
    );
  });

  test("a reversal must name what it reverses", async () => {
    await expectRefusedBy(
      rawInsert({ kind: "refund", amountPaise: -100, parentTransactionId: null }),
      "transactions_reversal_shape"
    );
  });

  test("half a supersede is refused", async () => {
    const mandate = await seedMandate();
    const row = await repo.claimRecurringCycle(claimFor(mandate));
    await expectRefusedBy(
      getPrisma().transaction.update({
        where: { id: row!.id },
        data: { supersededAt: new Date() },
      }),
      "transactions_supersede_shape"
    );
  });

  test("two rows cannot claim one gateway payment", async () => {
    const mandate = await seedMandate();
    const shared = `cf_${randomUUID()}`;
    const a = await repo.claimRecurringCycle(claimFor(mandate));
    await repo.markSubmitted(a!.id, { gatewayPaymentId: shared, at: new Date() });

    await expect(
      rawInsert({ kind: "one_time", amountPaise: 500, gatewayPaymentId: shared })
    ).rejects.toMatchObject({ code: "P2002" });

  });

  test("a mandate with ledger rows cannot be deleted", async () => {
    const mandate = await seedMandate();
    await repo.claimRecurringCycle(claimFor(mandate));

    // `onDelete: Restrict`, deliberately: a ledger that disappears along with
    // its instrument is not a ledger.
    await expectRefusedBy(
      getPrisma().mandate.delete({ where: { id: mandate.id } }),
      "transactions_mandate_id_fkey"
    );
  });
});

describe("kind isolation", () => {
  /**
   * The regression the `kind` filter exists to prevent. Every mandate carries an
   * `initial_deposit` row from registration; an unfiltered count would report
   * `isFirstDebit: false` on the genuine first cycle, and that flag decides
   * whether a failed first debit re-registers or retries against a mandate NPCI
   * has already auto-revoked.
   */
  test("the registration deposit does not count as a debit", async () => {
    const mandate = await seedMandate();
    await repo.recordInitialDeposit({
      userId: mandate.userId,
      mandateId: mandate.id,
      provider: "stub",
      chargePhase: "deposit",
      amountPaise: 200,
      currency: "INR",
      gatewayRequestId: `dep_${randomUUID()}`,
      planId: "month",
      productId: "prabhuji_vip_month",
    });

    expect(await repo.countRecurringDebitsForMandate(mandate.id)).toBe(0);
  });

  /**
   * A deposit awaiting UPI approval also sits in `submitted`, and with a NULL
   * `cycleDate` it sorts unpredictably — so without the `kind` filter a
   * presentation callback could settle the registration charge instead of the
   * debit it was actually about.
   */
  test("the deposit is never mistaken for the debit awaiting settlement", async () => {
    const mandate = await seedMandate();
    const deposit = await repo.recordInitialDeposit({
      userId: mandate.userId,
      mandateId: mandate.id,
      provider: "stub",
      chargePhase: "deposit",
      amountPaise: 200,
      currency: "INR",
      gatewayRequestId: `dep_${randomUUID()}`,
      planId: "month",
      productId: "prabhuji_vip_month",
    });
    await repo.markSubmitted(deposit.id, {
      gatewayPaymentId: `cf_${randomUUID()}`,
      at: new Date(),
    });

    // No recurring debit exists yet, so there is nothing to settle.
    expect(await repo.findLatestSubmittedForMandate(mandate.id)).toBeNull();

    const debit = await repo.claimRecurringCycle(claimFor(mandate));
    await repo.markSubmitted(debit!.id, {
      gatewayPaymentId: `cf_${randomUUID()}`,
      at: new Date(),
    });

    const found = await repo.findLatestSubmittedForMandate(mandate.id);
    expect(found!.id).toBe(debit!.id);
    expect(found!.id).not.toBe(deposit.id);
  });
});

/**
 * `findLatestRecurringDebitForMandate` feeds `attempt_number` on the
 * mandate-level ledger events (TAM-187). It must name the newest CYCLE — never
 * the registration deposit, and never a superseded row.
 */
describe("the latest cycle, for ledger attempt numbers", () => {
  test("is null before any cycle — the deposit is not a cycle", async () => {
    const mandate = await seedMandate();
    await repo.recordInitialDeposit({
      userId: mandate.userId,
      mandateId: mandate.id,
      provider: "stub",
      chargePhase: "deposit",
      amountPaise: 200,
      currency: "INR",
      gatewayRequestId: `dep_${randomUUID()}`,
      planId: "month",
      productId: "prabhuji_vip_month",
    });

    expect(await repo.findLatestRecurringDebitForMandate(mandate.id)).toBeNull();
  });

  test("is the newest cycle by date, whatever its status", async () => {
    const mandate = await seedMandate();
    await repo.claimRecurringCycle(claimFor(mandate));
    const later = await repo.claimRecurringCycle(
      claimFor(mandate, { cycleDate: new Date(Date.UTC(2026, 7, 30)), isFirstDebit: false })
    );

    const found = await repo.findLatestRecurringDebitForMandate(mandate.id);
    expect(found?.id).toBe(later!.id);
    expect(found?.retryCount).toBe(0);
  });
});

/**
 * `findInitialDepositIdForMandate` is what `GET /payment/mandate` returns as
 * `paymentReferenceId`, while `POST` returns the id `recordInitialDeposit` just
 * wrote. These pin that the two are the SAME row, against real Postgres.
 */
describe("the deposit id published as paymentReferenceId", () => {
  function depositFor(mandate: { id: string; userId: string }) {
    return repo.recordInitialDeposit({
      userId: mandate.userId,
      mandateId: mandate.id,
      provider: "stub",
      chargePhase: "deposit",
      amountPaise: 100,
      currency: "INR",
      gatewayRequestId: `pj_mnd_${randomUUID()}`,
      planId: "month",
      productId: "prabhuji_vip_month",
    });
  }

  test("GET finds exactly the row POST created", async () => {
    const mandate = await seedMandate();
    const deposit = await depositFor(mandate);
    expect(await repo.findInitialDepositIdForMandate(mandate.id)).toBe(deposit.id);
  });

  test("the id does not change once the deposit succeeds", async () => {
    const mandate = await seedMandate();
    const deposit = await depositFor(mandate);
    await repo.settleDepositForMandate(mandate.id, {
      status: "succeeded",
      gatewayPaymentId: `pay_${randomUUID()}`,
      at: new Date(),
    });
    expect(await repo.findInitialDepositIdForMandate(mandate.id)).toBe(deposit.id);
  });

  test("another mandate's deposit never answers for this one", async () => {
    const first = await seedMandate();
    const second = await seedMandate();
    const firstDeposit = await depositFor(first);
    const secondDeposit = await depositFor(second);
    expect(await repo.findInitialDepositIdForMandate(first.id)).toBe(firstDeposit.id);
    expect(await repo.findInitialDepositIdForMandate(second.id)).toBe(secondDeposit.id);
  });

  test("a recurring debit is never mistaken for the deposit", async () => {
    const mandate = await seedMandate();
    await repo.claimRecurringCycle(claimFor(mandate));
    expect(await repo.findInitialDepositIdForMandate(mandate.id)).toBeNull();
  });
});
