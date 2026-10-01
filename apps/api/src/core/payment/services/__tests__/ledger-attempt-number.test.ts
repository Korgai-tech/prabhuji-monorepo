import { describe, expect, it, vi } from "vitest";
import type { TransactionRow } from "@api/core/payment/repositories/transactions.repository.js";
import { resolveLatestAttemptNumber } from "../ledger-attempt-number.js";

const repoReturning = (impl: () => Promise<Partial<TransactionRow> | null>) => ({
  findLatestRecurringDebitForMandate: vi.fn(impl) as unknown as (
    mandateId: string
  ) => Promise<TransactionRow | null>,
});

describe("resolveLatestAttemptNumber", () => {
  it("is the newest cycle's presentation attempt, 1-based", async () => {
    const repo = repoReturning(() => Promise.resolve({ retryCount: 2 }));

    await expect(resolveLatestAttemptNumber(repo, "mnd-1")).resolves.toBe(3);
    expect(repo.findLatestRecurringDebitForMandate).toHaveBeenCalledWith("mnd-1");
  });

  it("is null when the mandate has never had a cycle", async () => {
    await expect(
      resolveLatestAttemptNumber(repoReturning(() => Promise.resolve(null)), "mnd-1")
    ).resolves.toBeNull();
  });

  it("never throws — a failed read costs the property, not the caller", async () => {
    await expect(
      resolveLatestAttemptNumber(repoReturning(() => Promise.reject(new Error("db down"))), "mnd-1")
    ).resolves.toBeNull();
    // A repository double without the method at all (narrow unit-test fakes).
    await expect(
      resolveLatestAttemptNumber(
        {} as unknown as Parameters<typeof resolveLatestAttemptNumber>[0],
        "mnd-1"
      )
    ).resolves.toBeNull();
  });
});
