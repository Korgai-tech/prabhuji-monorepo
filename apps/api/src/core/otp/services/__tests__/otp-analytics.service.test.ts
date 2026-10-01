import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyticsEventsClient,
  OTP_ANALYTICS_EVENT as ANALYTICS_EVENT,
  UTM_ANALYTICS_EVENT as UTM_EVENT,
  type AnalyticsEventInput,
} from "@api/shared/analytics";
import { OtpAnalyticsService } from "../otp-analytics.service.js";

const send = vi.spyOn(analyticsEventsClient, "send");

const sentBatch = (): AnalyticsEventInput[] => send.mock.calls.at(-1)?.[0] ?? [];

const sent = (): AnalyticsEventInput => {
  const batch = sentBatch();
  expect(batch.length).toBeGreaterThan(0);
  return batch[0];
};

const props = (): Record<string, unknown> => sent().event_properties ?? {};

const service = new OtpAnalyticsService();

const ok = {
  userId: "usr-1",
  otpSessionId: "sess-1",
  phoneNumber: "+919876543210",
  result: "success" as const,
  errorCode: null,
  attemptNumber: 1,
  responseTimeMs: 42,
};

const created = {
  userId: "usr-1",
  createdAt: new Date("2026-08-14T09:30:00.000Z"),
  bucketId: 4211,
};

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue(undefined);
});

describe("bk_otp_verification_result", () => {
  it("emits exactly what the constants file declares — no more, no less", async () => {
    // `OTP_ANALYTICS_EVENT` is meant to be THE list: one file to read to know
    // what a dashboard can query. That only holds if it cannot drift from what
    // the service emits, in either direction — a declared-but-dead name is as
    // misleading as an undeclared one.
    const emitted = new Set<string>();
    await service.trackVerificationResult(ok);
    for (const event of sentBatch()) emitted.add(event.event_type);
    await service.trackAccountCreated(created);
    for (const event of sentBatch()) emitted.add(event.event_type);

    expect([...emitted].sort()).toEqual(Object.values(ANALYTICS_EVENT).sort());
  });

  it("prefixes the event with bk_<module>_", () => {
    // `bk_` marks the PRODUCER. The Flutter app fires `otp_verification_result`
    // for the same moment; without the prefix the two are indistinguishable in
    // the warehouse, which is the entire point of having both.
    expect(ANALYTICS_EVENT.VERIFICATION_RESULT).toMatch(/^bk_otp_/);
  });

  it("carries the contract properties, and error_code is null on success", async () => {
    await service.trackVerificationResult(ok);

    // Null rather than omitted: a key absent on some rows makes
    // `WHERE error_code = ...` silently drop them.
    expect(props()).toEqual({
      result: "success",
      phone_number: "+919876543210",
      error_code: null,
      attempt_number: 1,
      response_time_ms: 42,
    });
    expect(sent().user_id).toBe("usr-1");
  });

  it("carries the error code on a failure", async () => {
    await service.trackVerificationResult({
      ...ok,
      result: "failure",
      errorCode: "OTP_INVALID",
      attemptNumber: 3,
    });

    expect(props()).toMatchObject({
      result: "failure",
      error_code: "OTP_INVALID",
      attempt_number: 3,
    });
  });

  it("keys insert_id on session AND attempt, so retries are distinct events", async () => {
    // Five wrong guesses are five events. Keying on the session alone would
    // collapse them and erase the retry curve this event exists to show.
    await service.trackVerificationResult({ ...ok, attemptNumber: 1 });
    const first = sent().insert_id;
    await service.trackVerificationResult({ ...ok, attemptNumber: 2 });
    const second = sent().insert_id;

    expect(first).not.toBe(second);
    expect(first).toBe("bk_otp_verification_result:sess-1:1");
  });

  it("floors attempt_number at one", async () => {
    // The provider's counter is incremented before the code is compared, so a
    // real attempt reports >= 1 — except on the branches that return early
    // (expired session, replay of a burned one), which can carry 0. Zero would
    // be a lie: the caller did submit a code.
    await service.trackVerificationResult({ ...ok, attemptNumber: 0 });

    expect(props().attempt_number).toBe(1);
  });

  it("never throws when the collector fails", async () => {
    // A dead collector must leave the login byte-identical. Callers `void` this,
    // so a rejection here would also be an unhandled promise rejection.
    send.mockRejectedValue(new Error("collector down"));

    await expect(service.trackVerificationResult(ok)).resolves.toBeUndefined();
  });
});

describe("bk_account_created", () => {
  it("carries account_created_at as ISO-8601 plus the subject's bucket, and nothing else", async () => {
    await service.trackAccountCreated(created);

    expect(props()).toEqual({
      account_created_at: "2026-08-14T09:30:00.000Z",
      bucket_id: 4211,
    });
    expect(sent().user_id).toBe("usr-1");
  });

  it("keeps bucket_id present as null when the abtesting service gave no answer", async () => {
    // Present-and-null, never absent — the same rule `error_code` follows on
    // the verification event. A key missing from some rows makes every
    // `WHERE bucket_id = …` silently drop them, which reads as "this cohort
    // never signed up" rather than "we could not ask".
    await service.trackAccountCreated({ ...created, bucketId: null });

    expect(props()).toEqual({
      account_created_at: "2026-08-14T09:30:00.000Z",
      bucket_id: null,
    });
  });

  it("carries bucket 0 as 0, not as no-bucket", async () => {
    // Bucket 0 is a real position in the space and roughly 1/totalBuckets of
    // every signup lands there; a falsy-check would file all of them as null.
    await service.trackAccountCreated({ ...created, bucketId: 0 });

    expect(props().bucket_id).toBe(0);
  });

  it("leaves the event time to default, rather than backdating to createdAt", async () => {
    // `createdAt` is the OTP SEND moment since TAM-154 — the row exists before
    // anyone verifies. Setting `time` from it would file every signup minutes
    // early, in a column that anchors every funnel.
    await service.trackAccountCreated(created);

    expect(sent().time).toBeUndefined();
  });

  it("keys insert_id on the user, so a replayed verify cannot double-count", async () => {
    await service.trackAccountCreated(created);
    const first = sent().insert_id;
    await service.trackAccountCreated({ ...created, createdAt: new Date() });

    expect(sent().insert_id).toBe(first);
    expect(first).toBe("bk_account_created:usr-1");
  });

  it("carries pseudo_id TOP-LEVEL, and omits the key when the client sent none", async () => {
    // Top-level, not an event property: `pseudo_id` is the warehouse's promoted
    // identity column, and it is the only thing that joins this signup row to
    // the install's client-side events. An empty/absent one must vanish from
    // the payload — ClickHouse drops null keys, and "" would be a fake identity.
    await service.trackAccountCreated({ ...created, pseudoId: "fb-instance-1" });
    expect(sent().pseudo_id).toBe("fb-instance-1");
    expect(props()).toEqual({
      account_created_at: "2026-08-14T09:30:00.000Z",
      bucket_id: 4211,
    });

    await service.trackAccountCreated(created);
    expect(sent()).not.toHaveProperty("pseudo_id");
  });

  it("answers true when the collector takes the event", async () => {
    await expect(service.trackAccountCreated(created)).resolves.toBe(true);
  });

  it("answers false instead of throwing when the collector fails", async () => {
    // `OtpService` chains the registration conversion on this answer, so a
    // failed send must be a VALUE, not a rejection — a rejection would also be
    // an unhandled promise rejection on the `void`ed request path.
    send.mockRejectedValue(new Error("collector down"));

    await expect(service.trackAccountCreated(created)).resolves.toBe(false);
  });
});

describe("the utm capture pair", () => {
  const utm = {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "diwali",
    utm_group: "brand_exact",
  };

  it("sends first and latest in ONE batch, so a hiccup cannot land latest alone", async () => {
    // `first` is once-per-user and its marker is stamped straight after, so a
    // dropped `first` beside a stored `latest` is unrecoverable for that user.
    await service.trackUtmCaptured({ userId: "usr-1", utm, isFirstCapture: true });

    expect(send).toHaveBeenCalledTimes(1);
    expect(sentBatch().map((e) => e.event_type)).toEqual([
      UTM_EVENT.LATEST,
      UTM_EVENT.FIRST,
    ]);
  });

  it("emits latest alone on a repeat capture", async () => {
    await service.trackUtmCaptured({ userId: "usr-1", utm, isFirstCapture: false });

    expect(sentBatch().map((e) => e.event_type)).toEqual([UTM_EVENT.LATEST]);
  });

  it("prefixes each event's properties with its own moment", async () => {
    await service.trackUtmCaptured({ userId: "usr-1", utm, isFirstCapture: true });

    const [latest, first] = sentBatch();
    expect(latest.event_properties).toEqual({
      latest_utm_source: "google",
      latest_utm_medium: "cpc",
      latest_utm_campaign: "diwali",
      latest_utm_group: "brand_exact",
    });
    expect(first.event_properties).toEqual({
      first_utm_source: "google",
      first_utm_medium: "cpc",
      first_utm_campaign: "diwali",
      first_utm_group: "brand_exact",
    });
    expect(latest.insert_id).toBe("bk_latest_utm_source_success:usr-1");
    expect(first.insert_id).toBe("bk_first_utm_source_success:usr-1");
  });

  it("never throws when the collector fails", async () => {
    send.mockRejectedValue(new Error("collector down"));

    await expect(
      service.trackUtmCaptured({ userId: "usr-1", utm, isFirstCapture: true })
    ).resolves.toBeUndefined();
  });
});
