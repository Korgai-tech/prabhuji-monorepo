import { z } from "zod";
import { PAYMENT_PROVIDERS, PROVIDER, isPaymentProviderName } from "./payment-providers.js";
import type { PaymentProviderName } from "./payment-providers.js";
import { OTP_PROVIDERS, OTP_PROVIDER } from "./otp-providers.js";
import type { OtpProviderName } from "./otp-providers.js";

const boolFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

/**
 * An optional secret where an EMPTY string means "not set" (TAM-82).
 *
 * `.env` files and ECS task definitions both render an unset value as `""`
 * rather than omitting the key, and `""` must mean "no secret" — not "a secret
 * that fails validation and crash-loops the task", and certainly not "a secret
 * whose value is empty". Fail-closed: absent → the feature is skipped.
 */
function optionalSecret<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
}

/**
 * A bounded integer knob where an EMPTY string means "unset" (the default), for
 * the same reason as `FEED_REFRESH_INTERVAL_MS`: `z.coerce.number()` turns `""`
 * into 0, so a key that merely exists unset would fail the floor and
 * crash-loop the task.
 */
function intFromEnv(opts: { min: number; max: number; fallback: number }) {
  return z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().int().min(opts.min).max(opts.max).default(opts.fallback)
  );
}

/**
 * TAM-260: deferral ships OFF — no gateway is deferred by default; see the
 * schema entry. Turning it on is this one line (`[PROVIDER.RAZORPAY]`) or the
 * env var.
 */
const DEFAULT_DEFERRED_CALLBACK_PROVIDERS: readonly PaymentProviderName[] = [];

/**
 * `PAYMENT_CALLBACK_DEFERRED_PROVIDERS`: a comma list of registered gateway
 * names → a de-duplicated list.
 *
 *   absent        → the default (`[]` — every gateway inline)
 *   `""` / spaces → `[]` — every gateway inline (the rollback)
 *   `a, b,`       → `["a", "b"]` (whitespace and empty items tolerated)
 *   unknown name  → boot fails
 */
const deferredProviderList = z
  .string()
  .optional()
  .transform((raw, ctx): PaymentProviderName[] => {
    if (raw === undefined) return [...DEFAULT_DEFERRED_CALLBACK_PROVIDERS];
    const names = raw
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    const unknown = names.filter((n) => !isPaymentProviderName(n));
    if (unknown.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `unknown payment provider(s) ${unknown.join(", ")}; known: ${PAYMENT_PROVIDERS.join(", ")} (empty = none)`,
      });
      return z.NEVER;
    }
    return [...new Set(names.filter(isPaymentProviderName))];
  });

/**
 * Per-provider required env keys, enforced in the `superRefine` below.
 *
 * The ONE place a gateway's mandatory config is declared. Half-configured
 * payments is the worst state — we would mint real mandates the user approves,
 * then be unable to debit them — so every listed key must be present together
 * or the boot fails loudly. Adding a gateway = one row here (plus its keys in
 * the schema), never another `if` block.
 */
const PROVIDER_REQUIRED_KEYS = {
  [PROVIDER.DECENTRO]: [
    "DECENTRO_BASE_URL",
    "DECENTRO_CLIENT_ID",
    "DECENTRO_CLIENT_SECRET",
    "DECENTRO_CONSUMER_URN",
    "PAYMENT_CALLBACK_TOKEN",
  ],
  // No webhook-secret entry: a Cashfree webhook can be created without a signing
  // key and this account has none, so callbacks are accepted unverified. Safe
  // because the handler never trusts the body — it re-reads the provider status
  // API — which makes an unsigned webhook a trigger and nothing more.
  [PROVIDER.CASHFREE]: [
    "CASHFREE_BASE_URL",
    "CASHFREE_CLIENT_ID",
    "CASHFREE_CLIENT_SECRET",
  ],
  // Razorpay DOES issue a webhook signing secret and we verify every delivery
  // against it, so unlike Cashfree the secret is mandatory rather than absent.
  [PROVIDER.RAZORPAY]: [
    "RAZORPAY_BASE_URL",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
  ],
} as const satisfies Partial<Record<PaymentProviderName, readonly string[]>>;

/**
 * Per-OTP-provider required env keys, enforced in the `superRefine` below.
 *
 * Same shape and same reasoning as `PROVIDER_REQUIRED_KEYS`: a half-configured
 * SMS provider means every login silently fails at the one moment a user cannot
 * work around it, so the keys must be present together or the boot fails
 * loudly. `stub` needs nothing and is deliberately absent. Adding a provider =
 * one row here, never another `if` block.
 */
const OTP_PROVIDER_REQUIRED_KEYS = {
  [OTP_PROVIDER.MSG91]: ["MSG91_AUTH_KEY", "MSG91_TEMPLATE_ID"],
  // TrustSignal needs one more than MSG91 does: it takes the FULLY RENDERED
  // SMS body, so the DLT-registered text itself is configuration, not something
  // the vendor holds for us. All four together or the boot fails.
  [OTP_PROVIDER.TRUSTSIGNAL]: [
    "TRUSTSIGNAL_API_KEY",
    "TRUSTSIGNAL_SENDER_ID",
    "TRUSTSIGNAL_TEMPLATE_ID",
    "TRUSTSIGNAL_MESSAGE_TEMPLATE",
  ],
} as const satisfies Partial<Record<OtpProviderName, readonly string[]>>;

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default("0.0.0.0"),
    LOG_LEVEL: z.string().default("info"),
    // Serve interactive Swagger UI ("try it out") at /docs. Off by default —
    // keep it off in production. Local/dev only; the OpenAPI spec is built from
    // the same Zod route schemas that emit apps/api/openapi.json.
    ENABLE_API_DOCS: boolFromString,
    /**
     * TAM-175 — master switch for the deity-split feed (home + status + the
     * chip row). DEFAULT FALSE, so the feature ships DARK: deploying the code
     * and even running the warehouse sync changes nothing until this is on.
     *
     * The precedent is TAM-174's `shortcutGridGradientEnabled` — switching a
     * personalisation experiment off must never depend on another system being
     * reachable. This is read at the single chokepoint every surface goes
     * through (`DeityPreferenceService.getPreference`), so turning it off makes
     * every pool empty and every surface fall through to the unpersonalised
     * order, with no per-surface flag to forget.
     *
     * Truncating `user_deity_preferences` has the same effect but is a data
     * operation performed under pressure; this is the switch.
     */
    ENABLE_DEITY_SPLIT: boolFromString,
    // TEMPORARY (remove before prod) — mounts the dev-only endpoints in
    // core/devtools (POST /devtools/mark-pro). Off by default; the image is
    // NODE_ENV=production on BOTH stage and prod, so NODE_ENV can't gate this —
    // this flag is the switch. Set it on stage; leave it unset on prod so the
    // route 404s even if the code hasn't been removed yet.
    ENABLE_DEV_TOOLS: boolFromString,
    // Shared secret the devtools routes require in `x-devtools-token`. Not
    // optional when the routes are mounted (asserted in the superRefine below):
    // they carry no authMiddleware, so this is their only gate.
    DEVTOOLS_TOKEN: optionalSecret(z.string().min(16)),
    // Comma-separated exact browser origins allowed to call this API
    // (e.g. "https://app.krutyug.ai"). EMPTY = reflect any origin, which is what
    // local dev, the tests and the OpenAPI emitter need. The mobile app is not a
    // browser and sends no Origin header, so it is unaffected either way — the
    // admin CMS is the only browser client, and its origin is known at deploy
    // time. Deployed envs set this; see modules/stack/services.tf.
    CORS_ALLOWED_ORIGINS: z.string().optional(),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(16),
    JWT_EXPIRES_IN: z
      .string()
      .regex(/^\d+(ms|s|m|h|d|w|y)?$/)
      .default("30d"),
    ENABLE_REDIS: boolFromString,
    REDIS_URL: z.string().url().optional(),
    // Phone-hash pepper — mixed into SHA-256 over (countryCode+phoneNumber)
    // in the OTP module. Required (min 32 chars) so a database dump on its
    // own can't be rainbow-tabled back to phone numbers. Stored in Secrets
    // Manager in prod; `.env` in dev.
    AUTH_OTP_PEPPER: z
      .string()
      .min(32, "AUTH_OTP_PEPPER must be at least 32 characters"),
    // Which OTP provider adapter to wire up. `stub` is the default for local
    // dev + integration tests (fixed OTP "1234"); real providers plug in
    // behind the same OtpProvider interface (see core/otp/providers.ts). The
    // enum is derived from the shared OTP_PROVIDERS tuple, so adding a provider
    // needs no edit here. Every non-stub provider REQUIRES Redis — see the
    // superRefine below.
    AUTH_OTP_PROVIDER: z.enum(OTP_PROVIDERS).default(OTP_PROVIDER.STUB),
    // ---- MSG91 (the first real SMS transport) -----------------------------
    // We generate, hash and verify the OTP ourselves; MSG91 only DELIVERS it
    // (Flow API v5). So none of our OTP semantics — expiry, attempt limits,
    // one-shot invalidation — depend on the vendor, and a second vendor is a
    // ~40-line OtpSmsSender rather than another session lifecycle.
    // ---- Test numbers (QA + store-review accounts) ------------------------
    // Comma-separated BARE national numbers, no country code and no spaces —
    // e.g. "9111111111,9222222222". A number listed here skips SMS delivery
    // entirely and its OTP is `TEST_OTP` instead of a random one.
    //
    // This is a LOGIN BYPASS. Three properties keep it survivable:
    //   * matching is EXACT against the full national number, never a prefix,
    //     so "9111111111" cannot admit "91111111119";
    //   * `TEST_OTP` is required alongside it (superRefine below), so a
    //     half-configured deploy fails to boot rather than falling back to a
    //     guessable code;
    //   * only DELIVERY and CODE CHOICE change. Expiry, attempt limits,
    //     one-shot burn and rate limiting are the ordinary ones — see
    //     `LocalOtpProvider.sendOtp`.
    // Unset (the default) disables the whole mechanism.
    TEST_NUMBERS: z.string().optional(),
    // The fixed code those numbers accept. Four digits, matching OTP_LENGTH in
    // `core/otp/services/otp.config.ts` (not imported — `shared/` must not
    // depend on `core/`). Quote it in every config: an unquoted 0123 is parsed
    // as a number by most YAML/JSON tooling and arrives as "123".
    TEST_OTP: optionalSecret(z.string().regex(/^\d{4}$/)),
    MSG91_BASE_URL: z.string().url().default("https://control.msg91.com"),
    MSG91_AUTH_KEY: optionalSecret(z.string().min(1)),
    // The DLT-registered template the OTP is delivered through. India mandates
    // pre-approved templates; there is no free-text path to a real handset.
    MSG91_TEMPLATE_ID: optionalSecret(z.string().min(1)),
    // Optional: many templates bake the sender in, in which case MSG91 ignores
    // this. Set it only if your template expects it.
    MSG91_SENDER_ID: optionalSecret(z.string().min(1)),
    // The variable name the OTP is substituted into inside the DLT template
    // (`##otp##` -> "otp"). Configurable because it is chosen when the template
    // is registered, not fixed by MSG91.
    MSG91_OTP_VAR: z.string().min(1).default("otp"),
    // TAM-123 — the DLT template variable that carries the Google SMS Retriever
    // 11-char hash suffix (`\n\n<##>{{otphash}}` at the tail of the template).
    // The MSG91 dashboard picks the name; the default is the one OUR registered
    // template actually uses, so no deployed env has to set this. When the
    // client sends `appSignatureHash`, we render it into this slot; when
    // absent, we omit the field entirely so an unset template variable renders
    // as empty string.
    MSG91_HASH_VAR: z.string().min(1).default("otphash"),
    MSG91_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(10_000),
    // ---- TrustSignal (TAM-162, second SMS transport) ----------------------
    // Same division of labour as MSG91 — we own the OTP, the vendor only
    // carries it — but the wire contract differs in one way that shapes the
    // config below: TrustSignal has NO server-side template rendering. It takes
    // the finished message text plus the DLT template id and checks that they
    // agree. So the registered body lives here as a template we substitute into.
    TRUSTSIGNAL_BASE_URL: z.string().url().default("https://sms.trustsignal.io"),
    // The credential travels as a QUERY PARAMETER (`?api_key=`), not a header —
    // TrustSignal's design, not ours. It is why the client logs the path and
    // never the URL: a full-URL log line is a credential in a log sink.
    TRUSTSIGNAL_API_KEY: optionalSecret(z.string().min(1)),
    // The DLT "HEADER" — the 5-6 char sender the handset shows, e.g. "PBJAI".
    // Required, unlike MSG91_SENDER_ID: TrustSignal rejects a send without it.
    TRUSTSIGNAL_SENDER_ID: optionalSecret(z.string().min(1)),
    // The 19-digit DLT template id the body must match.
    TRUSTSIGNAL_TEMPLATE_ID: optionalSecret(z.string().min(1)),
    // The DLT-registered body, VERBATIM, with its DLT variable tokens left in
    // place — paste it straight out of the DLT portal, e.g.
    //   "Your OTP for Prabhuji {#num#}. This code is valid for 10 minutes. Do
    //    not share it with anyone. {#alp#} -Prabhu Ji"
    // `{#num#}` takes the OTP and `{#alp#}` the SMS Retriever hash. Keeping the
    // DLT tokens as the placeholder syntax means there is no translation step
    // for ops to get wrong, and a diff against the portal is a literal diff.
    // Every non-token character must match the registration exactly or the
    // operator drops the message — silently, after we have reported "sent".
    TRUSTSIGNAL_MESSAGE_TEMPLATE: optionalSecret(z.string().min(1)),
    // "transactional" is the only correct route for an OTP: promotional traffic
    // is DND-filtered and time-windowed, so a login code sent promotionally
    // fails for a large share of Indian handsets, at night, unpredictably.
    TRUSTSIGNAL_ROUTE: z.string().min(1).default("transactional"),
    TRUSTSIGNAL_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .max(30_000)
      .default(10_000),
    // Bootstrap admin (TAM-82). BOTH ARE OPTIONAL AND HAVE NO DEFAULT — that is
    // the security property, not an oversight: a missing secret must produce NO
    // admin, not a weak admin. Both absent => the boot path is skipped entirely
    // and no admin account exists (fail-closed). Set them together or not at
    // all (enforced in the superRefine below). Secrets Manager on stage/prod;
    // `.env` locally. NEVER commit a value; NEVER add a default here.
    ADMIN_BOOTSTRAP_EMAIL: optionalSecret(z.string().email()),
    // min 16 — deliberately stricter than the min-8 on /auth/register. This
    // credential is the platform's root of admin access, it is machine-supplied
    // rather than human-chosen, and there is no rate limiting on /auth/login.
    ADMIN_BOOTSTRAP_PASSWORD: optionalSecret(
      z.string().min(16, "ADMIN_BOOTSTRAP_PASSWORD must be at least 16 characters")
    ),
    // Media storage (admin CMS uploads — TAM-83 infra / TAM-84 core/media).
    // The api presigns direct-to-S3 PUTs; it never touches the bytes.
    //
    // MEDIA_BUCKET + MEDIA_PUBLIC_BASE_URL are REQUIRED — core/media cannot mint
    // a key or a public URL without them, so a missing value must fail the boot
    // loudly rather than silently presign against an empty bucket. TAM-83 froze
    // these names; do not rename.
    MEDIA_BUCKET: z.string().min(1),
    // The base URL every stored media URL is built from and validated against
    // (ADR §A4). ALWAYS the CloudFront domain on stage/prod, the floci endpoint
    // locally. Deliberately NOT https-asserted here: locally it is
    // `http://localhost:4566/app-local-media`, and asserting https would
    // hard-fail `pnpm deploy:local` (NODE_ENV=production against floci http).
    // The https/dev-http distinction lives in `MEDIA_ALLOW_INSECURE_URLS` + the
    // `mediaUrl` helper, never on this base (TAM-83 handoff).
    MEDIA_PUBLIC_BASE_URL: z.string().url(),
    // DEV-ONLY carve-out (default false). When true, the `mediaUrl` helper
    // additionally accepts `http://` on localhost / 127.0.0.1 / 10.0.2.2 so a
    // floci-uploaded asset passes response serialization. The superRefine below
    // HARD-FAILS boot if this is true while NODE_ENV=production — that single
    // assertion is what keeps the carve-out out of stage and prod (both run
    // NODE_ENV=production), so it can never weaken a deployed environment.
    MEDIA_ALLOW_INSECURE_URLS: boolFromString,
    // TAM-267 upload optimizer (default false). When true, a presign for a heavy
    // video/audio field (`optimizableTarget` in @prabhuji/media-profiles —
    // status video, paywall hero, banners, aarti/book audio) signs the PUT for
    // `incoming/<key>` and returns `processing: true`; the media-optimizer
    // Lambda (S3 event on `incoming/`) writes the final key, and the CMS polls
    // `GET /admin/media/status` before saving. MUST only be true where that
    // Lambda is deployed — Terraform's `enable_media_upload_optimizer` sets both
    // together. With no Lambda, every optimisable upload would sit in
    // `incoming/` forever and the CMS would time out. Off locally: floci has no
    // Lambda, so local dev keeps the direct upload.
    MEDIA_OPTIMIZE_UPLOADS: boolFromString,
    // Escape hatch for ONE caller: `pnpm deploy:local`, which runs the built
    // image with NODE_ENV=production (to mirror stage/prod) against floci, where
    // no MSG91 or Cashfree credential exists. Without this the stub assertions
    // below would crash-loop the local image smoke test.
    //
    // The name is deliberately long and self-indicting. It is set in exactly one
    // place — the `deploy` profile in docker-compose.yml — and is NOT wired into
    // modules/stack/services.tf, so putting it on a deployed task requires
    // adding it to the task definition by hand: a reviewable code change, not a
    // forgotten variable. That asymmetry is the whole point. The dangerous state
    // was "prod silently inherits a stub default"; the remaining state is
    // "someone explicitly typed ALLOW_STUB_PROVIDERS_IN_PRODUCTION into prod's
    // infrastructure", which a reviewer cannot miss.
    ALLOW_STUB_PROVIDERS_IN_PRODUCTION: boolFromString,
    // Domain-event bus (event-driven modular monolith). Off = in-process
    // transport (synchronous local dispatch, zero infra). On = Kafka/MSK.
    ENABLE_KAFKA: boolFromString,
    KAFKA_BROKERS: z.string().min(1).optional(), // comma-separated host:port list
    KAFKA_TOPIC_PREFIX: z.string().min(1).optional(), // isolate envs on a shared cluster
    // Broker auth: "none" = plaintext (local redpanda / floci-aws MSK); "aws-iam"
    // = TLS + SASL/OAUTHBEARER signed from the task IAM role (production MSK).
    KAFKA_SASL: z.enum(["none", "aws-iam"]).default("none"),
    AWS_REGION: z.string().min(1).optional(), // used to sign MSK IAM auth tokens
    // Observability: OpenTelemetry -> hosted ClickStack (HyperDX). Off = no SDK.
    ENABLE_TELEMETRY: boolFromString,
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(), // ClickStack OTLP collector
    HYPERDX_API_KEY: z.string().min(1).optional(), // ingestion auth — the SDK skips init without it
    // ---- Analytics warehouse (ClickHouse Cloud) ---------------------------
    // Read by the TAM-175 deity-preference sync task AND, since TAM-256, by the
    // admin status-performance page. EVERY field is optional on purpose: the
    // serving API must boot and stay ALB-healthy with none of them set
    // (TAM-175's Invariant 2). Absent config is a typed "unconfigured" outcome
    // the admin page degrades to — never a throw, never a boot failure. Do NOT
    // promote these to required, and do NOT add a superRefine pairing them with
    // a feature flag: a half-configured warehouse must degrade, not crash.
    CLICKHOUSE_URL: optionalSecret(z.string().url()),
    CLICKHOUSE_USER: optionalSecret(z.string().min(1)),
    CLICKHOUSE_PASSWORD: optionalSecret(z.string().min(1)),
    // No default, EVER — each environment reads its OWN database (stage:
    // `staging`, prod: `production`). A default would let a stage task read
    // production. Note `production`, not `prod`: the `prod` database exists but
    // is empty, and `apps/events/db/migrate.ts` still points at it (TAM-257).
    CLICKHOUSE_DATABASE: optionalSecret(z.string().min(1)),
    // The `saas_events.tenant` predicate. Also no default: it is the difference
    // between "our numbers" and "everyone's numbers" the day a second tenant
    // lands, and it leads the table's sort key so the filter is free.
    CLICKHOUSE_TENANT: optionalSecret(z.string().min(1)),
    // ---- Discovery feed rotation ------------------------------------------
    // How often the rotated listings re-order (home feed, status, ringtone,
    // wallpaper). The 5h default IS the production schedule — and prod should leave this unset rather than restate it.
    //
    // It exists so a tester can watch several refreshes in a sitting without a
    // code change and a deploy (the old way was editing the constant, which
    // shipped to prod once already and had to be reverted). Set it on stage or
    // locally; a 5-minute value gives a refresh every 5 minutes.
    //
    // Bounded on BOTH sides deliberately. The floor stops a typo (`5000` meaning
    // "5 minutes") from rebuilding every plan every 5 seconds — each rebuild is
    // a whole-catalogue read for every filter combination. The ceiling stops a
    // value so long the feed never moves, which is the bug rotation exists to
    // fix. Anything outside the range fails the boot loudly instead of quietly
    // degrading; `rotation.ts` reads the same variable and falls back to the
    // same default, so an unvalidated import (a test, a script) still works.
    // The `""` preprocess is load-bearing, not defensive: a `.env` line with no
    // value and an ECS task definition with an empty string both arrive as `""`,
    // which `z.coerce.number()` turns into 0 — below the floor, so a KEY THAT
    // MERELY EXISTS UNSET would crash-loop the task. Same reason as
    // `optionalSecret` above.
    FEED_REFRESH_INTERVAL_MS: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.coerce
        .number()
        .int()
        .min(60_000) // 1 minute
        .max(24 * 60 * 60 * 1000) // 1 day
        .default(5 * 60 * 60 * 1000)
    ),
    // ---- Analytics: server-side events -> apps/events -> ClickHouse -------
    // The API is a PRODUCER for the same door the Flutter SDK posts to
    // (Amplitude HTTP V2), so the warehouse sees the payment funnel the client
    // cannot: mandate registered, approval landed, renewal settled, lapse.
    // Off by default — the send is best-effort and never gates a payment.
    ANALYTICS_EVENTS_ENABLED: boolFromString,
    ANALYTICS_EVENTS_URL: z.string().url().optional().or(z.literal("")), // <events base>/2/httpapi
    ANALYTICS_EVENTS_API_KEY: z.string().default(""), // the collector's EVENTS_API_KEY
    ANALYTICS_EVENTS_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(5_000),
    // The shared platform's referral service — attribution touches, read at
    // `<REFERRAL_BASE_URL>/referral/v1/<userId>/latest`, behind the four
    // `bk_*_utm_source_success` events.
    //
    // A URL of its OWN rather than one derived from `ANALYTICS_EVENTS_URL` above,
    // even though on stage they are the same host: on prod they are NOT. Prod's
    // api posts events to its own stack collector while its referral service
    // lives on the shared platform, so deriving the origin would silently look
    // attribution up on prabhuji's own ALB and read every user as "no campaign".
    //
    // Both halves are required, matching `ANALYTICS_EVENTS_URL` + its key: either
    // one empty disables the UTM events rather than half-configuring them. Only
    // the timeout is shared with the collector.
    REFERRAL_BASE_URL: z.string().url().optional().or(z.literal("")),
    REFERRAL_TENANT_KEY: z.string().default(""),
    // ---- Chatbot: RAGFlow agent completions --------------------------------
    // The assistant's whole provider surface is one POST to
    // `<base>/api/v1/agents/chat/completions`. All three values are
    // `optionalSecret` so an unset deployment (local, CI, the OpenAPI emitter)
    // boots fine — the routes still exist and the CONTRACT is unchanged; the
    // client is built lazily on the first message and a missing value becomes a
    // 503 on that one endpoint rather than a crash-looping task.
    RAGFLOW_BASE_URL: optionalSecret(z.string().url()),
    RAGFLOW_API_KEY: optionalSecret(z.string().min(1)),
    // NOTE: which agent serves which A/B variant is NOT configuration — it is
    // `VARIANT_AGENTS` in `core/chat/services/chat.agents.ts`. The agent id
    // reaches the provider verbatim, so the set of reachable agents stays in
    // reviewed source rather than in an env var.
    /**
     * Deliberately breaks the 30s ceiling every other provider uses: a RAGFlow
     * agent turn is a full RAG pipeline plus an LLM completion (~5s warm), and
     * the instance cold-starts. 120s matches the provider's own client.
     */
    RAGFLOW_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .max(180_000)
      .default(120_000),
    // ---- A/B testing -------------------------------------------------------
    // The shared platform's abtesting service (TAM-173), consulted FIRST for
    // chat and paywall variants via `shared/abtest/abtest.client.ts`. Both
    // halves unset is a valid state — every surface falls back to its
    // in-process bucket map (`chat.buckets.ts` / `paywall.buckets.ts`), which
    // is also the answer on ANY client failure, so a service blip can never
    // switch a surface off. Prod stays unset until a tenant key is issued
    // (`pnpm --filter @svc/abtesting issue-key prabhuji`).
    //
    // The base URL includes the service's route prefix (`/abtesting` behind
    // the shared ALB) — the client appends only `/evaluate`. Its own URL for
    // the same reason as `REFERRAL_BASE_URL` above: stage shares one host,
    // prod does not.
    ABTEST_BASE_URL: z.string().url().optional().or(z.literal("")),
    ABTEST_TENANT_KEY: z.string().default(""),
    // Short deliberately: evaluation sits on `GET /users/me` (app launch) and
    // the paywall read. The service's own eval deadline is 3s; waiting that
    // long here would let a slow dependency tax every launch, when the
    // in-process fallback is always available and correct.
    ABTEST_TIMEOUT_MS: z.coerce.number().int().positive().max(10_000).default(1_500),
    // ---- TAM-258: app-landing experiments --------------------------------
    // When the landing experiments started. A user whose FIRST successful OTP
    // verify predates this is excluded from both arms — not counted as control,
    // not in the experiment at all.
    //
    // UNSET falls back to the placeholder in
    // `core/users/services/landing.constants.ts` (the ticket's deploy date), and
    // so does an unparseable value. Neither falls back to "no gate": a typo must
    // not be able to enrol the whole existing user base in an experiment whose
    // cohort rule explicitly excludes them.
    LANDING_EXPERIMENT_START_AT: z.string().optional().or(z.literal("")),
    // ---- TAM-174: generalized modal webhooks -----------------------------
    // The shared secret the audience-campaign service presents on
    // POST /internal/modals/hooks. UNSET is the valid "this environment
    // receives no campaign webhooks" state and the route is then NOT
    // REGISTERED AT ALL — a 404 rather than an endpoint that accepts anonymous
    // callers, matching how the estate's other machine callbacks behave.
    MODAL_HOOK_KEY: z.string().default(""),
    // ---- Payments: UPI Autopay recurring mandates -------------------------
    // `stub` is an in-memory provider that auto-approves after a short delay —
    // it makes the whole flow (register → approve → debit → entitlement)
    // runnable with no vendor credentials, no callback whitelisting, and no
    // real UPI app. That matters more than for OTP: an Android emulator has no
    // GPay/PhonePe to approve a mandate with. Default `stub` so a misconfigured
    // deploy cannot accidentally move real money.
    // The enum is derived from the shared PAYMENT_PROVIDERS tuple, so adding a
    // gateway needs no edit here. Deployed envs set this to `cashfree` (the
    // primary real gateway) explicitly.
    // The gateway NEW mandates register on, and only that. Every gateway in the
    // registry stays resolvable regardless, so an existing subscriber keeps
    // being served by the gateway named in their own row after a switch — see
    // the composition root. There is deliberately no companion "enabled" list:
    // one more thing to remember is one more thing to forget, and the thing
    // that would be forgotten is the gateway you just switched away from.
    PAYMENT_PROVIDER: z.enum(PAYMENT_PROVIDERS).default(PROVIDER.STUB),
    // Which Decentro environment we point at. NOT derivable from NODE_ENV: the
    // image runs NODE_ENV=production on BOTH stage and prod (services.tf
    // hardcodes it), so NODE_ENV cannot distinguish "stage against the sandbox"
    // from "prod against live money".
    PAYMENT_ENV: z.enum(["staging", "production"]).default("staging"),
    DECENTRO_BASE_URL: optionalSecret(z.string().url()),
    DECENTRO_CLIENT_ID: optionalSecret(z.string().min(1)),
    DECENTRO_CLIENT_SECRET: optionalSecret(z.string().min(1)),
    DECENTRO_CONSUMER_URN: optionalSecret(z.string().min(1)),
    DECENTRO_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(10_000),
    // ---- Cashfree UPI Autopay (the default real gateway) ------------------
    CASHFREE_BASE_URL: optionalSecret(z.string().url()),
    CASHFREE_CLIENT_ID: optionalSecret(z.string().min(1)),
    CASHFREE_CLIENT_SECRET: optionalSecret(z.string().min(1)),
    // Cashfree's `x-api-version` (PG Subscriptions). Pinned so a dashboard-side
    // version change can't silently reshape responses under the adapter.
    // Selects WHICH Cashfree API surface exists — the PG Subscriptions paths in
    // cashfree.constants.ts are the 2025-01-01 surface. Terraform sets this on
    // every deployed env; the default matches so a local run behaves the same.
    // It was 2023-08-01, under which POST /subscriptions/{id}/payments does not
    // exist: mandates registered fine and the first live debit 404'd (prod,
    // 2026-07-29). Change it only together with those paths.
    CASHFREE_API_VERSION: z.string().default("2025-01-01"),
    // Cashfree has no webhook-auth key here: the account issues no signing key,
    // so callbacks are accepted unverified (UnverifiedAuthenticator) and the
    // handler re-reads the provider status API instead of trusting the body.
    // Decentro keeps PAYMENT_CALLBACK_TOKEN below for its own scheme.
    CASHFREE_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(10_000),
    RAZORPAY_BASE_URL: optionalSecret(z.string().url()),
    RAZORPAY_KEY_ID: optionalSecret(z.string().min(1)),
    RAZORPAY_KEY_SECRET: optionalSecret(z.string().min(1)),
    RAZORPAY_WEBHOOK_SECRET: optionalSecret(z.string().min(1)),
    RAZORPAY_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(10_000),
    // Where Cashfree's hosted authorization page redirects the browser after
    // the user completes / cancels the UPI mandate authorization. We use
    // `channel: "link"` (see cashfree-mandate.repository.ts) which routes
    // users through a Cashfree-hosted page before the UPI app launches — this
    // is the URL that page redirects to on return.
    //
    // Default is the TAM-124 App Link that opens Prabhuji directly at the
    // paywall on Android (Android App Links auto-verify intercepts the
    // browser open); on desktop / other clients it falls through to the
    // marketing page. Override per environment if a specific return URL is
    // needed (e.g. a bounce page that pings a webhook).
    CASHFREE_RETURN_URL: z
      .string()
      .url()
      .default("https://krutyug.ai/app/pro"),
    // The static token we hand the provider, which they echo on every callback.
    // Decentro's India v3 stack has NO HMAC signing (the X-Signature scheme in
    // their docs belongs to a different product), so this plus an IP allowlist
    // plus confirm-by-polling is the entire defence. min 32 because it is a
    // bearer credential sitting on a PUBLIC, unauthenticated route.
    PAYMENT_CALLBACK_TOKEN: optionalSecret(z.string().min(32)),
    // Header the provider echoes the token in. Configurable because it is
    // agreed with them per-integration rather than fixed by a spec.
    PAYMENT_CALLBACK_HEADER: z.string().default("x-prabhuji-callback-token"),
    // Comma-separated IPv4 CIDRs. EMPTY = no IP check: the provider publishes
    // no stable egress ranges, and an allowlist that silently drops every
    // callback is a worse failure than not having one. The composition root
    // warns at boot when it is empty so this stays a visible choice.
    PAYMENT_CALLBACK_IP_ALLOWLIST: z.string().optional(),
    // How long a mandate approval link stays valid (provider caps at 1440).
    PAYMENT_MANDATE_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    // Shown to the user inside their UPI app when approving.
    PAYMENT_MANDATE_NAME: z.string().default("Prabhuji VIP Membership"),
    // The recurring-debit scheduler. Default OFF so no environment starts
    // debiting as a side effect of a deploy — it is turned on deliberately,
    // after a dry run.
    ENABLE_BILLING_SCHEDULER: boolFromString,
    // Escape hatch for an unresolved provider question: if Decentro's
    // `is_managed_by_decentro` turns out to mean THEY fire the pre-debit
    // notification and presentation, ours must stop — both firing is a double
    // charge. One env var instead of a code change.
    PAYMENT_MANDATE_MANAGED_BY_PROVIDER: boolFromString,
    // ---- Callbacks: acknowledge first, process after (TAM-260) ------------
    // Gateways whose webhooks are acked as soon as the `webhook_events` row
    // commits, then processed by the in-process callback worker. Every gateway
    // NOT listed keeps the inline path (process, then reply) byte for byte.
    //
    // THE DEFAULT IS EMPTY (`[]`): nothing is deferred, so every gateway —
    // Razorpay included — runs the inline path exactly as before TAM-260, and
    // MERGING THIS CHANGES NOTHING about how callbacks are handled. (The worker's
    // re-driver still starts in the API process, but with no deferred provider
    // it can only drain lease-expired `processing` rows, and inline processing
    // never creates any.) Turning deferral on later is a one-line code change
    // of `DEFAULT_DEFERRED_CALLBACK_PROVIDERS` (to `[PROVIDER.RAZORPAY]`) —
    // preferred, since Terraform sets nothing here and a bare apply from a
    // laptop strips two live secrets — or setting this var to `razorpay`.
    //
    // `""` is NOT "fall back to the default" here, unlike the secrets above:
    // it always means "none" (every gateway inline), so it stays the rollback
    // value even once the default is turned on. Absent and `""` both give `[]`
    // today.
    //
    // Validated against the registry like `--provider` in billing.ts: an
    // unknown name fails the boot, rather than silently deferring nothing while
    // everyone believes it is on (or the reverse).
    PAYMENT_CALLBACK_DEFERRED_PROVIDERS: deferredProviderList,
    // Rows the callback worker processes at once, per API task. Bounded well
    // under Prisma's pool so a backlog cannot starve request handlers.
    PAYMENT_CALLBACK_WORKER_CONCURRENCY: intFromEnv({ min: 1, max: 32, fallback: 4 }),
    // Claim lease. A `processing` row older than this is re-claimable (its
    // worker died). MUST exceed the slowest legitimate processing, or another
    // task re-claims a row that is still being processed. One Razorpay
    // `process` can chain several provider GETs (each up to 2 ×
    // RAZORPAY_TIMEOUT_MS) plus serial analytics POSTs (5 s each), so the
    // default is a generous 10 minutes and the floor is 30 s. The re-driver
    // also waits this long before taking a fresh `received` row off its own
    // kick (the worker's `redriveMinAgeMs`), so a kick lost to a crash or a
    // shutdown is picked up after about one lease — the billing sweep, every
    // 30 minutes, remains the backstop behind that.
    PAYMENT_CALLBACK_LEASE_MS: intFromEnv({ min: 30_000, max: 3_600_000, fallback: 600_000 }),
    // Re-driver poll period (an index-covered read on `webhook_events`).
    PAYMENT_CALLBACK_REDRIVE_INTERVAL_MS: intFromEnv({
      min: 1_000,
      max: 600_000,
      fallback: 15_000,
    }),
    // Claims a row may take before it is marked `failed` (the billing sweep
    // stays its backstop, as for any `failed` row).
    PAYMENT_CALLBACK_MAX_ATTEMPTS: intFromEnv({ min: 1, max: 100, fallback: 5 }),
    // Horoscope daily-content generation (core/horoscope). The KEY itself is the
    // switch: set OPENAI_API_KEY and generation is on; leave it unset and the
    // module behaves exactly as it does today (the daily endpoint 404s, no model
    // is called, no key is read) rather than erroring. No separate flag.
    OPENAI_API_KEY: optionalSecret(z.string().min(1)),
    // Calls go through our LiteLLM gateway rather than api.openai.com — same
    // OpenAI-compatible protocol (the SDK is unchanged), but the gateway owns
    // the upstream provider key, routing and spend limits. Overridable so a
    // developer can point straight at OpenAI, or at a local proxy.
    OPENAI_BASE_URL: z
      .string()
      .url()
      .default(
        "https://prod-litellm-deployment-config-48788246490.asia-south1.run.app"
      ),
    // Must name a model the gateway above has configured for this key, NOT an
    // arbitrary OpenAI model — the gateway 401s ("key not allowed to access
    // model") on anything else, so a stale default here is a hard outage rather
    // than a fallback. `gpt-5-nano` is what the current key can reach.
    //
    // Model quality in Marathi and Telugu is what should drive this, not price:
    // 12 calls a day is single-digit dollars a month at any tier. `gpt-5-nano`
    // is the cheapest tier and its Marathi/Telugu output is visibly weaker than
    // gpt-4o's — worth revisiting with the gateway owner if the content reads
    // poorly, since that is a gateway allow-list change, not a code change.
    OPENAI_MODEL: z.string().default("gpt-5-nano"),
    // Generous vs the Decentro default: one call returns eight sections in four
    // languages (~2.5k output tokens), which is far slower than a payment API.
    OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(60_000),
    // How long `/horoscope/daily` will wait on an in-flight generation before
    // giving up and returning "being prepared". Bounds the user's spinner, NOT
    // the generation itself — that continues in the background either way.
    HOROSCOPE_GENERATION_WAIT_MS: z.coerce.number().int().positive().max(30_000).default(10_000),
    // Kuldevta-khoj: the RAGFlow agent that parses six free-text lineage
    // answers into a structured profile JSON (core/kuldevta). Both optional,
    // same shape as OPENAI_API_KEY above — the KEY (or its absence) is the
    // switch, so the module never crash-loops the whole API at boot when
    // unset; the client throws a clear runtime error only when actually
    // called with no URL/key configured, which is a wiring bug at that point,
    // not a boot-time one.
    // Neither RAGFLOW_BASE_URL nor RAGFLOW_API_KEY is redeclared here: the
    // chatbot block above already declares both, and ONE RAGFlow deployment
    // serves both features. A second URL variable meant stage could have the
    // chatbot configured and kuldevta silently unconfigured — two names for
    // one thing, drifting apart on the next deploy.
  })
  .superRefine((env, ctx) => {
    // TAM-82: both-or-neither. Half-configured is always a mistake, and the two
    // ways it can fail are both bad: an email with no password can't create an
    // admin (silent no-op an operator would read as "the admin exists"), and a
    // password with no email is a secret in the environment doing nothing.
    // Fail the boot loudly — this is a config error, not a security decision.
    if (Boolean(env.ADMIN_BOOTSTRAP_EMAIL) !== Boolean(env.ADMIN_BOOTSTRAP_PASSWORD)) {
      ctx.addIssue({
        code: "custom",
        path: ["ADMIN_BOOTSTRAP_EMAIL"],
        message:
          "ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must be set together (or both left unset, which creates no admin)",
      });
    }
    // TAM-84 (ADR §A7 / risk A-R6): the media dev carve-out must be structurally
    // incapable of reaching a deployed environment. The image runs
    // NODE_ENV=production on BOTH stage and prod (services.tf hardcodes it), so
    // this one assertion covers both. Fail the boot loudly — an insecure media
    // contract in production is a security regression, not a config nicety.
    // NOTE: the ONLY media assertion here is on the FLAG, never on
    // MEDIA_PUBLIC_BASE_URL itself (TAM-83 handoff — asserting https on the base
    // would break `pnpm deploy:local`).
    if (env.MEDIA_ALLOW_INSECURE_URLS && env.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["MEDIA_ALLOW_INSECURE_URLS"],
        message:
          "MEDIA_ALLOW_INSECURE_URLS must not be true when NODE_ENV=production (it is a dev-only carve-out for floci http URLs and must never reach stage/prod)",
      });
    }
    // `POST /devtools/mark-pro` grants LIFETIME Pro to any phone number, and —
    // alone among every route in this codebase — carries no `authMiddleware`.
    // It is mounted only under ENABLE_DEV_TOOLS, and prod passes false today, so
    // the entire distance between "safe" and "an unauthenticated subscription
    // dispenser on a public ALB" is one boolean nobody is watching.
    //
    // PAYMENT_ENV is the right discriminator, not NODE_ENV: the image runs
    // NODE_ENV=production on stage too (see its own comment above), so NODE_ENV
    // cannot tell the two apart. This makes prod crash-loop loudly rather than
    // come up wide open, and costs stage nothing.
    if (env.ENABLE_DEV_TOOLS && env.PAYMENT_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["ENABLE_DEV_TOOLS"],
        message:
          'ENABLE_DEV_TOOLS must not be true when PAYMENT_ENV="production" — /devtools/mark-pro is an unauthenticated lifetime Pro grant',
      });
    }
    // Stage is internet-reachable too, so "anyone who knows a tester's phone
    // number can grant themselves Pro" is not an acceptable posture there
    // either. A shared token is weak auth, but it is the difference between
    // needing a secret and needing a URL.
    if (env.ENABLE_DEV_TOOLS && !env.DEVTOOLS_TOKEN) {
      ctx.addIssue({
        code: "custom",
        path: ["DEVTOOLS_TOKEN"],
        message:
          "DEVTOOLS_TOKEN is required when ENABLE_DEV_TOOLS=true — the devtools routes have no other authentication",
      });
    }
    // Neither stub adapter may reach a live environment. Both defaults are
    // `stub` on purpose — that is what makes local dev and the integration
    // suites runnable with no vendor credentials — but a default is exactly what
    // ships when an env root forgets to pass the variable, and the two failure
    // modes are severe and silent:
    //   * AUTH_OTP_PROVIDER=stub accepts the fixed OTP "1234" for EVERY phone
    //     number (core/otp/services/otp.config.ts) — a total auth bypass.
    //   * PAYMENT_PROVIDER=stub auto-approves mandates in memory, handing out
    //     Pro entitlements for free while collecting nothing.
    // Same shape and same reasoning as the MEDIA_ALLOW_INSECURE_URLS assertion
    // above: the image runs NODE_ENV=production on BOTH stage and prod, so this
    // pair covers every deployed environment. A deploy that forgets the wiring
    // now crash-loops loudly instead of coming up wide open.
    //
    // ALLOW_STUB_PROVIDERS_IN_PRODUCTION opts out — see its comment above; it
    // exists for `pnpm deploy:local` and is not wired into any deployed task.
    const stubsAllowed = env.ALLOW_STUB_PROVIDERS_IN_PRODUCTION;
    if (
      env.AUTH_OTP_PROVIDER === OTP_PROVIDER.STUB &&
      env.NODE_ENV === "production" &&
      !stubsAllowed
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_OTP_PROVIDER"],
        message:
          'must not be "stub" when NODE_ENV=production — the stub accepts one fixed OTP for every phone number. Set a real provider (e.g. msg91) and its credentials.',
      });
    }
    if (env.PAYMENT_PROVIDER === PROVIDER.STUB && env.NODE_ENV === "production" && !stubsAllowed) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENT_PROVIDER"],
        message:
          'must not be "stub" when NODE_ENV=production — the stub auto-approves mandates in memory and collects no money. Set a real gateway (e.g. cashfree) and its credentials.',
      });
    }
    // The ACTIVE provider's credentials are required together (see
    // PROVIDER_REQUIRED_KEYS). Data-driven so a new gateway adds a row, not a
    // branch.
    //
    // Only the active one, deliberately. A gateway that no longer takes new
    // registrations stays fully resolvable at runtime — its adapter is built
    // lazily on the first row that needs it — so its credentials are not a boot
    // requirement. Requiring them here would mean a gateway you have not set up
    // yet prevents the service from starting, and requiring them for a gateway
    // you HAVE set up adds a config step whose omission blocks a deploy. Either
    // way the loud failure lands in the wrong place: a missing credential for a
    // non-active gateway should cost that gateway's rows, logged at error, not
    // the whole process.
    const requiredKeys =
      PROVIDER_REQUIRED_KEYS[
        env.PAYMENT_PROVIDER as keyof typeof PROVIDER_REQUIRED_KEYS
      ] ?? [];
    for (const key of requiredKeys) {
      if (!env[key as keyof typeof env]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `required when PAYMENT_PROVIDER=${env.PAYMENT_PROVIDER}`,
        });
      }
    }
    // Same data-driven treatment for the OTP provider's credentials.
    const otpRequiredKeys =
      OTP_PROVIDER_REQUIRED_KEYS[
        env.AUTH_OTP_PROVIDER as keyof typeof OTP_PROVIDER_REQUIRED_KEYS
      ] ?? [];
    for (const key of otpRequiredKeys) {
      if (!env[key as keyof typeof env]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `required when AUTH_OTP_PROVIDER=${env.AUTH_OTP_PROVIDER}`,
        });
      }
    }
    // Test numbers without a code to accept would silently do nothing, and the
    // failure is invisible: the number gets a real random OTP sent to a handset
    // that does not exist, so the tester just sees "OTP never arrived". Fail the
    // boot instead. (The reverse — `TEST_OTP` with no numbers — is inert and
    // deliberately allowed, so the secret can be provisioned ahead of the list.)
    if (env.TEST_NUMBERS && env.TEST_NUMBERS.trim() !== "" && !env.TEST_OTP) {
      ctx.addIssue({
        code: "custom",
        path: ["TEST_OTP"],
        message: "required when TEST_NUMBERS is set",
      });
    }
    // Every real OTP provider REQUIRES Redis, for two independent reasons, and
    // this one assertion closes both:
    //   1. `LocalOtpProvider` keeps its session state (sessionId -> phone, the
    //      hashed OTP, the attempt count) in Redis. MSG91 keys everything by
    //      mobile number and has no notion of our otpSessionId, so that mapping
    //      is ours to keep and it must survive a restart and span workers.
    //   2. `RedisRateLimiter` silently NO-OPS when Redis is off (rate-limiter.ts)
    //      — which against a stub is harmless, but against a paid SMS gateway is
    //      an unmetered billable-SMS faucet on a public, unauthenticated route.
    // Fail the boot rather than come up in either state.
    if (env.AUTH_OTP_PROVIDER !== OTP_PROVIDER.STUB && !env.ENABLE_REDIS) {
      ctx.addIssue({
        code: "custom",
        path: ["ENABLE_REDIS"],
        message: `must be true when AUTH_OTP_PROVIDER=${env.AUTH_OTP_PROVIDER} (the OTP session store is Redis-backed and the rate limiter no-ops without it)`,
      });
    }
    if (env.AUTH_OTP_PROVIDER !== OTP_PROVIDER.STUB && !env.REDIS_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message: `required when AUTH_OTP_PROVIDER=${env.AUTH_OTP_PROVIDER}`,
      });
    }
    // Structurally prevent pointing a live-money environment at the sandbox
    // (silently no revenue) or a test environment at live money (real charges
    // to real people during QA). Both are one typo away without this.
    if (env.PAYMENT_ENV === "production" && env.DECENTRO_BASE_URL?.includes("staging.")) {
      ctx.addIssue({
        code: "custom",
        path: ["DECENTRO_BASE_URL"],
        message: "PAYMENT_ENV=production must not point at a staging Decentro host",
      });
    }
    if (env.PAYMENT_ENV === "staging" && env.DECENTRO_BASE_URL === "https://api.decentro.tech") {
      ctx.addIssue({
        code: "custom",
        path: ["DECENTRO_BASE_URL"],
        message: "PAYMENT_ENV=staging must not point at the live Decentro host",
      });
    }
    if (
      env.PAYMENT_ENV === "production" &&
      env.CASHFREE_BASE_URL?.includes("sandbox.cashfree.com")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["CASHFREE_BASE_URL"],
        message: "PAYMENT_ENV=production must not point at the Cashfree sandbox host",
      });
    }
    if (
      env.PAYMENT_ENV === "staging" &&
      env.CASHFREE_BASE_URL === "https://api.cashfree.com/pg"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["CASHFREE_BASE_URL"],
        message: "PAYMENT_ENV=staging must not point at the live Cashfree host",
      });
    }
    // Razorpay has NO separate sandbox host — `api.razorpay.com` serves both, and
    // the mode is decided entirely by the key prefix. So the same guard the two
    // gateways above get from their URL has to come from the credential here, or
    // a staging deploy holding a live key debits real people during QA with
    // nothing in the config looking wrong.
    if (env.PAYMENT_ENV === "production" && env.RAZORPAY_KEY_ID?.startsWith("rzp_test_")) {
      ctx.addIssue({
        code: "custom",
        path: ["RAZORPAY_KEY_ID"],
        message: "PAYMENT_ENV=production must not use a Razorpay test key (rzp_test_*)",
      });
    }
    if (env.PAYMENT_ENV === "staging" && env.RAZORPAY_KEY_ID?.startsWith("rzp_live_")) {
      ctx.addIssue({
        code: "custom",
        path: ["RAZORPAY_KEY_ID"],
        message: "PAYMENT_ENV=staging must not use a Razorpay live key (rzp_live_*) — it charges real people",
      });
    }
    // Both sides firing debits is a double charge on every renewal.
    if (env.ENABLE_BILLING_SCHEDULER && env.PAYMENT_MANDATE_MANAGED_BY_PROVIDER) {
      ctx.addIssue({
        code: "custom",
        path: ["ENABLE_BILLING_SCHEDULER"],
        message:
          "cannot be true while PAYMENT_MANDATE_MANAGED_BY_PROVIDER=true — both would present the same debit",
      });
    }
    if (env.ENABLE_KAFKA && !env.KAFKA_BROKERS) {
      ctx.addIssue({
        code: "custom",
        path: ["KAFKA_BROKERS"],
        message: "required when ENABLE_KAFKA=true",
      });
    }
    if (env.ENABLE_KAFKA && env.KAFKA_SASL === "aws-iam" && !env.AWS_REGION) {
      ctx.addIssue({
        code: "custom",
        path: ["AWS_REGION"],
        message: "required when KAFKA_SASL=aws-iam (to sign MSK IAM tokens)",
      });
    }
    if (env.ENABLE_TELEMETRY && !env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      ctx.addIssue({
        code: "custom",
        path: ["OTEL_EXPORTER_OTLP_ENDPOINT"],
        message: "required when ENABLE_TELEMETRY=true",
      });
    }
    if (env.ENABLE_TELEMETRY && !env.HYPERDX_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["HYPERDX_API_KEY"],
        message: "required when ENABLE_TELEMETRY=true (the HyperDX SDK skips init without it)",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
    );
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
