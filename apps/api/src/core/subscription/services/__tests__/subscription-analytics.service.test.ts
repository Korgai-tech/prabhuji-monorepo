import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyticsEventsClient,
  SUBSCRIPTION_ANALYTICS_EVENT as E,
  type AnalyticsEventInput,
} from "@api/shared/analytics";
import type { SubscriptionRow } from "@api/core/subscription/repositories";
import { SubscriptionAnalyticsService } from "../subscription-analytics.service.js";

const send = vi.spyOn(analyticsEventsClient, "send");

/** The instant the sweep runs in every test here. */
const NOW = new Date("2026-08-14T09:30:00.000Z");

const row = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: "sub-1",
  userId: "usr-1",
  status: "active",
  activePlanId: "month",
  activeProductId: "prabhuji_vip_month",
  provider: "decentro",
  providerSubscriptionId: "dec-1",
  expiresAt: new Date("2026-08-13T18:29:59.999Z"),
  startedAt: new Date("2026-07-13T18:29:59.999Z"),
  trialEndsAt: null,
  trialConsumedAt: null,
  graceUntil: null,
  createdAt: new Date("2026-07-13T00:00:00.000Z"),
  updatedAt: NOW,
  ...over,
});

const sentBatch = (): AnalyticsEventInput[] => send.mock.calls.at(-1)?.[0] ?? [];
const sent = (): AnalyticsEventInput => {
  const batch = sentBatch();
  expect(batch.length).toBeGreaterThan(0);
  return batch[0];
};
const props = (): Record<string, unknown> => sent().event_properties ?? {};

const service = new SubscriptionAnalyticsService();

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue(undefined);
});

describe("event naming + shape", () => {
  it("publishes bk_subscription_expired for the row's user", async () => {
    await service.trackSubscriptionsExpired([row()], NOW);

    expect(sent().event_type).toBe(E.SUBSCRIPTION_EXPIRED);
    expect(sent().user_id).toBe("usr-1");
  });

  it("emits one event per row, in a single batch", async () => {
    await service.trackSubscriptionsExpired(
      [row(), row({ id: "sub-2", userId: "usr-2" })],
      NOW
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(sentBatch().map((e) => e.user_id)).toEqual(["usr-1", "usr-2"]);
  });

  it("sends nothing at all for an empty sweep", async () => {
    await service.trackSubscriptionsExpired([], NOW);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("property bag", () => {
  it("carries the subscription-only facts", async () => {
    await service.trackSubscriptionsExpired([row()], NOW);

    expect(props()).toMatchObject({
      subscription_id: "sub-1",
      plan_id: "month",
      product_id: "prabhuji_vip_month",
      type: "subscription",
      expiry_reason: "active",
      expiry_date: NOW.toISOString(),
      subscription_start_date: "2026-07-13T18:29:59.999Z",
      access_end_date: "2026-08-13T18:29:59.999Z",
    });
  });

  it("never carries mandate/provider keys — there is no mandate in scope", async () => {
    await service.trackSubscriptionsExpired([row()], NOW);

    expect(props()).not.toHaveProperty("mandate_id");
    expect(props()).not.toHaveProperty("provider");
  });

  it("reports the PRE-transition status as expiry_reason", async () => {
    await service.trackSubscriptionsExpired(
      [row({ status: "past_due", graceUntil: new Date("2026-08-13T00:00:00.000Z") })],
      NOW
    );

    expect(props().expiry_reason).toBe("past_due");
  });

  it("classifies a never-paid row as a trial", async () => {
    await service.trackSubscriptionsExpired(
      [
        row({
          status: "cancelled",
          expiresAt: null,
          trialEndsAt: new Date("2026-08-13T12:00:00.000Z"),
        }),
      ],
      NOW
    );

    expect(props().type).toBe("trial");
  });

  it("takes access_end_date from the trial when a cancelled row never paid", async () => {
    // The `entitlementDeadline` trap: it returns only `expiresAt` for a
    // cancelled row, which is null for someone who cancelled mid-trial — and
    // would report no access end for a user who demonstrably had one.
    const trialEndsAt = new Date("2026-08-13T12:00:00.000Z");
    await service.trackSubscriptionsExpired(
      [row({ status: "cancelled", expiresAt: null, trialEndsAt })],
      NOW
    );

    expect(props().access_end_date).toBe(trialEndsAt.toISOString());
    expect(props().trial_end_date).toBe(trialEndsAt.toISOString());
  });

  it("takes access_end_date from whichever deadline runs out last", async () => {
    const expiresAt = new Date("2026-08-13T18:29:59.999Z");
    await service.trackSubscriptionsExpired(
      [
        row({
          status: "cancelled",
          expiresAt,
          trialEndsAt: new Date("2026-07-20T00:00:00.000Z"),
        }),
      ],
      NOW
    );

    expect(props().access_end_date).toBe(expiresAt.toISOString());
  });

  it("sends every date as full ISO-8601, never a bare day", async () => {
    await service.trackSubscriptionsExpired(
      [row({ trialEndsAt: new Date("2026-07-16T18:29:59.999Z") })],
      NOW
    );

    for (const key of [
      "expiry_date",
      "subscription_start_date",
      "trial_end_date",
      "access_end_date",
    ]) {
      expect(props()[key]).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    }
  });

  it("omits keys it cannot populate rather than sending null", async () => {
    // ClickHouse drops null-valued JSON keys at ingest, so `null` and absent
    // land identically — omitting is the honest encoding.
    await service.trackSubscriptionsExpired(
      [row({ activePlanId: null, activeProductId: null, startedAt: null })],
      NOW
    );

    expect(Object.values(props())).not.toContain(null);
    expect(props()).not.toHaveProperty("plan_id");
    expect(props()).not.toHaveProperty("product_id");
    expect(props()).not.toHaveProperty("subscription_start_date");
    expect(props()).not.toHaveProperty("trial_end_date");
  });
});

describe("insert_id", () => {
  it("keys on the subscription and the expiry day", async () => {
    await service.trackSubscriptionsExpired([row()], NOW);

    expect(sent().insert_id).toBe(`${E.SUBSCRIPTION_EXPIRED}:sub-1:2026-08-14`);
  });

  it("collapses a sweep re-run on the same day", async () => {
    await service.trackSubscriptionsExpired([row()], NOW);
    const first = sent().insert_id;
    await service.trackSubscriptionsExpired(
      [row()],
      new Date("2026-08-14T23:59:00.000Z")
    );

    expect(sent().insert_id).toBe(first);
  });

  it("lets a genuine re-expiry after a resubscribe through", async () => {
    // One subscriptions row is reused for a user's whole billing history, so
    // keying on the id alone would make the second churn invisible.
    await service.trackSubscriptionsExpired([row()], NOW);
    const first = sent().insert_id;
    await service.trackSubscriptionsExpired(
      [row()],
      new Date("2026-09-14T09:30:00.000Z")
    );

    expect(sent().insert_id).not.toBe(first);
  });
});

describe("failure isolation", () => {
  it("swallows a collector failure — the sweep must not see it", async () => {
    send.mockRejectedValue(new Error("collector down"));

    await expect(
      service.trackSubscriptionsExpired([row()], NOW)
    ).resolves.toBeUndefined();
  });
});
