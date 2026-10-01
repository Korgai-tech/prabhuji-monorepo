import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { getPrisma } from "@api/shared/database";
import { resetEnvCache } from "@api/shared/config";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { DecentroClient } from "../decentro.client.js";
import {
  ProviderApiLogRepository,
  type ProviderApiLogWriter,
} from "../provider-api-log.repository.js";

/**
 * The integration ledger — `payment_provider_api_logs`.
 *
 * This table exists because a wrong endpoint constant once stopped every recurring
 * debit in production and the only evidence was a `failure_message` column plus
 * CloudWatch retention. Two properties are worth a testcontainer:
 *
 *   1. The exchange is actually PERSISTED, bodies and all, with credentials blanked
 *      and the payer's handle redacted. A ledger that drops the request body is
 *      the situation this replaces.
 *
 *   2. A ledger write that FAILS does not fail the payment. That is the single most
 *      important property in the file, and it is the reason `writeApiLog` swallows:
 *      if the failure escaped, the caller could not tell it from a gateway
 *      transport failure — and on a POST that turns a debit which actually
 *      succeeded into a failed row the recovery sweep may supersede into a SECOND
 *      charge. It is only assertable because the writer is injectable.
 */

let repo: ProviderApiLogRepository;

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await getPrisma().paymentProviderApiLog.deleteMany({});
  repo = new ProviderApiLogRepository();
});

describe("persistence", () => {
  test("every column round-trips, including the JSONB bodies", async () => {
    await repo.insert({
      provider: "decentro",
      operation: "send_pdn",
      httpMethod: "POST",
      requestUrl: "https://api.decentro.tech/v3/payments/upi/autopay/mandate/notify",
      requestHeaders: { client_id: "[redacted]", client_secret: "[redacted]" },
      requestBody: { reference_id: "pj_pdn_1", amount: 299 },
      responseStatus: 200,
      responseBody: { api_status: "SUCCESS", data: { notification_detail: {} } },
      providerStatus: "SUCCESS",
      providerMessage: "ok",
      providerResponseCode: null,
      referenceId: "pj_pdn_1",
      providerTransactionId: "dt_1",
      attempt: 1,
      durationMs: 87,
      result: "success",
    });

    const row = await getPrisma().paymentProviderApiLog.findFirstOrThrow({});
    expect(row.operation).toBe("send_pdn");
    expect(row.direction).toBe("outbound");
    expect(row.responseStatus).toBe(200);
    expect(row.durationMs).toBe(87);
    expect(row.providerStatus).toBe("SUCCESS");
    expect(row.requestBody).toEqual({ reference_id: "pj_pdn_1", amount: 299 });
    // Credentials are blanked by the CALLER, by header name. Asserted here so a
    // future refactor that forgets to redact is visible in this suite too.
    expect(row.requestHeaders).toEqual({
      client_id: "[redacted]",
      client_secret: "[redacted]",
    });
  });

  test("an omitted body is absent rather than a JSON null", async () => {
    // "We did not send one" and "we sent null" are different facts, and a reader
    // months later cannot recover the distinction if both land as null.
    await repo.insert({
      provider: "decentro",
      operation: "get_pdn_status",
      httpMethod: "GET",
      responseStatus: 200,
      result: "success",
    });

    const row = await getPrisma().paymentProviderApiLog.findFirstOrThrow({});
    expect(row.requestBody).toBeNull();
  });

  test("a failure records the provider's machine-readable error key", async () => {
    // `response_key` is what every downstream decision branches on — whether a
    // cycle may be superseded, whether the previous attempt landed, whether a
    // rejection is merely premature.
    await repo.insert({
      provider: "decentro",
      operation: "send_pdn",
      responseStatus: 400,
      providerStatus: "FAILURE",
      providerResponseCode: "error_no_pre_debit_notification_found",
      result: "failure",
      errorMessage: "HTTP 400",
    });

    const row = await getPrisma().paymentProviderApiLog.findFirstOrThrow({});
    expect(row.providerResponseCode).toBe("error_no_pre_debit_notification_found");
    expect(row.result).toBe("failure");
  });
});

/**
 * The client's write path, against a stubbed `fetch`.
 *
 * `resetEnvCache` plus stubbed vendor credentials is what makes the real client
 * constructible here; without it the constructor refuses, by design.
 */
describe("the client records exchanges, and never fails a payment to do so", () => {
  const ORIGINAL_FETCH = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("DECENTRO_BASE_URL", "https://staging.api.decentro.tech");
    vi.stubEnv("DECENTRO_CLIENT_ID", "test-client-id");
    vi.stubEnv("DECENTRO_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("DECENTRO_CONSUMER_URN", "urn:test:consumer");
    resetEnvCache();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  function respondOnce(body: unknown, status = 200): void {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        })
      )
    );
  }

  test("a successful POST writes one row carrying both redacted bodies", async () => {
    respondOnce({ api_status: "SUCCESS", decentroTxnId: "dt_9" });

    await new DecentroClient().post(
      "/v3/payments/upi/autopay/mandate/notify",
      { reference_id: "pj_pdn_1", payer_vpa: "victim@okhdfcbank" },
      { operation: "send_pdn", referenceId: "pj_pdn_1", mandateId: null }
    );

    const row = await getPrisma().paymentProviderApiLog.findFirstOrThrow({});
    expect(row.operation).toBe("send_pdn");
    expect(row.httpMethod).toBe("POST");
    expect(row.result).toBe("success");
    expect(row.providerStatus).toBe("SUCCESS");
    expect(row.providerTransactionId).toBe("dt_9");
    // Our credentials never reach the column.
    expect(row.requestHeaders).toMatchObject({ client_secret: "[redacted]" });
    // Nor does the payer's handle — but the FIELD NAME survives, which is what
    // makes the row diagnostic rather than merely present.
    expect(row.requestBody).toMatchObject({
      reference_id: "pj_pdn_1",
      payer_vpa: "[redacted]",
    });
  });

  test("a 200 carrying api_status FAILURE is recorded as a FAILURE", async () => {
    // The envelope, not the HTTP status, decides. Recording this as success is what
    // let a rejected debit sit unsettled forever.
    respondOnce({ api_status: "FAILURE", message: "no", response_key: "error_x" });

    await expect(
      new DecentroClient().post(
        "/v3/payments/upi/autopay/mandate/notify",
        { reference_id: "pj_pdn_1" },
        { operation: "send_pdn", referenceId: "pj_pdn_1" }
      )
    ).resolves.toBeTruthy();

    const row = await getPrisma().paymentProviderApiLog.findFirstOrThrow({});
    expect(row.result).toBe("failure");
    expect(row.providerStatus).toBe("FAILURE");
    expect(row.providerResponseCode).toBe("error_x");
  });

  test("a rejected call is recorded BEFORE the throw", async () => {
    // The rejected call is exactly the one an incident asks about, so it must not be
    // the one that goes unrecorded.
    respondOnce({ message: "bad request", response_key: "error_y" }, 400);

    await expect(
      new DecentroClient().post(
        "/v3/payments/upi/autopay/mandate/notify",
        { reference_id: "pj_pdn_1" },
        { operation: "send_pdn", referenceId: "pj_pdn_1" }
      )
    ).rejects.toThrow();

    const row = await getPrisma().paymentProviderApiLog.findFirstOrThrow({});
    expect(row.responseStatus).toBe(400);
    expect(row.result).toBe("failure");
  });

  test("a retried GET writes TWO rows, distinguishable only by `attempt`", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(() => {
      calls += 1;
      // 500 on the first attempt is retryable; the second succeeds.
      return Promise.resolve(
        calls === 1
          ? new Response(JSON.stringify({ message: "boom" }), { status: 500 })
          : new Response(JSON.stringify({ api_status: "SUCCESS" }), { status: 200 })
      );
    });

    await new DecentroClient().get(
      "/v3/payments/upi/autopay/notification/status",
      { reference_id: "pj_pdn_1" },
      { operation: "get_pdn_status", referenceId: "pj_pdn_1" }
    );

    const rows = await getPrisma().paymentProviderApiLog.findMany({
      orderBy: { attempt: "asc" },
    });
    expect(rows.map((r) => r.attempt)).toEqual([1, 2]);
    expect(rows[0].result).toBe("failure");
    expect(rows[1].result).toBe("success");
  });

  test("our own timeout is recorded as 504/timeout, a dead socket as 0/failure", async () => {
    // The distinction tells a later reader whether the request plausibly reached the
    // provider at all — which is the whole question after an ambiguous POST.
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    globalThis.fetch = vi.fn(() =>
      Promise.reject(timeout)
    );

    await expect(
      new DecentroClient().post(
        "/v3/payments/upi/autopay/mandate/presentation",
        { reference_id: "pj_prs_1" },
        { operation: "present_debit", referenceId: "pj_prs_1" }
      )
    ).rejects.toThrow();

    const row = await getPrisma().paymentProviderApiLog.findFirstOrThrow({});
    expect(row.responseStatus).toBe(504);
    expect(row.result).toBe("timeout");
  });

  test("A LEDGER WRITE THAT THROWS DOES NOT FAIL THE PAYMENT CALL", async () => {
    // THE property. If the failure escaped it would be indistinguishable from a
    // gateway transport failure: on a GET it re-drives the retry loop, and on a POST
    // it turns a debit that actually succeeded into a failed row the recovery sweep
    // may supersede into a second charge. Losing an audit row is bad; charging a
    // customer twice to preserve one is worse.
    respondOnce({ api_status: "SUCCESS", decentroTxnId: "dt_1" });

    const exploding: ProviderApiLogWriter = {
      insert: () => Promise.reject(new Error("ledger is down")),
    };

    const result = await new DecentroClient(exploding).post(
      "/v3/payments/upi/autopay/mandate/notify",
      { reference_id: "pj_pdn_1" },
      { operation: "send_pdn", referenceId: "pj_pdn_1" }
    );

    // The call succeeded, and nothing was written.
    expect(result).toMatchObject({ api_status: "SUCCESS" });
    expect(await getPrisma().paymentProviderApiLog.count()).toBe(0);
  });
});
