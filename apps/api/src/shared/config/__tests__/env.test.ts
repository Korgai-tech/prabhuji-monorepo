import { afterEach, beforeEach, expect, test } from "vitest";
import { loadEnv, resetEnvCache } from "../env.js";

const ORIGINAL = { ...process.env };

// Required by EnvSchema (min 32 chars) and not under test here. The schema
// validates as a unit, so it must be present for any case asserting on some
// OTHER var — without it every loadEnv() fails on the pepper instead.
const PEPPER = "unit-test-pepper-not-secret-32chars";

beforeEach(() => {
  resetEnvCache();
  process.env.AUTH_OTP_PEPPER = PEPPER;
});
afterEach(() => {
  process.env = { ...ORIGINAL };
  resetEnvCache();
});

test("loadEnv parses a valid environment", () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  const env = loadEnv();
  expect(env.PORT).toBe(3000);
  expect(env.ENABLE_REDIS).toBe(false);
});

test("loadEnv throws when DATABASE_URL is missing", () => {
  delete process.env.DATABASE_URL;
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  expect(() => loadEnv()).toThrow(/Invalid environment/);
});

test("AUTH_OTP_PEPPER is required and must be at least 32 chars", () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  delete process.env.AUTH_OTP_PEPPER;
  expect(() => loadEnv()).toThrow(/AUTH_OTP_PEPPER/);

  // a short pepper weakens the phone-hash it seeds — the schema rejects it
  process.env.AUTH_OTP_PEPPER = "too-short";
  resetEnvCache();
  expect(() => loadEnv()).toThrow(/at least 32 characters/);
});

test('ENABLE_REDIS="false" coerces to boolean false', () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.ENABLE_REDIS = "false";
  expect(loadEnv().ENABLE_REDIS).toBe(false);
});

test("KAFKA_SASL defaults to none (plaintext transport)", () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  expect(loadEnv().KAFKA_SASL).toBe("none");
});

test("KAFKA_SASL=aws-iam requires AWS_REGION when Kafka is enabled", () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.ENABLE_KAFKA = "true";
  process.env.KAFKA_BROKERS = "b-1:9098";
  process.env.KAFKA_SASL = "aws-iam";
  delete process.env.AWS_REGION;
  expect(() => loadEnv()).toThrow(/AWS_REGION/);

  process.env.AWS_REGION = "ap-south-1";
  resetEnvCache();
  expect(loadEnv().KAFKA_SASL).toBe("aws-iam");
});

// TAM-84 (#EXPORT_CRITICAL): the media dev carve-out must be structurally
// incapable of reaching a deployed environment. `NODE_ENV=production` is the
// single tripwire (the image runs it on both stage and prod).
test("MEDIA_ALLOW_INSECURE_URLS=true HARD-FAILS boot when NODE_ENV=production", () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "an-otp-pepper-that-is-32-chars-min!!";
  process.env.MEDIA_BUCKET = "b";
  process.env.MEDIA_PUBLIC_BASE_URL = "https://cdn.example";
  process.env.NODE_ENV = "production";
  process.env.MEDIA_ALLOW_INSECURE_URLS = "true";
  expect(() => loadEnv()).toThrow(/MEDIA_ALLOW_INSECURE_URLS/);

  // Same flag is fine outside production — the dev carve-out.
  process.env.NODE_ENV = "development";
  resetEnvCache();
  expect(loadEnv().MEDIA_ALLOW_INSECURE_URLS).toBe(true);
});

test("MEDIA_BUCKET + MEDIA_PUBLIC_BASE_URL are required", () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "an-otp-pepper-that-is-32-chars-min!!";
  delete process.env.MEDIA_BUCKET;
  process.env.MEDIA_PUBLIC_BASE_URL = "https://cdn.example";
  expect(() => loadEnv()).toThrow(/MEDIA_BUCKET/);
});

test("ENABLE_TELEMETRY=true requires both the OTLP endpoint and the api key", () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.ENABLE_TELEMETRY = "true";
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.HYPERDX_API_KEY;
  expect(() => loadEnv()).toThrow(/OTEL_EXPORTER_OTLP_ENDPOINT/);

  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://clickstack:4318";
  resetEnvCache();
  // the SDK silently skips init without a key, so the schema fails fast instead
  expect(() => loadEnv()).toThrow(/HYPERDX_API_KEY/);

  process.env.HYPERDX_API_KEY = "key-123";
  resetEnvCache();
  const env = loadEnv();
  expect(env.ENABLE_TELEMETRY).toBe(true);
  expect(env.HYPERDX_API_KEY).toBe("key-123");
});

test("OPENAI_API_KEY is accepted when set (the key is the generation switch)", () => {
  // No separate flag: a configured key is what the composition root gates on to
  // construct the generator. The env schema just accepts and exposes it.
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
  expect(loadEnv().OPENAI_API_KEY).toBe("sk-test-not-a-real-key");
});

test("horoscope generation needs no key to boot — no key just means OFF", () => {
  // The kill switch is the key itself: with none set the module never
  // constructs a generator, so an environment with no OpenAI key boots exactly
  // as before (the daily endpoint 404s).
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  delete process.env.OPENAI_API_KEY;
  const env = loadEnv();
  expect(env.OPENAI_API_KEY).toBeUndefined();
  // Defaults are a matched PAIR: the model must be one the default gateway has
  // allow-listed, or every call 401s. Changing one without the other is the
  // failure this asserts against.
  expect(env.OPENAI_MODEL).toBe("gpt-5-nano");
  expect(env.OPENAI_BASE_URL).toBe(
    "https://prod-litellm-deployment-config-48788246490.asia-south1.run.app"
  );
  expect(env.HOROSCOPE_GENERATION_WAIT_MS).toBe(10_000);
});

test("an empty OPENAI_API_KEY counts as unset (generation OFF), not a valid secret", () => {
  // `.env` files and ECS task definitions both render an unset value as "".
  // With no flag to arm, an empty key is simply "off" — it must not throw.
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.OPENAI_API_KEY = "";
  expect(loadEnv().OPENAI_API_KEY).toBeUndefined();
});

function setCashfreeCreds() {
  process.env.CASHFREE_BASE_URL = "https://sandbox.cashfree.com/pg";
  process.env.CASHFREE_CLIENT_ID = "cf-client-id";
  process.env.CASHFREE_CLIENT_SECRET = "cf-client-secret";
}

test("PAYMENT_PROVIDER=cashfree requires the CASHFREE_* credentials", () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.PAYMENT_PROVIDER = "cashfree";
  delete process.env.CASHFREE_BASE_URL;
  delete process.env.CASHFREE_CLIENT_ID;
  delete process.env.CASHFREE_CLIENT_SECRET;
  expect(() => loadEnv()).toThrow(/CASHFREE_BASE_URL/);
});

test("PAYMENT_PROVIDER=cashfree boots with all credentials set", () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.PAYMENT_PROVIDER = "cashfree";
  process.env.PAYMENT_ENV = "staging";
  setCashfreeCreds();
  const env = loadEnv();
  expect(env.PAYMENT_PROVIDER).toBe("cashfree");
  // No PAYMENT_CALLBACK_TOKEN needed for Cashfree — callbacks are unverified
  // and confirmed by re-reading the provider's status API instead.
  //
  // Pinned deliberately: the version selects which Cashfree endpoints exist, and
  // the adapter's PG Subscriptions paths are the 2025-01-01 surface. The old
  // 2023-08-01 default had no POST /subscriptions/{id}/payments, which registered
  // mandates happily and then 404'd every debit. Change this only together with
  // cashfree.constants.ts.
  expect(env.CASHFREE_API_VERSION).toBe("2025-01-01");
});

test("PAYMENT_ENV=production must not point Cashfree at the sandbox host", () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.PAYMENT_PROVIDER = "cashfree";
  process.env.PAYMENT_ENV = "production";
  setCashfreeCreds(); // base URL is the sandbox host
  expect(() => loadEnv()).toThrow(/sandbox/);
});

// ---- OTP provider selection ------------------------------------------------

/** The baseline every OTP case needs before it can assert on an OTP var. */
function setBaseEnv(): void {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
}

function setMsg91Creds(): void {
  process.env.MSG91_AUTH_KEY = "auth-key-not-a-real-credential";
  process.env.MSG91_TEMPLATE_ID = "template-123";
}

function setRedis(): void {
  process.env.ENABLE_REDIS = "true";
  process.env.REDIS_URL = "redis://localhost:6379";
}

test("AUTH_OTP_PROVIDER defaults to stub and needs nothing else", () => {
  setBaseEnv();
  expect(loadEnv().AUTH_OTP_PROVIDER).toBe("stub");
});

test("AUTH_OTP_PROVIDER rejects a name that is not a registered provider", () => {
  setBaseEnv();
  // `dostii` used to be accepted here and silently fell back to the stub, so an
  // operator could arm it in production and get no SMS and no error.
  process.env.AUTH_OTP_PROVIDER = "dostii";
  expect(() => loadEnv()).toThrow(/AUTH_OTP_PROVIDER/);
});

test("AUTH_OTP_PROVIDER=msg91 requires its credentials together", () => {
  setBaseEnv();
  setRedis();
  process.env.AUTH_OTP_PROVIDER = "msg91";
  expect(() => loadEnv()).toThrow(/MSG91_AUTH_KEY/);

  process.env.MSG91_AUTH_KEY = "auth-key-not-a-real-credential";
  resetEnvCache();
  expect(() => loadEnv()).toThrow(/MSG91_TEMPLATE_ID/);
});

test("a real OTP provider refuses to boot without Redis", () => {
  // Two independent reasons, one assertion: the session store is Redis-backed,
  // and RedisRateLimiter no-ops when Redis is off — which against a paid SMS
  // gateway leaves an unmetered billable endpoint open to the internet.
  setBaseEnv();
  setMsg91Creds();
  process.env.AUTH_OTP_PROVIDER = "msg91";
  process.env.ENABLE_REDIS = "false";
  expect(() => loadEnv()).toThrow(/ENABLE_REDIS/);
});

test("a real OTP provider refuses to boot without REDIS_URL", () => {
  setBaseEnv();
  setMsg91Creds();
  process.env.AUTH_OTP_PROVIDER = "msg91";
  process.env.ENABLE_REDIS = "true";
  delete process.env.REDIS_URL;
  expect(() => loadEnv()).toThrow(/REDIS_URL/);
});

test("AUTH_OTP_PROVIDER=msg91 boots with credentials and Redis", () => {
  setBaseEnv();
  setRedis();
  setMsg91Creds();
  process.env.AUTH_OTP_PROVIDER = "msg91";
  const env = loadEnv();
  expect(env.AUTH_OTP_PROVIDER).toBe("msg91");
  expect(env.MSG91_BASE_URL).toBe("https://control.msg91.com");
  expect(env.MSG91_OTP_VAR).toBe("otp");
  expect(env.MSG91_TIMEOUT_MS).toBe(10_000);
});

test("the stub is exempt from the Redis requirement", () => {
  // Local dev and all 14 integration suites run with Redis off.
  setBaseEnv();
  process.env.AUTH_OTP_PROVIDER = "stub";
  process.env.ENABLE_REDIS = "false";
  expect(loadEnv().AUTH_OTP_PROVIDER).toBe("stub");
});

// ---- Neither stub may reach a deployed environment --------------------------
// The image runs NODE_ENV=production on BOTH stage and prod, so that is the one
// tripwire available — the same one MEDIA_ALLOW_INSECURE_URLS uses. These cases
// set every required var explicitly rather than leaning on the root `.env` Nx
// injects, so they assert the same thing in CI as they do on a laptop.

/** A complete, production-shaped environment with no provider selected yet. */
function setProdBaseEnv(): void {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "an-otp-pepper-that-is-32-chars-min!!";
  process.env.MEDIA_BUCKET = "app-prod-media";
  process.env.MEDIA_PUBLIC_BASE_URL = "https://cdn.example";
  process.env.NODE_ENV = "production";
  delete process.env.MEDIA_ALLOW_INSECURE_URLS;
  delete process.env.ALLOW_STUB_PROVIDERS_IN_PRODUCTION;
  // Nx injects the ROOT .env into every task, so a developer's local Decentro
  // sandbox values arrive here uninvited and trip the unrelated
  // PAYMENT_ENV=production host assertion. Clearing them is what makes these
  // cases assert the same thing on a laptop as in CodeBuild, which has no .env.
  delete process.env.DECENTRO_BASE_URL;
  delete process.env.DECENTRO_CLIENT_ID;
  delete process.env.DECENTRO_CLIENT_SECRET;
  delete process.env.DECENTRO_CONSUMER_URN;
  delete process.env.PAYMENT_CALLBACK_TOKEN;
}

test("AUTH_OTP_PROVIDER=stub HARD-FAILS boot when NODE_ENV=production", () => {
  // The stub accepts the fixed OTP "1234" for every phone number. Reaching prod
  // by *default* — because an env root simply never passed the variable — is the
  // exact failure this assertion exists to make impossible.
  setProdBaseEnv();
  delete process.env.AUTH_OTP_PROVIDER; // defaults to stub
  expect(() => loadEnv()).toThrow(/AUTH_OTP_PROVIDER/);
});

test("PAYMENT_PROVIDER=stub HARD-FAILS boot when NODE_ENV=production", () => {
  // The stub auto-approves mandates in memory: every subscriber gets Pro and
  // nothing is ever collected.
  setProdBaseEnv();
  setRedis();
  setMsg91Creds();
  process.env.AUTH_OTP_PROVIDER = "msg91"; // isolate the payment assertion
  delete process.env.PAYMENT_PROVIDER; // defaults to stub
  expect(() => loadEnv()).toThrow(/PAYMENT_PROVIDER/);
});

test("both stubs are fine outside production — that is what local dev runs on", () => {
  setProdBaseEnv();
  process.env.NODE_ENV = "development";
  delete process.env.AUTH_OTP_PROVIDER;
  delete process.env.PAYMENT_PROVIDER;
  const env = loadEnv();
  expect(env.AUTH_OTP_PROVIDER).toBe("stub");
  expect(env.PAYMENT_PROVIDER).toBe("stub");
});

test("ALLOW_STUB_PROVIDERS_IN_PRODUCTION opts out — for `pnpm deploy:local` only", () => {
  // That profile runs the built image with NODE_ENV=production against floci,
  // where no MSG91 or Cashfree credential exists. The flag is set in exactly one
  // place (docker-compose.yml's `deploy` profile) and is deliberately absent
  // from modules/stack/services.tf, so it cannot reach a deployed task without
  // someone adding it to a task definition by hand.
  setProdBaseEnv();
  delete process.env.AUTH_OTP_PROVIDER;
  delete process.env.PAYMENT_PROVIDER;
  process.env.ALLOW_STUB_PROVIDERS_IN_PRODUCTION = "true";
  const env = loadEnv();
  expect(env.AUTH_OTP_PROVIDER).toBe("stub");
  expect(env.PAYMENT_PROVIDER).toBe("stub");
});

test("a correctly wired production environment still boots", () => {
  // The guard must block only the stubs — a real msg91 + cashfree prod config is
  // the whole point and has to pass cleanly.
  setProdBaseEnv();
  setRedis();
  setMsg91Creds();
  process.env.AUTH_OTP_PROVIDER = "msg91";
  process.env.PAYMENT_PROVIDER = "cashfree";
  process.env.PAYMENT_ENV = "production";
  process.env.CASHFREE_BASE_URL = "https://api.cashfree.com/pg";
  process.env.CASHFREE_CLIENT_ID = "cf-client-id";
  process.env.CASHFREE_CLIENT_SECRET = "cf-client-secret";
  const env = loadEnv();
  expect(env.AUTH_OTP_PROVIDER).toBe("msg91");
  expect(env.PAYMENT_PROVIDER).toBe("cashfree");
  expect(env.PAYMENT_ENV).toBe("production");
});

test("ENABLE_DEV_TOOLS is refused when PAYMENT_ENV=production", () => {
  // /devtools/mark-pro is an unauthenticated lifetime Pro grant and is the one
  // route in this codebase with no authMiddleware. NODE_ENV cannot gate it —
  // the image runs NODE_ENV=production on stage too — so PAYMENT_ENV is the
  // discriminator, and prod must crash-loop rather than come up wide open.
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "x".repeat(32);
  process.env.ENABLE_DEV_TOOLS = "true";
  process.env.DEVTOOLS_TOKEN = "a-sufficiently-long-devtools-token";
  process.env.PAYMENT_ENV = "production";
  expect(() => loadEnv()).toThrow(/ENABLE_DEV_TOOLS/);
});

test("ENABLE_DEV_TOOLS boots on staging, where the routes are meant to exist", () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "x".repeat(32);
  process.env.ENABLE_DEV_TOOLS = "true";
  process.env.DEVTOOLS_TOKEN = "a-sufficiently-long-devtools-token";
  process.env.PAYMENT_ENV = "staging";
  expect(loadEnv().ENABLE_DEV_TOOLS).toBe(true);
});

test("arming dev tools without a token is refused", () => {
  // The routes carry no authMiddleware, so the token is their only gate.
  // Allowing an empty one would make the guard decorative.
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "x".repeat(32);
  process.env.ENABLE_DEV_TOOLS = "true";
  process.env.PAYMENT_ENV = "staging";
  delete process.env.DEVTOOLS_TOKEN;
  expect(() => loadEnv()).toThrow(/DEVTOOLS_TOKEN/);
});

// ---- Razorpay credentials + the single-active-provider rule ---------------
//
// Only the ACTIVE provider's credentials are required at boot. A gateway that
// no longer takes new registrations stays fully resolvable at runtime — its
// adapter is built lazily on the first row that needs it — so a missing
// credential there costs that gateway's rows, logged at error, rather than
// preventing the whole service from starting.
//
// This is deliberately NOT an "enabled gateways" list. A list you must remember
// to update is a list someone forgets, and the entry that would be forgotten is
// the gateway you just switched away from — the one case that must never break.

function setRazorpayCreds() {
  process.env.RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";
  process.env.RAZORPAY_KEY_ID = "rzp_test_abc123";
  process.env.RAZORPAY_KEY_SECRET = "rzp-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "rzp-webhook-secret";
}

function baseEnv() {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.PAYMENT_ENV = "staging";
}

test("PAYMENT_PROVIDER=razorpay requires the RAZORPAY_* credentials", () => {
  baseEnv();
  process.env.PAYMENT_PROVIDER = "razorpay";
  delete process.env.RAZORPAY_BASE_URL;
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  expect(() => loadEnv()).toThrow(/RAZORPAY_BASE_URL/);
});

test("razorpay boots with all credentials set", () => {
  baseEnv();
  process.env.PAYMENT_PROVIDER = "razorpay";
  setRazorpayCreds();
  expect(loadEnv().PAYMENT_PROVIDER).toBe("razorpay");
});

test("switching the active gateway does NOT require the old one's credentials", () => {
  // THE property that makes a cutover safe to perform and safe to forget about.
  // Razorpay is active; Decentro's mandates are still debited through Decentro
  // at runtime, but its credentials are not a BOOT requirement — so a deploy
  // can never be blocked, and can never be "fixed" by deleting the old
  // gateway's config, by a step nobody remembered.
  baseEnv();
  process.env.PAYMENT_PROVIDER = "razorpay";
  setRazorpayCreds();
  delete process.env.DECENTRO_BASE_URL;
  delete process.env.DECENTRO_CLIENT_ID;
  delete process.env.DECENTRO_CLIENT_SECRET;
  delete process.env.DECENTRO_CONSUMER_URN;
  expect(loadEnv().PAYMENT_PROVIDER).toBe("razorpay");
});

test("PAYMENT_ENV=staging refuses a Razorpay LIVE key", () => {
  // Razorpay has no separate sandbox host — api.razorpay.com serves both and
  // the mode is decided entirely by the key prefix. So the guard the other
  // gateways get from their base URL has to come from the credential here, or
  // a staging deploy debits real people with nothing in the config looking
  // wrong.
  baseEnv();
  process.env.PAYMENT_PROVIDER = "razorpay";
  setRazorpayCreds();
  process.env.RAZORPAY_KEY_ID = "rzp_live_abc123";
  expect(() => loadEnv()).toThrow(/live/);
});

test("PAYMENT_ENV=production refuses a Razorpay TEST key", () => {
  baseEnv();
  process.env.PAYMENT_ENV = "production";
  process.env.PAYMENT_PROVIDER = "razorpay";
  setRazorpayCreds(); // key id is rzp_test_*
  expect(() => loadEnv()).toThrow(/test key/);
});

test("FEED_REFRESH_INTERVAL_MS defaults to the 5h production schedule", () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  delete process.env.FEED_REFRESH_INTERVAL_MS;
  expect(loadEnv().FEED_REFRESH_INTERVAL_MS).toBe(5 * 60 * 60 * 1000);
});

test("FEED_REFRESH_INTERVAL_MS treats an empty value as unset, not as 0", () => {
  // A `.env` line with no value and an ECS task definition with an empty string
  // both arrive as "". Coerced naively that is 0, which is below the floor — so
  // merely DECLARING the key unset would crash-loop the task.
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.FEED_REFRESH_INTERVAL_MS = "";
  expect(loadEnv().FEED_REFRESH_INTERVAL_MS).toBe(5 * 60 * 60 * 1000);
});

test("FEED_REFRESH_INTERVAL_MS accepts a short testing interval", () => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.FEED_REFRESH_INTERVAL_MS = "300000";
  expect(loadEnv().FEED_REFRESH_INTERVAL_MS).toBe(5 * 60 * 1000);
});

test("FEED_REFRESH_INTERVAL_MS rejects a value below the floor", () => {
  // `5000` is the typo that means "5 minutes" and lands on 5 seconds — a whole
  // catalogue re-read every 5s for every filter combination.
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.FEED_REFRESH_INTERVAL_MS = "5000";
  expect(() => loadEnv()).toThrow(/FEED_REFRESH_INTERVAL_MS/);
});

// ---- TAM-260: ack-first callbacks ----------------------------------------

const CALLBACK_KNOBS = [
  "PAYMENT_CALLBACK_DEFERRED_PROVIDERS",
  "PAYMENT_CALLBACK_WORKER_CONCURRENCY",
  "PAYMENT_CALLBACK_LEASE_MS",
  "PAYMENT_CALLBACK_REDRIVE_INTERVAL_MS",
  "PAYMENT_CALLBACK_MAX_ATTEMPTS",
] as const;

function baseEnvWithoutCallbackKnobs(): void {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  for (const key of CALLBACK_KNOBS) delete process.env[key];
}

test("PAYMENT_CALLBACK_DEFERRED_PROVIDERS defaults to NONE when ABSENT (ships off: every gateway inline)", () => {
  baseEnvWithoutCallbackKnobs();
  expect(loadEnv().PAYMENT_CALLBACK_DEFERRED_PROVIDERS).toEqual([]);
});

test("PAYMENT_CALLBACK_DEFERRED_PROVIDERS=razorpay turns deferral on for Razorpay", () => {
  baseEnvWithoutCallbackKnobs();
  process.env.PAYMENT_CALLBACK_DEFERRED_PROVIDERS = "razorpay";
  expect(loadEnv().PAYMENT_CALLBACK_DEFERRED_PROVIDERS).toEqual(["razorpay"]);
});

test("PAYMENT_CALLBACK_DEFERRED_PROVIDERS='' means NONE — it is the rollback", () => {
  baseEnvWithoutCallbackKnobs();
  process.env.PAYMENT_CALLBACK_DEFERRED_PROVIDERS = "";
  expect(loadEnv().PAYMENT_CALLBACK_DEFERRED_PROVIDERS).toEqual([]);

  // Whitespace and stray commas are the same "none".
  process.env.PAYMENT_CALLBACK_DEFERRED_PROVIDERS = " , ";
  resetEnvCache();
  expect(loadEnv().PAYMENT_CALLBACK_DEFERRED_PROVIDERS).toEqual([]);
});

test("PAYMENT_CALLBACK_DEFERRED_PROVIDERS parses a comma list, trimmed and de-duplicated", () => {
  baseEnvWithoutCallbackKnobs();
  process.env.PAYMENT_CALLBACK_DEFERRED_PROVIDERS = " razorpay, decentro ,razorpay,";
  expect(loadEnv().PAYMENT_CALLBACK_DEFERRED_PROVIDERS).toEqual(["razorpay", "decentro"]);
});

test("PAYMENT_CALLBACK_DEFERRED_PROVIDERS rejects a name that is not a registered gateway", () => {
  // A typo must fail the boot, never silently defer nothing (or the reverse).
  baseEnvWithoutCallbackKnobs();
  process.env.PAYMENT_CALLBACK_DEFERRED_PROVIDERS = "razorpay,razorpy";
  expect(() => loadEnv()).toThrow(/PAYMENT_CALLBACK_DEFERRED_PROVIDERS.*razorpy/);
});

test("callback worker knobs default to the spec values (lease 10 min)", () => {
  baseEnvWithoutCallbackKnobs();
  const env = loadEnv();
  expect(env.PAYMENT_CALLBACK_WORKER_CONCURRENCY).toBe(4);
  expect(env.PAYMENT_CALLBACK_LEASE_MS).toBe(600_000);
  expect(env.PAYMENT_CALLBACK_REDRIVE_INTERVAL_MS).toBe(15_000);
  expect(env.PAYMENT_CALLBACK_MAX_ATTEMPTS).toBe(5);
});

test("callback worker knobs treat an empty value as unset and accept overrides", () => {
  baseEnvWithoutCallbackKnobs();
  process.env.PAYMENT_CALLBACK_WORKER_CONCURRENCY = "";
  process.env.PAYMENT_CALLBACK_LEASE_MS = "";
  process.env.PAYMENT_CALLBACK_REDRIVE_INTERVAL_MS = "5000";
  process.env.PAYMENT_CALLBACK_MAX_ATTEMPTS = "3";
  const env = loadEnv();
  expect(env.PAYMENT_CALLBACK_WORKER_CONCURRENCY).toBe(4);
  expect(env.PAYMENT_CALLBACK_LEASE_MS).toBe(600_000);
  expect(env.PAYMENT_CALLBACK_REDRIVE_INTERVAL_MS).toBe(5_000);
  expect(env.PAYMENT_CALLBACK_MAX_ATTEMPTS).toBe(3);
});

test("callback worker knobs reject out-of-range values", () => {
  for (const [key, value] of [
    ["PAYMENT_CALLBACK_WORKER_CONCURRENCY", "0"],
    // A lease shorter than one processing run re-claims live rows.
    ["PAYMENT_CALLBACK_LEASE_MS", "5000"],
    ["PAYMENT_CALLBACK_REDRIVE_INTERVAL_MS", "10"],
    ["PAYMENT_CALLBACK_MAX_ATTEMPTS", "0"],
  ] as const) {
    baseEnvWithoutCallbackKnobs();
    process.env[key] = value;
    resetEnvCache();
    expect(() => loadEnv(), key).toThrow(new RegExp(key));
  }
});
