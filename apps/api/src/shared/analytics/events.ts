/**
 * SERVER-PRODUCED analytics event names — the whole list, in one file.
 *
 * These are the events `apps/api` emits through `events-client.ts`, as opposed
 * to the ones the Flutter app fires (those live in
 * `apps/mobile/lib/features/<module>/*_analytics.dart` and are catalogued in
 * `docs/ANALYTICS-MODULES.md`). Both land in the same ClickHouse table, which is
 * exactly why the `bk_` prefix exists — see the naming section below.
 *
 * They live in `shared/` rather than in any one module's constants because more
 * than one module emits now, and a module may not import another module's
 * internals (`apps/api/CLAUDE.md`). Grouped per producing module so each group
 * can keep its own "emits exactly this list, no more no less" test.
 *
 * Constants, never inline strings: a rename must not silently fork the schema
 * between the emitter and the query that reads it.
 */

/**
 * Every analytics event the PAYMENT module publishes to the warehouse (TAM-145).
 *
 * THE list — if a name is not here it is not emitted, and this file is the one
 * place to read to know what a dashboard can query. Shaped and sent by
 * `services/payment-analytics.service.ts`; wired at the transitions documented
 * in `docs/PAYMENT-FLOW.md` ("The same transitions, as analytics events").
 *
 * ## Naming: `bk_<module>_<event>`
 *
 * `bk_` marks the PRODUCER — these come from `apps/api`, not from a phone. The
 * warehouse holds both in one table, and without the prefix a server event and
 * the client event for the same moment (`paywall_pay_now_tapped` vs the mandate
 * it creates) are indistinguishable in a funnel: you cannot tell "the app thinks
 * this happened" from "the money system says it did".
 *
 * The second segment is the MODULE, and the split is not cosmetic. `payment`
 * events describe MONEY MOVING; `subscription` events describe ENTITLEMENT
 * CHANGING. They answer different questions, and the same instant can produce
 * one of each without them meaning the same thing: a failed renewal is one
 * `bk_subscription_failed` per ATTEMPT, but at most one `bk_subscription_past_due`
 * when dunning opens and one `bk_subscription_cancelled` when it finally gives up.
 * Counting churn off the money events would multiply it by the retry budget.
 *
 * Constants rather than inline strings for the same reason the Flutter app uses
 * its per-module `*Events` classes (`apps/mobile/lib/features/<module>/`): a
 * rename must not silently fork the schema between the emitter and the query.
 *
 * ## The property bag
 *
 * Every event below carries the same base keys, built in ONE place —
 * `standardProps` in the service — so they cannot drift between events:
 *
 *   plan_id · product_id · mandate_id · provider · payment_method ·
 *   payment_id (ours) · gateway_payment_id (theirs) · amount (rupees) ·
 *   amount_paise (exact integer) · currency · type · billing_cycle ·
 *   trial_start_date · trial_end_date · failure_code · failure_reason ·
 *   attempt_number
 *
 * Per-event extras (`payment_type`, `cycle_date`, `outcome`, `validity_end`, …)
 * are documented on each method there.
 *
 * ### `null` is NOT the same as "always present"
 *
 * An earlier version of this file promised the keys were *always present, null
 * rather than omitted*. **That was never true on the wire.** ClickHouse's JSON
 * type drops null-valued keys at ingest, so a property sent as `null` does not
 * exist on the stored row — verified in prod, where `is_first_payment` and
 * `trigger_module` were hardcoded `null` and appeared in 0 of 55 `bk_payment`
 * rows.
 *
 * The rule that replaces it: **do not send a key we cannot populate.** A key
 * absent everywhere is honest; a key the emitter believes it is sending and the
 * warehouse never stores is a query that silently returns nothing. Two former
 * offenders are gone for this reason — `trigger_module` (the paywall's trigger
 * never leaves the phone) and `upi_type` (the payer's UPI app is a client-only
 * fact; the mandate holds a masked VPA, which is not the same thing).
 *
 * `plan_id` is the plan CODE (`"month"`), never the `paywall_plans` uuid —
 * see the identifier rule at the top of `schema.prisma`.
 */
export const PAYMENT_ANALYTICS_EVENT = {
  // --- money movements -----------------------------------------------------
  // All carry `payment_type` — the row's `transactions.kind`, either
  // `initial_deposit` (the ₹2 registration charge) or `recurring_debit` (a
  // monthly cycle) — so one funnel covers both kinds without doubling the names.

  /** A debit is recorded and about to be attempted. The success-rate denominator. */
  PAYMENT_INITIATED: "bk_payment_initiated",
  /**
   * The money arrived. Carries the bank RRN and the NPCI id.
   *
   * NOT the revenue row — that is `PAYMENT_SUCCESS` below, which fires beside
   * this one. This is the narrower funnel step: "the debit settled". Renamed
   * from `bk_payment_success` (TAM-145 cutover) so that name could take the
   * consolidated meaning the analytics contract gives it.
   */
  PAYMENT_SETTLED: "bk_payment_settled",
  /**
   * ONE consolidated revenue record per payment that reached a TERMINAL state,
   * fired alongside the specific outcome event rather than instead of it.
   *
   * **It fires for FAILED charges too** — read `payment_status`, never the name.
   * That is the whole point: `type` + `payment_status` make one table answer
   * "what did we take, from trials or from subscriptions" without unioning
   * event names.
   *
   * A retry-scheduled failure is NOT terminal and does not appear here — that
   * cycle is still live, and counting it would report a loss the dunning run
   * may still recover.
   *
   * ⚠️ Renamed from `bk_payment` at the TAM-145 cutover. Rows named
   * `bk_payment_success` BEFORE that deploy are the old settled-only event
   * (now `bk_payment_settled`); rows after it are this. A dashboard wanting
   * continuous history unions `bk_payment` (before) with this (after).
   */
  PAYMENT_SUCCESS: "bk_payment_success",
  /**
   * A TRIAL charge did not arrive — the ₹2 registration deposit was declined,
   * or the mandate died before it could be taken.
   *
   * Replaces `bk_payment_failed` for `type === "trial"` (TAM-145 cutover).
   * Keeps that event's per-ATTEMPT `insert_id`: three retries of one cycle are
   * three rows, because collapsing them flattens the dunning curve.
   *
   * Two sources (TAM-188): the mandate died unapproved (`outcome: abandoned`,
   * `<deposit>:<retry>`), or the gateway declined a registration attempt while
   * the mandate stays pending (`outcome: declined`, `<deposit>:<gateway payment>`,
   * no consolidated `bk_payment_success` row). Razorpay never kills an unapproved
   * mandate, so only the second ever fires there.
   */
  TRIAL_FAILED: "bk_trial_failed",
  /**
   * A full-price charge did not arrive. `outcome` says whether anything
   * happens next (`retry_scheduled` · `cancelled` · `expired` · `abandoned`).
   *
   * Replaces `bk_payment_failed` for `type === "subscription"`, same per-attempt
   * `insert_id` scope. Note this is the MONEY view: a cycle that fails three
   * times is three of these but at most one `bk_subscription_cancelled`.
   */
  SUBSCRIPTION_FAILED: "bk_subscription_failed",

  // --- entitlement lifecycle ----------------------------------------------

  /** Mandate registered; the gateway has not been called yet. The funnel denominator. */
  SUBSCRIPTION_INITIATED: "bk_subscription_initiated",
  /**
   * Same moment as `bk_subscription_initiated`, trial signups only — the
   * server-side twin of the client's `trial_payment_initiated`. Fires
   * ALONGSIDE, not instead of, the generic event: the trial funnel needs a
   * denominator that survives the client never reporting (app killed at the
   * UPI handoff), and renaming the generic one would break every existing
   * `bk_subscription_initiated` query.
   */
  TRIAL_PAYMENT_INITIATED: "bk_trial_payment_initiated",
  /** Approved, with a trial running. Not revenue. */
  SUBSCRIPTION_TRIAL_STARTED: "bk_subscription_trial_started",
  /**
   * The same approval, reported with the MONEY attached: the registration
   * charge settled, the mandate is live, and the trial entitlement is granted.
   * Carries the deposit's ledger + gateway ids, which is what the client's
   * `trial_success` cannot fill in (it emits `payment_id: null`).
   */
  TRIAL_SUCCESS: "bk_trial_success",
  /**
   * The user paid full price for the FIRST TIME EVER. The revenue funnel's
   * numerator, and true at most once per user.
   *
   * Two ways it lands, split by `activation_source`: `direct_payment` (a
   * no-trial registration was approved, so the ₹299 settled at registration)
   * and `trial_conversion` (a trial mandate's debit settled). The second is why
   * this is keyed on money rather than on approval — a converting trial's
   * mandate went live weeks earlier at ₹2, so no approval-time hook can see the
   * moment it becomes revenue.
   *
   * `insert_id` is the USER, not the mandate: a mandate is per-consent, and
   * someone who re-registers after an NPCI revoke would otherwise mint a second
   * "first" payment. That is still true of the mandate-scoped
   * `is_first_payment` property, which answers the narrower "first on this
   * mandate" — do not use it for this question.
   *
   * The send side gates on the user's ledger, so duplicates are rare rather
   * than routine — but `events` is a plain MergeTree with NO dedupe, so any
   * that do occur (the approval self-heal re-polls) are stored. Read it with
   * `LIMIT 1 BY insert_id`, as every query against this table must.
   */
  SUBSCRIPTION_STARTED: "bk_subscription_started",
  /** Never approved — the link expired, or the user backed out. */
  SUBSCRIPTION_ABANDONED: "bk_subscription_abandoned",
  /**
   * A renewal settled; entitlement extended.
   *
   * A RECURRING cycle only — never the user's first full-price payment, which
   * reports as `bk_subscription_started` alone (TAM-163). On a trial that
   * excludes the day-3 conversion and includes every thirty-day cycle after it.
   */
  SUBSCRIPTION_RENEWED: "bk_subscription_renewed",
  /**
   * A debit failed and DUNNING BEGAN — the row moved to `past_due` and the user
   * stays entitled until `grace_until`.
   *
   * Fires beside `bk_subscription_failed`, not instead of it: that one is the
   * money view (one per attempt), this is the entitlement view (one per entry
   * into dunning). Emitted ONLY when the transition actually applied — the
   * subscription port returns the changed-row count so a guard-rejected no-op
   * does not produce a phantom dunning event.
   *
   * `dunning_stage` is `reminder_<retry_count>`; there is no dunning-stage
   * column, it is derived from the ledger row's `retryCount`. Note `grace_until`
   * SLIDES: it is recomputed as `now + 3 days` on every failure, so it is not
   * anchored to the first one.
   */
  SUBSCRIPTION_PAST_DUE: "bk_subscription_past_due",
  /**
   * THE USER COULD RECOVER THIS PAYMENT IF THEY KNEW ABOUT IT (TAM-186).
   *
   * Emitted only when a debit failed for `INSUFFICIENT_FUNDS` — the one class
   * where the user has the intent and simply had no money in the account at
   * that moment. 91% of production declines are this, and today the user finds
   * out by silently losing access.
   *
   * This is the TRIGGER for the payment-failure message, not a funnel metric:
   * the API owns the DECISION (who qualifies, and once per cycle), delivery is
   * owned downstream. That split is deliberate — it keeps the targeting rules
   * testable and regress-guarded in this repo rather than in external campaign
   * configuration.
   *
   * `insert_id` keys on (mandate, cycle date), so however many presentations a
   * cycle makes, one cycle can only ever ask for one message.
   */
  PAYMENT_RECOVERY_DUE: "bk_payment_recovery_due",
  /** Ended before full price was ever paid. */
  SUBSCRIPTION_TRIAL_CANCELLED: "bk_subscription_trial_cancelled",
  /** A paying subscriber left. */
  SUBSCRIPTION_CANCELLED: "bk_subscription_cancelled",
  /**
   * The user DELIBERATELY cancelled while still inside the trial window.
   *
   * Narrower than `bk_subscription_trial_cancelled`, which covers every way a
   * trial ends unconverted — including a first debit the bank declined, which
   * is not a decision anyone made. Both fire on a user cancel; only this one
   * answers "how many people chose to walk away during the free period".
   */
  TRIAL_CANCELLED: "bk_trial_cancelled",

  // --- debit attempt ledger (TAM-187) ---------------------------------------
  // One event on every EDGE of the recurring-debit lifecycle, so a
  // subscription's history reads as a trail rather than a pair of outcomes: a
  // cycle that stalls ("PDN accepted, debit never presented") is a query here
  // instead of a Postgres dig. Names are the cricsignal contract (KRUTYUG-308)
  // verbatim, so one warehouse query serves both products.
  //
  // Every one carries `source` — how we learned of the moment: `webhook` (a
  // gateway callback), `poll` (we asked the gateway), `scheduler` (the billing
  // task's own act) or `inline` (a user request). These are the STEPS; the
  // outcome events above are unchanged and still fire beside them.

  /** Checkout registered a mandate at the gateway. `insert_id`: the mandate. */
  MANDATE_CREATED: "bk_mandate_created",
  /**
   * A mandate's state actually changed — `previous_status` → `status`. Never
   * on a poll that read back the same state, including the self-heal re-apply.
   * `insert_id`: mandate + transition + the write's instant, so the same move
   * reported twice collapses but active → paused → active does not.
   */
  MANDATE_STATUS: "bk_mandate_status",
  /**
   * A debit date was written: a cycle claimed (`new_cycle`), the next one set
   * after a settlement (`next_cycle`), or a notification's presentation instant
   * moved by a delivery confirmation (`notification_delivered`) or the gateway's
   * own status read (`provider_reported`). Carries `scheduled_for` and, when it
   * moved, `previous_scheduled_for`.
   */
  PAYMENT_SCHEDULED: "bk_payment_scheduled",
  /** A pre-debit notification went out and the gateway answered the send. `insert_id`: the notification reference (rotated per send). */
  PDN_SENT: "bk_pdn_sent",
  /**
   * What became of a notification: `accepted` (a debit can be presented),
   * `awaiting_sequence_id`, `delivered`, `deferred` (too early to send),
   * `rearmed` (failed, another attempt budgeted) or `failed` (cycle written off).
   */
  PDN_STATUS: "bk_pdn_status",
  /**
   * A debit was presented to the gateway. `immediate_response` is what the
   * presentation call itself said: `succeeded` · `failed` · `pending` ·
   * `too_soon` · `error` (ambiguous — money may have moved).
   */
  PAYMENT_ATTEMPTED: "bk_payment_attempted",
  /**
   * A recurring debit reached a terminal answer — `payment_status` is
   * `success`, `failed` or `abandoned` (the mandate died before presentation).
   * `insert_id` is the ledger row + retry count: a first debit re-presents the
   * SAME row, and each of its answers is its own result.
   */
  PAYMENT_RESULT: "bk_payment_result",
  /**
   * The gateway refused a presentation as too early and the row went back to
   * `notified` for the next window. Only the gateway's refusal — NOT the
   * scheduler's own window check, which holds a row on every tick for up to a
   * day and would mint ~48 rows per debit.
   */
  PAYMENT_DEFERRED: "bk_payment_deferred",
  /**
   * A failed debit has another attempt coming. `retry_kind`: `next_window`
   * (same row, a later NPCI window today — `next_retry_at` absent) or
   * `next_day` (a fresh cycle tomorrow, `next_retry_at` set).
   */
  PAYMENT_RETRY_SCHEDULED: "bk_payment_retry_scheduled",
  /**
   * A gateway callback that resolved to one of OUR mandates was handled —
   * `outcome` is `processed` or `failed`. Duplicates and unknown references do
   * not emit: the latter are mostly a sibling app's mandates on the shared
   * Decentro consumer and have no user here to report against.
   */
  WEBHOOK_RECEIVED: "bk_webhook_received",
} as const;

export type PaymentAnalyticsEventName =
  (typeof PAYMENT_ANALYTICS_EVENT)[keyof typeof PAYMENT_ANALYTICS_EVENT];

/**
 * Events published by `core/subscription` itself, rather than by the payment
 * module on its behalf.
 *
 * Exactly one today, and it lives here rather than in `PAYMENT_ANALYTICS_EVENT`
 * for a structural reason: the expiry sweep is the ONLY entitlement transition
 * with no mandate in scope. It is a global `updateMany` over `subscriptions`,
 * it fires for users whose `mandates` row may be long dead, and `core/subscription`
 * cannot read `mandates` at all (modules never touch each other's tables).
 *
 * So this event deliberately carries a SUBSCRIPTION-ONLY property bag — no
 * `mandate_id`, no `provider`, no gateway ids:
 *
 *   subscription_id · plan_id (`active_plan_id`) · product_id · type ·
 *   status_before · expiry_reason · expiry_date · subscription_start_date ·
 *   trial_end_date · access_end_date · cycles_completed
 *
 * `expiry_reason` is the PRE-transition status, which is the only thing that
 * distinguishes the three ways a row lapses: `active` ran out of paid time,
 * `cancelled` was already ending and finally did, `past_due` exhausted dunning.
 */
export const SUBSCRIPTION_ANALYTICS_EVENT = {
  /** Entitlement lapsed — the sweep moved the row to `expired`. */
  SUBSCRIPTION_EXPIRED: "bk_subscription_expired",
} as const;

export type SubscriptionAnalyticsEventName =
  (typeof SUBSCRIPTION_ANALYTICS_EVENT)[keyof typeof SUBSCRIPTION_ANALYTICS_EVENT];

/**
 * `user_id` for events no end user caused.
 *
 * MUST BE A UUID. The warehouse's `saas_events.user_id` is a `UUID` column, and
 * ClickPipe rejects a row whose `user_id` does not parse — into
 * `saas_events_clickpipes_error`, silently, with no error at the producer or the
 * collector (both accept any string of 5+ chars). The feed-rotation event shipped
 * as `"system-feed-rotation"` and every one was dropped from the move to
 * `saas_events` (Aug 2026) until TAM-188.
 *
 * Reserved values in the nil-UUID range, which no generated user id (v4/v7) can
 * ever take. Add one per synthetic producer; never reuse a value.
 */
export const SYSTEM_ACTOR_ID = {
  FEED_ROTATION: "00000000-0000-0000-0000-000000000001",
} as const;

const SYSTEM_ACTOR_IDS: ReadonlySet<string> = new Set(Object.values(SYSTEM_ACTOR_ID));

/** True for a synthetic producer — there is no user or device behind it. */
export const isSystemActor = (userId: string): boolean => SYSTEM_ACTOR_IDS.has(userId);

/**
 * Events published by the FEED ROTATION path (TAM-150), `core/home`.
 *
 * Fired by the task that wins the plan-build lock at a refresh boundary, not by
 * any user action — so the wire `user_id` is `SYSTEM_ACTOR_ID.FEED_ROTATION`
 * (the collector drops identity-less events), and the `insert_id` is keyed on
 * the epoch so duplicate builds dedupe in the warehouse.
 *
 * Properties: `refresh_id` (the epoch), `refresh_time` (the boundary, ISO), and
 * `content_type_counts` (how many items each content type contributed).
 */
export const FEED_ANALYTICS_EVENT = {
  /** A scheduled feed refresh computed a new order. */
  REFRESH_TRIGGERED: "bk_feed_refresh_triggered",
} as const;

export type FeedAnalyticsEventName =
  (typeof FEED_ANALYTICS_EVENT)[keyof typeof FEED_ANALYTICS_EVENT];

/**
 * Events published by the OTP login path, `core/otp`.
 *
 * This one exists to be COMPARED, not just counted. The Flutter app already
 * fires `otp_verification_result` with the same four properties
 * (`apps/mobile/lib/features/onboarding/onboarding_analytics.dart`), so the two
 * describe the same moment from opposite ends of the wire — which is precisely
 * the gap the `bk_` prefix was introduced to make visible. A verify the server
 * answered but the client never reported (app killed, radio dropped, request
 * timed out on the handset) appears here and nowhere else, and that difference
 * IS the measurement: the client series tells you what users saw, this one
 * tells you what actually happened.
 *
 * Properties, mirroring the client's keys 1:1 so a funnel can union the two,
 * plus `phone_number` (server-only — the client never sends it):
 *
 *   result · error_code · attempt_number · response_time_ms · phone_number
 *
 * `result` is `success` or `failure` and nothing else. The client's vocabulary
 * also has `pending` and `cancelled`, which describe states only a UI can be in
 * — a user backing out of the screen, a request still in flight. The server sees
 * one verify call resolve exactly one way, so emitting either would be a value
 * no query could ever match.
 */
/**
 * A SHARED CONTRACT, not just a name. audience-campaign runs a dedicated
 * consumer group that matches this exact string off the raw hub and projects
 * `event_properties.fcm_token` / `phone_number` into its `user_profiles`
 * table — the table push delivery reads a device token from. Any other
 * spelling is silently skipped there as `not-profile-event`.
 *
 * The consumer's constant lives at
 * monorepo-saas/services/audience-campaign/src/modules/profiles/profile.processor.ts
 * (`USER_PROFILE_EVENT`), documented in that service's docs/event-contracts.md.
 * Change one, change both; nothing detects the drift.
 */
export const PROFILE_ANALYTICS_EVENT = {
  USER_PROFILE_UPDATE: "bk_user_profile_update",
} as const;
export type ProfileAnalyticsEventName =
  (typeof PROFILE_ANALYTICS_EVENT)[keyof typeof PROFILE_ANALYTICS_EVENT];

export const OTP_ANALYTICS_EVENT = {
  /** A verify attempt resolved — the server's account of it. */
  VERIFICATION_RESULT: "bk_otp_verification_result",
  /**
   * A phone account came into existence — this verify was the one that stamped
   * `phoneVerifiedAt`. Fires beside the verification result, never instead.
   *
   * The exception to `bk_<module>_<event>` in this group, and named by the
   * analytics contract rather than by us: an account is not an OTP concept even
   * though the OTP path is where one is born.
   *
   * ⚠️ `account_created_at` is `User.createdAt`, which since TAM-154 is the OTP
   * **send** moment, not this one — the row is INSERTed when the code goes out,
   * so a lead who never verifies already has a row and a `createdAt`. That is
   * why the two differ by minutes, and why the EVENT time is left to default to
   * now instead of being backdated to the column: the account became real here.
   *
   * `bucket_id` is the user's position in the shared abtesting service's bucket
   * space (`GET /bucket-space/subject/:id`) — a pure function of the user id, so
   * the same number holds for that user across every experiment that ever runs,
   * including ones that did not exist when this row was written. Always present;
   * `null` when the service is unconfigured or could not be reached.
   */
  ACCOUNT_CREATED: "bk_account_created",
} as const;

export type OtpAnalyticsEventName =
  (typeof OTP_ANALYTICS_EVENT)[keyof typeof OTP_ANALYTICS_EVENT];

/**
 * Which campaign a user came from, reported at the four moments that matter.
 *
 * All four carry the SAME shape — a `<moment>_utm_source|medium|campaign`
 * triple — read from one upstream row (the referral service's newest touch for
 * that user) at four different times. They are not four data sources; they are
 * four snapshots, and the prefix is the only thing that differs.
 *
 * The names break `bk_<module>_<event>`: they are named by the analytics
 * contract, ported verbatim from crickmate so one warehouse query serves both
 * products.
 *
 * Their group is `utm` rather than `otp` or `payment` because no module owns
 * attribution — the capture pair fires from the login path and the purchase pair
 * from the money path, off the same read.
 */
export const UTM_ANALYTICS_EVENT = {
  /**
   * The user's first campaign, reported exactly once ever.
   *
   * Guarded by `User.firstUtmReportedAt`, not by comparing values: the upstream
   * `/latest` route returns ONE row and carries no id for the user's oldest
   * touch, so "is this their first?" cannot be answered from the response. The
   * column is the answer, and it is stamped in the same breath as the emit.
   *
   * ⚠️ This therefore means "the earliest campaign WE observed", which is the
   * user's true first touch only for users whose first login happens after this
   * shipped. Backfill is impossible — the history lives upstream in rows
   * `/latest` will not return.
   */
  FIRST: "bk_first_utm_source_success",
  /** The newest campaign, re-reported at every capture moment. */
  LATEST: "bk_latest_utm_source_success",
  /** The campaign standing when the trial was bought. */
  TRIAL: "bk_trial_utm_source_success",
  /**
   * The campaign standing at the user's first full-price payment.
   *
   * Rides inside `trackSubscriptionStarted`, AFTER its
   * `isFirstFullPricePayment` return — so it inherits that gate by construction
   * and cannot drift from `bk_subscription_started`. Never a renewal.
   */
  SUB: "bk_sub_utm_source_success",
} as const;

export type UtmAnalyticsEventName =
  (typeof UTM_ANALYTICS_EVENT)[keyof typeof UTM_ANALYTICS_EVENT];
