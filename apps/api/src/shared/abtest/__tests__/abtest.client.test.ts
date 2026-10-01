import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@api/shared/config";

const { assignTestSubjectBucket, evaluateAbtest, fetchSubjectBucket } = await import(
  "../abtest.client.js"
);

const ORIGINAL_ENV = { ...process.env };

/**
 * The minimum `loadEnv()` accepts, plus a configured abtest client. The base
 * URL carries the `/abtesting` route prefix ON PURPOSE — preserving it is the
 * one thing that separates this client's URL building from `fetchLatestUtm`'s
 * origin-only rule, and a regression to `new URL("/evaluate", base)` would
 * strip it.
 */
const baseEnv = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  JWT_SECRET: "a-sufficiently-long-secret",
  MEDIA_BUCKET: "test-bucket",
  MEDIA_PUBLIC_BASE_URL: "https://media.example.test",
  ABTEST_BASE_URL: "https://platform.example.test/abtesting",
  ABTEST_TENANT_KEY: "prabhuji.keyid.secret",
};

const SUBJECT = "019f5f4c-793c-7358-aec3-f7941d852db6";
const API_ID = "chat.agent";

/** A `fetch` that answers with `responder` and records every call. */
const stubFetch = (
  responder: () => Promise<Response>
): { calls: Array<{ url: string; init: RequestInit }> } => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return responder();
    })
  );
  return { calls };
};

const jsonResponse =
  (body: unknown, status = 200): (() => Promise<Response>) =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, ...baseEnv };
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
  resetEnvCache();
});

describe("evaluateAbtest", () => {
  it("POSTs to <base>/evaluate keeping the route prefix, with both tenant headers", async () => {
    const { calls } = stubFetch(
      jsonResponse({
        inExperiment: true,
        bucket: 720,
        variant: { id: "kuldevta_chat", payload: {} },
      })
    );

    await evaluateAbtest(SUBJECT, API_ID);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://platform.example.test/abtesting/evaluate");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-tenant-id"]).toBe("prabhuji");
    expect(headers["x-tenant-key"]).toBe("prabhuji.keyid.secret");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      subjectId: SUBJECT,
      apiId: API_ID,
    });
  });

  it("returns the arm for an in-experiment answer, defaulting a non-object payload to {}", async () => {
    stubFetch(
      jsonResponse({
        inExperiment: true,
        bucket: 720,
        experiment: { id: "x", key: "chat_agent_v2" },
        variant: { id: "content_chat", payload: null },
      })
    );

    await expect(evaluateAbtest(SUBJECT, API_ID)).resolves.toEqual({
      inExperiment: true,
      variantId: "content_chat",
      payload: {},
    });
  });

  it("returns the api default for an out-of-experiment answer, and null defaultConfig when absent", async () => {
    stubFetch(
      jsonResponse({ inExperiment: false, bucket: 5529, defaultConfig: { variant: "content_chat" } })
    );
    await expect(evaluateAbtest(SUBJECT, API_ID)).resolves.toEqual({
      inExperiment: false,
      defaultConfig: { variant: "content_chat" },
    });

    stubFetch(jsonResponse({ inExperiment: false, bucket: 5529 }));
    await expect(evaluateAbtest(SUBJECT, API_ID)).resolves.toEqual({
      inExperiment: false,
      defaultConfig: null,
    });
  });

  it("forwards appVersion and traits only when given", async () => {
    const { calls } = stubFetch(jsonResponse({ inExperiment: false, bucket: 1 }));

    await evaluateAbtest(SUBJECT, API_ID, { appVersion: "1.2.3", traits: { country: "IN" } });

    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      subjectId: SUBJECT,
      apiId: API_ID,
      appVersion: "1.2.3",
      traits: { country: "IN" },
    });
  });

  it("reads the service's fail-soft tell (bucket: -1) as no answer", async () => {
    // The service answers 200 with its last-remembered default rather than a
    // 5xx; our in-process fallback is better informed than a cold replica.
    stubFetch(jsonResponse({ inExperiment: false, bucket: -1, defaultConfig: {} }));
    await expect(evaluateAbtest(SUBJECT, API_ID)).resolves.toBeNull();
  });

  it("collapses unconfigured env to null without calling fetch", async () => {
    delete process.env.ABTEST_BASE_URL;
    delete process.env.ABTEST_TENANT_KEY;
    resetEnvCache();
    const { calls } = stubFetch(jsonResponse({}));

    await expect(evaluateAbtest(SUBJECT, API_ID)).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("collapses half-configured env to null too", async () => {
    process.env.ABTEST_TENANT_KEY = "";
    resetEnvCache();

    await expect(evaluateAbtest(SUBJECT, API_ID)).resolves.toBeNull();
  });

  it("collapses an error status to null", async () => {
    stubFetch(jsonResponse({ error: { code: "UNAUTHORIZED" } }, 401));
    await expect(evaluateAbtest(SUBJECT, API_ID)).resolves.toBeNull();
  });

  it("collapses a non-JSON 200 to null — a WAF page must not throw on the launch path", async () => {
    stubFetch(() => Promise.resolve(new Response("<html>blocked</html>", { status: 200 })));
    await expect(evaluateAbtest(SUBJECT, API_ID)).resolves.toBeNull();
  });

  it("collapses a shape the schema rejects to null", async () => {
    stubFetch(jsonResponse({ inExperiment: "yes", bucket: "many" }));
    await expect(evaluateAbtest(SUBJECT, API_ID)).resolves.toBeNull();
  });

  it("collapses an in-experiment answer naming no variant to null", async () => {
    stubFetch(jsonResponse({ inExperiment: true, bucket: 12 }));
    await expect(evaluateAbtest(SUBJECT, API_ID)).resolves.toBeNull();
  });

  it("collapses a network failure to null rather than rejecting", async () => {
    stubFetch(() => Promise.reject(new Error("ECONNREFUSED")));
    await expect(evaluateAbtest(SUBJECT, API_ID)).resolves.toBeNull();
  });

  it("aborts at ABTEST_TIMEOUT_MS and resolves null", async () => {
    vi.useFakeTimers();
    try {
      process.env.ABTEST_TIMEOUT_MS = "50";
      resetEnvCache();
      // A fetch that hangs until its signal aborts, like a stalled upstream.
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            })
        )
      );

      const pending = evaluateAbtest(SUBJECT, API_ID);
      await vi.advanceTimersByTimeAsync(60);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("fetchSubjectBucket", () => {
  it("GETs <base>/bucket-space/subject/<id> keeping the route prefix, with both tenant headers", async () => {
    const { calls } = stubFetch(
      jsonResponse({ subjectId: SUBJECT, bucket: 4211, totalBuckets: 10000 })
    );

    await fetchSubjectBucket(SUBJECT);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `https://platform.example.test/abtesting/bucket-space/subject/${SUBJECT}`
    );
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-tenant-id"]).toBe("prabhuji");
    expect(headers["x-tenant-key"]).toBe("prabhuji.keyid.secret");
  });

  it("returns the bucket the service reports, including bucket 0", async () => {
    stubFetch(jsonResponse({ subjectId: SUBJECT, bucket: 4211, totalBuckets: 10000 }));
    await expect(fetchSubjectBucket(SUBJECT)).resolves.toBe(4211);

    // Zero is a real position in the space, not a falsy "no answer".
    stubFetch(jsonResponse({ subjectId: SUBJECT, bucket: 0, totalBuckets: 10000 }));
    await expect(fetchSubjectBucket(SUBJECT)).resolves.toBe(0);
  });

  it("percent-encodes the subject id into the path", async () => {
    const { calls } = stubFetch(jsonResponse({ subjectId: "a/b?c", bucket: 1 }));

    await fetchSubjectBucket("a/b?c");

    expect(calls[0].url).toBe(
      "https://platform.example.test/abtesting/bucket-space/subject/a%2Fb%3Fc"
    );
  });

  it("collapses unconfigured env to null without calling fetch", async () => {
    delete process.env.ABTEST_BASE_URL;
    delete process.env.ABTEST_TENANT_KEY;
    resetEnvCache();
    const { calls } = stubFetch(jsonResponse({}));

    await expect(fetchSubjectBucket(SUBJECT)).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("collapses half-configured env to null too", async () => {
    process.env.ABTEST_TENANT_KEY = "";
    resetEnvCache();

    await expect(fetchSubjectBucket(SUBJECT)).resolves.toBeNull();
  });

  it("collapses an error status to null", async () => {
    stubFetch(jsonResponse({ error: { code: "UNAUTHORIZED" } }, 401));
    await expect(fetchSubjectBucket(SUBJECT)).resolves.toBeNull();
  });

  it("collapses a non-JSON 200 to null — a WAF page must not throw on the signup path", async () => {
    stubFetch(() => Promise.resolve(new Response("<html>blocked</html>", { status: 200 })));
    await expect(fetchSubjectBucket(SUBJECT)).resolves.toBeNull();
  });

  it("collapses a bucket that is not a position in the space to null", async () => {
    // The GET is not behind the service's fail-soft guard, so `-1` should never
    // arrive — but a negative or fractional bucket is not a place a subject can
    // sit, and filing one as `bucket_id` would poison every cohort query.
    stubFetch(jsonResponse({ subjectId: SUBJECT, bucket: -1 }));
    await expect(fetchSubjectBucket(SUBJECT)).resolves.toBeNull();

    stubFetch(jsonResponse({ subjectId: SUBJECT, bucket: 12.5 }));
    await expect(fetchSubjectBucket(SUBJECT)).resolves.toBeNull();

    stubFetch(jsonResponse({ subjectId: SUBJECT, bucket: "4211" }));
    await expect(fetchSubjectBucket(SUBJECT)).resolves.toBeNull();
  });

  it("collapses a network failure to null rather than rejecting", async () => {
    stubFetch(() => Promise.reject(new Error("ECONNREFUSED")));
    await expect(fetchSubjectBucket(SUBJECT)).resolves.toBeNull();
  });

  it("aborts at ABTEST_TIMEOUT_MS and resolves null", async () => {
    vi.useFakeTimers();
    try {
      process.env.ABTEST_TIMEOUT_MS = "50";
      resetEnvCache();
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            })
        )
      );

      const pending = fetchSubjectBucket(SUBJECT);
      await vi.advanceTimersByTimeAsync(60);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("assignTestSubjectBucket (TAM-187)", () => {
  it("PUTs {bucket, note} to <base>/test-subjects/:id with both tenant headers", async () => {
    const { calls } = stubFetch(jsonResponse({ ok: true }));

    await expect(assignTestSubjectBucket(SUBJECT, 42, "qa")).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://platform.example.test/abtesting/test-subjects/${SUBJECT}`);
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].init.headers).toMatchObject({
      "x-tenant-id": "prabhuji",
      "x-tenant-key": "prabhuji.keyid.secret",
    });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ bucket: 42, note: "qa" });
  });

  it("reports a rejection with its status instead of swallowing it", async () => {
    stubFetch(jsonResponse({ error: "forbidden" }, 403));

    await expect(assignTestSubjectBucket(SUBJECT, 1, "qa")).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("reports an unreachable service without throwing", async () => {
    stubFetch(() => Promise.reject(new Error("ECONNREFUSED")));

    await expect(assignTestSubjectBucket(SUBJECT, 1, "qa")).resolves.toMatchObject({
      ok: false,
      status: null,
    });
  });

  it("reports an unconfigured env without calling out", async () => {
    delete process.env.ABTEST_TENANT_KEY;
    resetEnvCache();
    const { calls } = stubFetch(jsonResponse({}));

    await expect(assignTestSubjectBucket(SUBJECT, 1, "qa")).resolves.toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });
});
