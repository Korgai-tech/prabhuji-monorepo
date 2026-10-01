import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MandateRow } from "@api/core/payment/repositories/mandate.repository.js";
import type { TransactionRow } from "@api/core/payment/repositories/transactions.repository.js";
import type { AnalyticsEventInput } from "@api/shared/analytics";

/**
 * The upstream referral read, stubbed.
 *
 * A partial mock so everything else in the barrel — `analyticsEventsClient`, the
 * event-name constants, `utmProperties` — stays REAL: these tests are about the
 * event a settled payment produces, and stubbing the shaping helpers would only
 * assert that the stub was called.
 */
const fetchLatestUtm = vi.fn<(userId: string) => Promise<unknown>>();
vi.mock("@api/shared/analytics", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchLatestUtm: (userId: string) => fetchLatestUtm(userId),
}));

const { analyticsEventsClient } = await import("@api/shared/analytics");
const { PaymentAnalyticsService } = await import("../payment-analytics.service.js");

const send = vi.spyOn(analyticsEventsClient, "send");

const NOW = new Date("2026-08-01T10:00:00.000Z");
const TRIAL_END = new Date("2026-08-05T18:29:59.999Z");
const A_CAMPAIGN = {
  utm_source: "google-play",
  utm_medium: "",
  utm_campaign: "",
  utm_group: "install_generic",
};

const mandate = (over: Partial<MandateRow> = {}): MandateRow => ({
  id: "mnd-1",
  userId: "usr-1",
  type: "upi",
  provider: "decentro",
  referenceId: "pj_mnd_1",
  providerMandateId: "dec-1",
  providerTxnId: null,
  npciTransactionId: null,
  state: "active",
  stateReason: null,
  planId: "vip_monthly",
  productId: "vip",
  amountPaise: 29_900,
  currency: "INR",
  frequency: "MONTHLY",
  amountRule: "MAX",
  ruleType: "BEFORE",
  ruleValue: 28,
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2056-07-01T00:00:00.000Z"),
  nextDebitDate: new Date("2026-08-05T00:00:00.000Z"),
  trialEndsAt: null,
  authUrl: null,
  providerCheckout: null,
  authExpiresAt: null,
  payerHandleMasked: null,
  payerNameMasked: null,
  lastPolledAt: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: NOW,
  ...over,
});

const txn = (over: Partial<TransactionRow> = {}): TransactionRow => ({
  id: "txn-1",
  userId: "usr-1",
  kind: "recurring_debit",
  provider: "decentro",
  mandateId: "mnd-1",
  amountPaise: 29_900,
  currency: "INR",
  status: "succeeded",
  chargePhase: "submission",
  cycleDate: new Date("2026-08-05T00:00:00.000Z"),
  isFirstDebit: false,
  attemptNo: 1,
  retryCount: 0,
  presentationSequenceId: null,
  pdnId: null,
  gatewayPresentationRef: null,
  gatewayPaymentId: "gw-1",
  gatewayRequestId: "req-1",
  bankReferenceNumber: "rrn-1",
  npciTransactionId: "npci-1",
  notifiedAt: null,
  submittedAt: null,
  settledAt: NOW,
  failurePhase: null,
  failureCode: null,
  failureMessage: null,
  failureSubCode: null,
  parentTransactionId: null,
  supersededAt: null,
  supersededByTransactionId: null,
  planId: "vip_monthly",
  productId: "vip",
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const service = new PaymentAnalyticsService();

/** Every event handed to the collector across all `send()` calls. */
const allSent = (): AnalyticsEventInput[] => send.mock.calls.flatMap((call) => call[0]);

const named = (type: string): AnalyticsEventInput | undefined =>
  allSent().find((event) => event.event_type === type);

/**
 * The UTM emits are `void`ed, not awaited, so the tracker resolves before they
 * reach the collector. `vi.waitFor` is the repo's idiom for that.
 */
const waitForEvent = (type: string): Promise<void> =>
  vi.waitFor(() => expect(named(type)).toBeDefined());

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue(undefined);
  fetchLatestUtm.mockReset();
  fetchLatestUtm.mockResolvedValue(A_CAMPAIGN);
});

describe("bk_trial_utm_source_success", () => {
  it("rides the settled trial and keys on the USER", async () => {
    await service.trackTrialSuccess({
      mandate: mandate({ trialEndsAt: TRIAL_END }),
      txn: txn({ kind: "initial_deposit", amountPaise: 200 }),
      now: NOW,
    });
    await waitForEvent("bk_trial_utm_source_success");

    expect(named("bk_trial_success")).toBeDefined();
    const utm = named("bk_trial_utm_source_success");
    // Always all four, `""` for a component the campaign did not carry.
    expect(utm?.event_properties).toEqual({
      trial_utm_source: "google-play",
      trial_utm_medium: "",
      trial_utm_campaign: "",
      trial_utm_group: "install_generic",
    });
    // The USER, mirroring `bk_trial_success` beside it (TAM-181). The pair must
    // collapse identically at query time, and the claim each makes is about a
    // person — keyed on the mandate, a user who re-registers reads as a second
    // trial. Asserted as the exact key, not a substring: `usr-1` would also be
    // found inside a mandate-scoped id that happened to embed it.
    expect(utm?.insert_id).toBe("bk_trial_utm_source_success:usr-1");
    expect(utm?.insert_id).not.toContain("mnd-1");
  });

  it("emits nothing when the mandate is not in a trial", async () => {
    await service.trackTrialSuccess({ mandate: mandate(), txn: txn(), now: NOW });

    expect(named("bk_trial_success")).toBeUndefined();
    expect(named("bk_trial_utm_source_success")).toBeUndefined();
  });
});

describe("bk_sub_utm_source_success", () => {
  it("rides a first full-price payment and keys on the USER", async () => {
    await service.trackSubscriptionStarted({
      mandate: mandate(),
      txn: txn(),
      now: NOW,
      isFirstFullPricePayment: true,
      nextBillingDate: new Date("2026-09-05T00:00:00.000Z"),
    });
    await waitForEvent("bk_sub_utm_source_success");

    expect(named("bk_subscription_started")).toBeDefined();
    const utm = named("bk_sub_utm_source_success");
    expect(utm?.event_properties).toEqual({
      sub_utm_source: "google-play",
      sub_utm_medium: "",
      sub_utm_campaign: "",
      sub_utm_group: "install_generic",
    });
    // The USER, matching `bk_subscription_started`: the event is a claim about a
    // person's first full-price payment, not about a mandate.
    expect(utm?.insert_id).toContain("usr-1");
  });

  it("emits NEITHER event on a renewal", async () => {
    // The gate that matters. The UTM emit sits BELOW
    // `if (!isFirstFullPricePayment) return`, so one predicate governs both and
    // a renewal cannot mint a `sub_utm_*` row claiming a fresh acquisition.
    await service.trackSubscriptionStarted({
      mandate: mandate(),
      txn: txn(),
      now: NOW,
      isFirstFullPricePayment: false,
      nextBillingDate: new Date("2026-09-05T00:00:00.000Z"),
    });

    expect(named("bk_subscription_started")).toBeUndefined();
    expect(named("bk_sub_utm_source_success")).toBeUndefined();
    expect(fetchLatestUtm).not.toHaveBeenCalled();
  });
});

describe("failure containment", () => {
  it("still reports the purchase when there is no campaign upstream", async () => {
    fetchLatestUtm.mockResolvedValue(null);

    await service.trackSubscriptionStarted({
      mandate: mandate(),
      txn: txn(),
      now: NOW,
      isFirstFullPricePayment: true,
      nextBillingDate: new Date("2026-09-05T00:00:00.000Z"),
    });

    expect(named("bk_subscription_started")).toBeDefined();
    // A blank triple would assert "came from no campaign" — a claim we cannot make.
    expect(named("bk_sub_utm_source_success")).toBeUndefined();
  });

  it("does not reject when the referral read throws", async () => {
    // `fetchLatestUtm` is contractually non-throwing, but the emit is `void`ed:
    // if it ever did throw, an unhandled rejection would land on a stack that
    // has just settled money.
    fetchLatestUtm.mockRejectedValue(new Error("upstream down"));

    await expect(
      service.trackTrialSuccess({
        mandate: mandate({ trialEndsAt: TRIAL_END }),
        txn: txn({ kind: "initial_deposit", amountPaise: 200 }),
        now: NOW,
      })
    ).resolves.toBeUndefined();
    expect(named("bk_trial_success")).toBeDefined();
  });

  it("does not reject when the collector is down", async () => {
    send.mockRejectedValue(new Error("collector down"));

    await expect(
      service.trackSubscriptionStarted({
        mandate: mandate(),
        txn: txn(),
        now: NOW,
        isFirstFullPricePayment: true,
        nextBillingDate: new Date("2026-09-05T00:00:00.000Z"),
      })
    ).resolves.toBeUndefined();
  });
});
