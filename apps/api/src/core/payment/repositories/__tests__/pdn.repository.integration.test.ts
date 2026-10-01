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
import { PdnRepository } from "../pdn.repository.js";

/**
 * `pdn_notifications`' DATABASE PREDICATES, against real Postgres.
 *
 * Same reasoning as the `transactions` ledger's integration suite: the design of
 * this table lives in constraints, not TypeScript, and a mocked Prisma would agree
 * with every one of them while they were wrong.
 *
 * Three properties are worth the container:
 *
 *   - ONE notification lineage per billing day, enforced by a FULL unique index
 *     (unlike the ledger's partial one — a re-arm rotates this row in place, so it
 *     never needs a supersede escape hatch);
 *   - `accepted` is impossible without a sequence id, because `accepted` MEANS
 *     addressable and the presentation path dereferences that id;
 *   - the patch semantics: omitting a sequence id LEAVES it, passing null CLEARS it.
 *     That distinction is what stops a status read that simply did not echo the id
 *     from erasing one we already hold — the difference between a working cycle and
 *     a cancelled notification.
 */

/**
 * Assert a write was refused by a specific named CHECK.
 *
 * Matching the constraint NAME rather than SQLSTATE 23514 proves the write failed
 * for the reason under test instead of tripping a different invariant on the way.
 */
async function expectRefusedBy(
  promise: Promise<unknown>,
  constraint: string
): Promise<void> {
  await expect(promise).rejects.toThrow(constraint);
}

let repo: PdnRepository;
let mandates: MandateRepository;

const CYCLE = new Date(Date.UTC(2026, 7, 24));
const NEXT_CYCLE = new Date(Date.UTC(2026, 8, 24));

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await getPrisma().transaction.deleteMany({});
  await getPrisma().paymentPdnNotification.deleteMany({});
  await getPrisma().mandate.deleteMany({});
  repo = new PdnRepository();
  mandates = new MandateRepository();
});

async function seedMandate(): Promise<{ id: string; userId: string }> {
  const userId = randomUUID();
  const row = await mandates.createInitiated({
    userId,
    type: "upi",
    provider: "decentro",
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
    endDate: new Date(Date.UTC(2056, 7, 24)),
    nextDebitDate: CYCLE,
    trialEndsAt: null,
  });
  return { id: row.id, userId };
}

function cycleInput(
  mandate: { id: string; userId: string },
  overrides: Record<string, unknown> = {}
) {
  return {
    mandateId: mandate.id,
    userId: mandate.userId,
    cycleDate: CYCLE,
    referenceId: `pj_pdn_${randomUUID()}`,
    amountPaise: 29900,
    scheduledDebitAt: CYCLE,
    ...overrides,
  };
}

describe("one notification per billing day", () => {
  test("a second findOrCreate for the same cycle returns the SAME row", async () => {
    const mandate = await seedMandate();
    const first = await repo.findOrCreateForCycle(cycleInput(mandate));
    const second = await repo.findOrCreateForCycle(cycleInput(mandate));

    expect(second.id).toBe(first.id);
    // The loser's freshly-minted reference is discarded unused, which costs nothing
    // because it was never sent anywhere.
    expect(second.referenceId).toBe(first.referenceId);
  });

  test("two concurrent creates for one cycle still yield one row", async () => {
    // The race the unique index exists for. INSERT-first plus a P2002 catch makes
    // dedupe atomic; SELECT-then-INSERT would leave exactly this window.
    const mandate = await seedMandate();
    const [a, b] = await Promise.all([
      repo.findOrCreateForCycle(cycleInput(mandate)),
      repo.findOrCreateForCycle(cycleInput(mandate)),
    ]);

    expect(a.id).toBe(b.id);
    expect(await getPrisma().paymentPdnNotification.count()).toBe(1);
  });

  test("a different cycle for the same mandate is a different row", async () => {
    const mandate = await seedMandate();
    const first = await repo.findOrCreateForCycle(cycleInput(mandate));
    const next = await repo.findOrCreateForCycle(
      cycleInput(mandate, { cycleDate: NEXT_CYCLE })
    );

    expect(next.id).not.toBe(first.id);
  });
});

describe("the database refuses an unaddressable acceptance", () => {
  test("accepted with NO sequence id is refused", async () => {
    // `accepted` MEANS addressable. This is the row that would otherwise reach the
    // presentation path and either crash it or present a debit NPCI cannot match to
    // a notification.
    const mandate = await seedMandate();
    const row = await repo.findOrCreateForCycle(cycleInput(mandate));

    await expectRefusedBy(
      getPrisma().paymentPdnNotification.update({
        where: { id: row.id },
        data: { status: "accepted", presentationSequenceId: null },
      }),
      "pdn_notifications_accepted_has_sequence_id"
    );
  });

  test("the repository DOWNGRADES rather than letting that write reach the database", async () => {
    // A rejected write inside a billing tick is an outage; a downgraded status is a
    // log line. The CHECK is the backstop, not the mechanism.
    const mandate = await seedMandate();
    const row = await repo.findOrCreateForCycle(cycleInput(mandate));

    const after = await repo.applyDispatchResult(row.id, {
      status: "accepted",
      presentationSequenceId: null,
    });

    expect(after?.status).toBe("sent");
  });

  test("a negative attempt count is refused", async () => {
    const mandate = await seedMandate();
    const row = await repo.findOrCreateForCycle(cycleInput(mandate));

    await expectRefusedBy(
      getPrisma().paymentPdnNotification.update({
        where: { id: row.id },
        data: { attempts: -1 },
      }),
      "pdn_notifications_attempts_nonneg"
    );
  });
});

describe("sequence id uniqueness", () => {
  test("two cycles of one mandate cannot share a sequence id", async () => {
    // That would be a debit charged against the wrong month.
    const mandate = await seedMandate();
    const first = await repo.findOrCreateForCycle(cycleInput(mandate));
    const next = await repo.findOrCreateForCycle(
      cycleInput(mandate, { cycleDate: NEXT_CYCLE })
    );

    await repo.applyStatus(first.id, {
      status: "accepted",
      presentationSequenceId: "seq_shared",
    });

    await expect(
      getPrisma().paymentPdnNotification.update({
        where: { id: next.id },
        data: { status: "accepted", presentationSequenceId: "seq_shared" },
      })
    ).rejects.toThrow();
  });

  test("many rows with a NULL sequence id are legal for one mandate", async () => {
    // Postgres treats NULLs as distinct in a unique index, which is what makes the
    // constraint above compatible with the normal asynchronous state where nothing
    // has an id yet.
    const mandate = await seedMandate();
    await repo.findOrCreateForCycle(cycleInput(mandate));
    await repo.findOrCreateForCycle(cycleInput(mandate, { cycleDate: NEXT_CYCLE }));

    const rows = await getPrisma().paymentPdnNotification.findMany({
      where: { mandateId: mandate.id, presentationSequenceId: null },
    });
    expect(rows).toHaveLength(2);
  });
});

describe("patch semantics — omitted leaves, null clears", () => {
  test("a status read that echoes no sequence id does NOT erase one we hold", async () => {
    // THE property that stops a routine poll from cancelling a live notification.
    // Prisma distinguishes `undefined` (leave alone) from `null` (set null), and the
    // repository maps a null provider answer onto `undefined` for exactly this
    // reason. Asserted against real Postgres so nobody "simplifies" it back.
    const mandate = await seedMandate();
    const row = await repo.findOrCreateForCycle(cycleInput(mandate));
    await repo.applyStatus(row.id, {
      status: "accepted",
      presentationSequenceId: "seq_held",
    });

    const after = await repo.applyStatus(row.id, {
      status: "sent",
      presentationSequenceId: null,
    });

    expect(after?.presentationSequenceId).toBe("seq_held");
  });

  test("rearm CLEARS the sequence id and rotates the reference, in one call", async () => {
    const mandate = await seedMandate();
    const row = await repo.findOrCreateForCycle(cycleInput(mandate));

    const rearmed = await repo.rearm(row.id, {
      referenceId: "pj_pdn_rotated",
      currentAttempts: row.attempts,
    });
    expect(rearmed).toBe(true);

    const after = await repo.findById(row.id);
    expect(after?.status).toBe("pending");
    expect(after?.referenceId).toBe("pj_pdn_rotated");
    expect(after?.presentationSequenceId).toBeNull();
    expect(after?.failureReason).toBeNull();
    expect(after?.attempts).toBe(row.attempts + 1);
  });

  test("rearm is REFUSED when a sequence id is already held", async () => {
    // The guard that makes mapping an unrecognised provider status to `failed` safe.
    // Without it, one unfamiliar status string would clear a valid notification and
    // silently lose the cycle's money.
    const mandate = await seedMandate();
    const row = await repo.findOrCreateForCycle(cycleInput(mandate));
    await repo.applyStatus(row.id, {
      status: "accepted",
      presentationSequenceId: "seq_live",
    });

    const rearmed = await repo.rearm(row.id, {
      referenceId: "pj_pdn_should_not_apply",
      currentAttempts: 0,
    });

    expect(rearmed).toBe(false);
    const after = await repo.findById(row.id);
    expect(after?.presentationSequenceId).toBe("seq_live");
    expect(after?.referenceId).toBe(row.referenceId);
  });

  test("markFailed leaves a held sequence id intact", async () => {
    // Failing and re-arming are different: a notification can be recorded failed
    // while still holding the id that proves it was live.
    const mandate = await seedMandate();
    const row = await repo.findOrCreateForCycle(cycleInput(mandate));
    await repo.applyStatus(row.id, {
      status: "accepted",
      presentationSequenceId: "seq_live",
    });

    await repo.markFailed(row.id, "provider said no");

    const after = await repo.findById(row.id);
    expect(after?.status).toBe("failed");
    expect(after?.presentationSequenceId).toBe("seq_live");
  });
});

describe("the awaiting-sequence-id sweep", () => {
  test("finds only rows with no id, stale enough, and not past their cycle", async () => {
    const mandate = await seedMandate();
    const waiting = await repo.findOrCreateForCycle(cycleInput(mandate));
    await repo.applyDispatchResult(waiting.id, {
      status: "sent",
      presentationSequenceId: null,
    });

    const held = await repo.findOrCreateForCycle(
      cycleInput(mandate, { cycleDate: NEXT_CYCLE })
    );
    await repo.applyStatus(held.id, {
      status: "accepted",
      presentationSequenceId: "seq_1",
    });

    // `staleBefore` in the future so both rows qualify on age; the filter under test
    // is the sequence id.
    const found = await repo.findAwaitingSequenceId(
      new Date(Date.now() + 60_000),
      CYCLE
    );

    expect(found.map((r) => r.id)).toEqual([waiting.id]);
  });

  test("a cycle whose debit date has passed is not polled", async () => {
    // Re-notifying for a day that is gone cannot produce a valid debit, so polling
    // for it is pure cost.
    const mandate = await seedMandate();
    const row = await repo.findOrCreateForCycle(cycleInput(mandate));
    await repo.applyDispatchResult(row.id, {
      status: "sent",
      presentationSequenceId: null,
    });

    const found = await repo.findAwaitingSequenceId(
      new Date(Date.now() + 60_000),
      NEXT_CYCLE
    );

    expect(found).toHaveLength(0);
  });
});
