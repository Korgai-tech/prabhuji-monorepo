import { z } from "zod";

import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";

const log = createModuleLogger("abtest:client");

/** Chars of an unexpected response body worth logging. */
const LOGGED_BODY_MAX_CHARS = 500;

/** Floor on the test-subject PUT's timeout — an admin action, not a hot path. */
const TEST_SUBJECT_TIMEOUT_MS = 5000;

/**
 * One `/evaluate` answer from the shared abtesting service.
 *
 * `inExperiment: true` carries the arm: `variantId` is the experiment's variant
 * id and `payload` its (possibly empty) config object. `inExperiment: false`
 * carries the service's `api_defaults` payload for this apiId, or `null` when
 * none is configured — the caller decides what "no experiment" means for its
 * surface.
 *
 * What this type deliberately CANNOT express is "the service failed": every
 * failure mode is `null` from `evaluateAbtest`, so a caller's fallback branch
 * is one narrow check rather than a taxonomy of errors it cannot act on.
 */
export type AbtestEvaluation =
  | { inExperiment: true; variantId: string; payload: Record<string, unknown> }
  | { inExperiment: false; defaultConfig: Record<string, unknown> | null };

export interface EvaluateAbtestOptions {
  /**
   * Only pass this when EVERY entry point that evaluates the same apiId can
   * supply it. The service re-checks targeting on sticky evaluations, so an
   * experiment with an app-version rule flaps a decided subject in and out
   * when one caller sends the version and another cannot (the paywall's
   * billing-callback path is exactly that caller).
   */
  appVersion?: string;
  traits?: Record<string, string>;
}

/**
 * The wire shape of `POST /evaluate`, loosely held.
 *
 * Only the fields this client acts on are declared, and `variant.payload` /
 * `defaultConfig` stay `unknown`: the payload is per-surface console content,
 * and validating it here would make the shared client the arbiter of every
 * surface's schema. Extra fields (experiment, bucketRange, gatePct, override)
 * pass through unparsed.
 */
const EvaluateResponseSchema = z.object({
  inExperiment: z.boolean(),
  bucket: z.number(),
  variant: z.object({ id: z.string(), payload: z.unknown() }).optional(),
  defaultConfig: z.unknown().optional(),
});

/** `null`/absent/array/scalar all read as "no object here", never as a throw. */
function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Asks the shared abtesting service which variant of `apiId` this subject gets.
 *
 * **Never throws, and `null` always means "no answer — use your fallback".**
 * Unconfigured env, timeout (`ABTEST_TIMEOUT_MS`), non-2xx, non-JSON, a body
 * that fails the schema, and the service's own fail-soft tell (`bucket: -1`,
 * its "I could not really evaluate" marker) all collapse to `null`, because
 * every caller sits on a path — app launch, paywall load — where an experiment
 * answer is the least important thing happening.
 *
 * The service persists the decision and exposure on a real assignment, so the
 * same subject gets the same arm on every call; stickiness lives there, not here.
 *
 * The URL is `<ABTEST_BASE_URL>/evaluate` with the base taken verbatim (only a
 * trailing slash trimmed) — unlike `fetchLatestUtm`'s origin-only rule, because
 * the abtesting service sits behind the shared ALB at a route prefix
 * (`/abtesting`), and `new URL("/evaluate", base)` would silently strip it.
 */
export async function evaluateAbtest(
  subjectId: string,
  apiId: string,
  options?: EvaluateAbtestOptions
): Promise<AbtestEvaluation | null> {
  const env = loadEnv();
  if (!env.ABTEST_BASE_URL || !env.ABTEST_TENANT_KEY) {
    // Half-configured is a DEPLOY defect, not a quiet no-op; both absent is the
    // valid "this env resolves experiments in-process" state and stays at debug.
    const level = !env.ABTEST_BASE_URL && !env.ABTEST_TENANT_KEY ? "debug" : "warn";
    log[level](
      {
        api_id: apiId,
        hasBaseUrl: Boolean(env.ABTEST_BASE_URL),
        hasTenantKey: Boolean(env.ABTEST_TENANT_KEY),
      },
      "abtest evaluation not configured; caller falls back"
    );
    return null;
  }

  const url = `${env.ABTEST_BASE_URL.replace(/\/+$/, "")}/evaluate`;
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), env.ABTEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        // Both are required: the key alone is a 401, and a key whose packed
        // tenant disagrees with this header is a 401 too. Constant for the same
        // reason the referral client's is — this deployment is one tenant.
        "x-tenant-id": "prabhuji",
        "x-tenant-key": env.ABTEST_TENANT_KEY,
      },
      body: JSON.stringify({
        subjectId,
        apiId,
        ...(options?.appVersion === undefined ? {} : { appVersion: options.appVersion }),
        ...(options?.traits === undefined ? {} : { traits: options.traits }),
      }),
      signal: abortController.signal,
    });

    if (response.status >= 400) {
      const text = await response.text();
      log.warn(
        { api_id: apiId, status: response.status, body: text.slice(0, LOGGED_BODY_MAX_CHARS) },
        "abtest evaluation failed; caller falls back"
      );
      return null;
    }

    // A gateway or WAF can answer 200 with an HTML page. Parsing that must be a
    // logged miss, not a thrown error on the app-launch path.
    const parsed = EvaluateResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      log.warn({ api_id: apiId }, "abtest evaluation returned an unexpected shape; caller falls back");
      return null;
    }
    const body = parsed.data;

    // The service's own fail-soft: it answers 200 with the last api default it
    // remembers rather than 5xx. Our in-process fallback is better informed than
    // a possibly-cold replica's memory, so this reads as "no answer" here.
    if (body.bucket === -1) {
      log.warn({ api_id: apiId }, "abtest service answered fail-soft; caller falls back");
      return null;
    }

    if (body.inExperiment) {
      if (body.variant === undefined) {
        log.warn({ api_id: apiId }, "abtest answer claims an experiment but names no variant");
        return null;
      }
      return {
        inExperiment: true,
        variantId: body.variant.id,
        payload: asObject(body.variant.payload) ?? {},
      };
    }
    return { inExperiment: false, defaultConfig: asObject(body.defaultConfig) };
  } catch (error) {
    // Abort (timeout) and network refusal land here alike; neither may surface.
    log.warn(
      { api_id: apiId, error: error instanceof Error ? error.message : String(error) },
      "abtest evaluation unreachable; caller falls back"
    );
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * The wire shape of `GET /bucket-space/subject/:subjectId`, loosely held.
 *
 * `totalBuckets` and the echoed `subjectId` are deliberately undeclared: the
 * caller asked where this subject sits, and the size of the space is a service
 * constant it can read from `/bucket-space` if it ever needs it.
 *
 * `int().min(0)` is the whole validity rule. A bucket is a POSITION, so a
 * negative, fractional or stringly-typed one is not a smaller answer — it is
 * not an answer, and filing it would poison every cohort query downstream.
 */
const SubjectBucketResponseSchema = z.object({
  bucket: z.number().int().min(0),
});

/**
 * Where does this subject sit in the tenant's bucket space?
 *
 * The answer is a pure function of `(subjectId, tenant)` — murmur3, computed
 * per request, stored nowhere and tied to no experiment. That is what makes it
 * worth stamping on an analytics event: it is the same number for the same user
 * forever, so a cohort split by it holds across every experiment that ever
 * runs, including the ones that did not exist when the row was written.
 *
 * **Never throws, and `null` always means "no bucket — report none".** Same
 * collapse as `evaluateAbtest` (unconfigured env, timeout, non-2xx, non-JSON,
 * bad shape), for the same reason: every caller is on a path where an analytics
 * property is the least important thing happening.
 *
 * `GET` needs no runtime-write allowance — reads take the runtime key, so the
 * same `ABTEST_TENANT_KEY` the evaluate family uses opens this route.
 */
export async function fetchSubjectBucket(subjectId: string): Promise<number | null> {
  const env = loadEnv();
  if (!env.ABTEST_BASE_URL || !env.ABTEST_TENANT_KEY) {
    // Same half-configured-is-a-deploy-defect rule as `evaluateAbtest`.
    const level = !env.ABTEST_BASE_URL && !env.ABTEST_TENANT_KEY ? "debug" : "warn";
    log[level](
      {
        hasBaseUrl: Boolean(env.ABTEST_BASE_URL),
        hasTenantKey: Boolean(env.ABTEST_TENANT_KEY),
      },
      "abtest bucket lookup not configured; caller reports no bucket"
    );
    return null;
  }

  // The subject id is a path SEGMENT here, unlike the evaluate family's body.
  // Encoding it is what keeps an id containing `/` or `?` from being read as a
  // different route — and the base keeps its `/abtesting` prefix verbatim, for
  // the reason spelled out on `evaluateAbtest`.
  const url = `${env.ABTEST_BASE_URL.replace(/\/+$/, "")}/bucket-space/subject/${encodeURIComponent(subjectId)}`;
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), env.ABTEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-tenant-id": "prabhuji",
        "x-tenant-key": env.ABTEST_TENANT_KEY,
      },
      signal: abortController.signal,
    });

    if (response.status >= 400) {
      const text = await response.text();
      log.warn(
        { status: response.status, body: text.slice(0, LOGGED_BODY_MAX_CHARS) },
        "abtest bucket lookup failed; caller reports no bucket"
      );
      return null;
    }

    const parsed = SubjectBucketResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      log.warn({}, "abtest bucket lookup returned an unexpected shape; caller reports no bucket");
      return null;
    }
    return parsed.data.bucket;
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "abtest bucket lookup unreachable; caller reports no bucket"
    );
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/** Outcome of `assignTestSubjectBucket` — a failure carries what to show an admin. */
export type TestSubjectAssignment =
  | { ok: true }
  | { ok: false; status: number | null; message: string };

/**
 * Pin a QA subject to a fixed bucket — `PUT /test-subjects/:subjectId` (TAM-187).
 *
 * The service then evaluates every experiment for this subject as if it hashed
 * to `bucket`, which is how a tester lands on a chosen arm deterministically.
 * The base URL is this deployment's own (`ABTEST_BASE_URL`), so a stage admin
 * pins against the staging service and a prod admin against production.
 *
 * Never throws, like the rest of this client — but unlike them it REPORTS the
 * failure instead of collapsing it to `null`: its caller is an admin who asked
 * for exactly this, so "the bucket was not set, and why" is the answer they
 * need, not a quiet fallback.
 */
export async function assignTestSubjectBucket(
  subjectId: string,
  bucket: number,
  note: string
): Promise<TestSubjectAssignment> {
  const env = loadEnv();
  // The service treats this write as configuration and needs the key to be
  // registered as an ADMIN key there; a runtime-only key gets a bare 401.
  if (!env.ABTEST_BASE_URL || !env.ABTEST_TENANT_KEY) {
    log.warn(
      {
        hasBaseUrl: Boolean(env.ABTEST_BASE_URL),
        hasTenantKey: Boolean(env.ABTEST_TENANT_KEY),
      },
      "abtest test-subject assignment not configured"
    );
    return {
      ok: false,
      status: null,
      message: "A/B bucket pinning is not configured on this environment (ABTEST_BASE_URL / ABTEST_TENANT_KEY)",
    };
  }

  const url = `${env.ABTEST_BASE_URL.replace(/\/+$/, "")}/test-subjects/${encodeURIComponent(subjectId)}`;
  const abortController = new AbortController();
  // An admin is waiting on this one, not an app launch — give it more room
  // than the hot-path evaluate budget.
  const timeoutHandle = setTimeout(
    () => abortController.abort(),
    Math.max(env.ABTEST_TIMEOUT_MS, TEST_SUBJECT_TIMEOUT_MS)
  );
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-tenant-id": "prabhuji",
        "x-tenant-key": env.ABTEST_TENANT_KEY,
      },
      body: JSON.stringify({ bucket, note }),
      signal: abortController.signal,
    });

    if (response.status >= 400) {
      const text = (await response.text()).slice(0, LOGGED_BODY_MAX_CHARS);
      log.warn(
        { status: response.status, body: text },
        "abtest test-subject assignment rejected"
      );
      return {
        ok: false,
        status: response.status,
        message: `A/B service answered ${response.status}${text ? `: ${text}` : ""}`,
      };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn({ error: message }, "abtest test-subject assignment unreachable");
    return { ok: false, status: null, message: `A/B service unreachable: ${message}` };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
