# Razorpay UPI Autopay — prerequisites and rollout

The operational half of the Razorpay integration: what must be true at Razorpay
and in config **before** anyone flips the switch, the cutover sequence, and the
rollback. How the adapter works and why is `docs/PAYMENT-FLOW.md`; how to add a
gateway at all is `apps/api/src/core/payment/add_new_gateway.md`.

> The design record — decisions, the nine defects found in review, and the
> reasoning behind each — is `specs/TAM-151-razorpay-upi-autopay-plan.md`.
> **`specs/` is gitignored** (`.gitignore:82`), so that file is local-only. This
> document deliberately repeats everything operationally load-bearing so the
> rollout does not depend on an untracked file.

---

## 1. Prerequisites — none of these are code, all of them block

| # | Prerequisite | Why it blocks | Owner |
|---|---|---|---|
| P1 | **`save_vpa` enabled on the Razorpay account.** This is a support request, not a dashboard toggle. | Razorpay does not return UPI tokens at all without it. `getMandateStatus` discovers the approved token by listing the customer's tokens, so with `save_vpa` off that list is **permanently empty and no mandate can ever activate** — the deposit is taken and the user stays behind the paywall. | Razorpay support |
| P2 | **Webhook endpoint registered** at `POST https://<host>/payment/callbacks/razorpay`, with a signing secret. | The secret is mandatory in `PROVIDER_REQUIRED_KEYS`, so once Razorpay is the active provider the boot fails without it; before that the endpoint exists but has nothing to verify against and 401s every delivery. Note the path segment is **case-sensitive** — a URL registered as `/callbacks/Razorpay` names no registered gateway, so every delivery is acked into the void (logged as `callback_unknown_provider`). | ops |
| P3 | **Webhook events subscribed**: `token.confirmed`, `token.rejected`, `token.cancelled`, `token.paused`, `payment.authorized`, `payment.captured`, `payment.failed`, `order.notification.delivered`, `order.notification.failed`. | Anything unsubscribed simply never arrives; the sweep still reconciles by polling, but settlement is delayed to the 2-hour straggler window instead of seconds. | ops |
| P4 | **MCC classification confirmed.** Decides whether the AFA-free debit ceiling is ₹15,000 or ₹1,00,000. | Above the ceiling the payer gets a collect request and must enter a UPI PIN, so an unattended cron debit does not complete. Caps any future price rise. | finance + Razorpay |
| P5 | **The UPI debit window confirmed in writing.** Razorpay documents a 36h05m ceiling on its **cards** page and on no UPI page; the UPI floor is ~25h after notification delivery. | Since TAM-164 we ship `pdnLeadHours = {24, 48}` plus a **synthesised presentation instant** (`RAZORPAY_PRESENTATION_TAT_HOURS = 25`), so the turnaround is enforced on the instant rather than approximated by a whole-day lead. **A 36h05m ceiling is no longer a threat to the band** — a 24h lead sits under it either way. What is still unconfirmed is the FLOOR, which is what that constant encodes: at 25h a one-day trial converts on D+1 for activations before 23:00 IST, at 30h before 18:00, at 36h before 12:00, and at 48h not at all. Being wrong HIGH only delays a debit; being wrong LOW spends the order, burns the retry budget and gets the mandate revoked by NPCI. | Razorpay support |
| P6 | **Every purchasable plan's trial clears the active gateway's `pdnLeadHours.min` in whole days.** The live plan is **1 day** (TAM-164), which clears Razorpay's floor of 24h — but ONLY since that ticket. | A trial shorter than the floor can never be billed. This is refused at registration with `409 PLAN_NOT_PURCHASABLE` (log `plan_trial_shorter_than_pdn_lead`) rather than failing silently — but a rejected purchase is still a broken paywall, so fix the plan data first. `paywall_plans` is admin-editable, so this is a live foot-gun, not a one-time check. | ops |
| P7 | **Test vs live keys match `PAYMENT_ENV`.** | Razorpay has no separate sandbox host — `api.razorpay.com` serves both and the mode is decided entirely by the `rzp_test_` / `rzp_live_` key prefix. The env schema enforces the match and fails the boot on a mismatch, which is the only guard available (the other gateways get it from their base URL). | ops |

---

## 2. Configuration

**One variable.** `PAYMENT_PROVIDER` names the gateway **new mandates register
on**, exactly one, and nothing else. There is no enabled-set companion to keep in
step: every gateway in the registry is resolvable, its adapter built lazily on
the first row that needs it, and each subscriber's gateway is already recorded in
`mandates.provider`.

| Variable | Meaning |
|---|---|
| `PAYMENT_PROVIDER` | The gateway **new mandates register on**. Exactly one of `stub \| decentro \| cashfree \| razorpay`. |

What still matters is **credentials**: `RAZORPAY_BASE_URL`, `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (all four required together),
`RAZORPAY_TIMEOUT_MS` (defaulted). Terraform vars exist and are **inert** until
values are supplied.

They are a boot requirement only while Razorpay is the ACTIVE provider —
deliberately, because a client reads its credentials on construction, and
requiring every gateway's set at boot would mean "we have not set up Razorpay
yet" stops the service starting. While Razorpay is not active, a missing
credential costs Razorpay's rows: logged at error, that row skipped, every other
gateway's billing untouched. Supply them before the flip anyway — that is what
step 1 below is for, and it is what keeps Razorpay's own mandates billable after
any rollback.

---

## 3. Rollout

Each step is independently reversible. Do not compress them.

1. **Deploy with the Razorpay credentials present and `PAYMENT_PROVIDER` still
   `decentro`.** Razorpay is resolvable and its webhook endpoint is live, but it
   registers nothing. Existing billing is untouched. Confirm the boot log
   `payment_module_initialised` — `provider: decentro`, with `razorpay` among
   `resolvable_providers` (it always is; that field is the registry, so what the
   deploy actually has to get right is the credentials).
2. **Hand-run the billing task with `--dry-run`** and read the report. This
   proves the mixed-provider sweep resolves each row against its own gateway
   using production data, before anything is armed. A dry run bypasses both the
   kill switch and the lock, so it is safe alongside a live run.
3. **Register ONE internal Razorpay mandate end to end**: link → approve → ₹2
   authorization → activation → PDN order → debit → settle. This is the step
   that closes P1 and the open questions below. Verify:
   - the mandate reaches `active` (this exercises the token-list discovery path,
     which is the only route to activation);
   - `payment_provider_api_logs` has a row for every leg;
   - `webhook_events` has rows for the deliveries that arrived;
   - `transactions.provider = 'razorpay'` on the ledger rows.
4. **Flip `PAYMENT_PROVIDER=razorpay`.** New users get Razorpay. Every existing
   Decentro mandate keeps debiting on Decentro — that is what the per-row
   resolution guarantees.
5. **Watch one full cycle** before declaring done: `billing_cycle_complete`,
   `notification_recovery_deferred` (error), `cyclesSuperseded`,
   `callback_unknown_provider` (error — should be zero).

**Rollback is one environment variable** — `PAYMENT_PROVIDER=decentro` — with no
companion step, and it is safe at any point, because no existing mandate is ever
moved between gateways. Razorpay mandates registered in the meantime keep being
debited through Razorpay: nothing has to declare that, it is what their own
`mandates.provider` says. Just do not strip the Razorpay credentials on the way
out — those rows still need them.

---

## 4. What to watch, and what it means

| Signal | Level | Means |
|---|---|---|
| `callback_unknown_provider` | error | A delivery named a `:provider` that is in no registry — a mis-registered URL or a gateway this build does not have, not a missing config entry. The bodies are persisted under `webhook_events.kind = 'unroutable'` and can be replayed once the URL is fixed. |
| `razorpay_no_recurring_token_yet` | info | Normal before approval. **Sustained** across many mandates means P1 (`save_vpa`) is not actually enabled. |
| `plan_trial_shorter_than_pdn_lead` | error | P6 was missed; a plan is unpurchasable on the active gateway. |
| `billing_invalid_provider_filter` | error | A `--provider` typo. The run exits 1 rather than sweeping nothing and reporting success. |
| `skippedOutsideWindow` climbing with `pdnSent` at zero | — | The lead band is not matching. On Razorpay this is the P5 shape. |
| `notification_recovery_deferred` | error | A stranded cycle. Needs a human if it repeats for the same mandate. |

---

## 5. Known limitations, accepted for now

- **Razorpay is adopt-or-defer only** in recovery, like Cashfree. A
  list-by-receipt returning empty is not treated as definitive, because it is
  indistinguishable from index lag and re-claiming a cycle whose order exists
  would be a second charge. A genuinely stranded cycle stays visible in the logs
  rather than being auto-superseded.
- **Intra-cycle retry on Razorpay is expected to be loud, not silent.**
  Re-presenting a spent `order_id` should be rejected; that burns the retry
  budget and settles the cycle failed, and the next cycle proceeds normally. See
  the plan's R1 for why the alternative design was removed.
- **`contact` on `POST /v1/payments/create/recurring`** is sent from the
  customer record Razorpay already holds. If that read fails AND the field is
  mandatory, the debit is left `submitted` and stuck. Unverified — see open
  questions.

---

## 6. Open questions — close these during step 3

P1, P4 and P5 above are the blocking ones. Two more, neither blocking correctness
of the current design:

- ~~Does Razorpay echo an order's `notes` onto the payment entity in `payment.*`
  webhooks?~~ **Moot since TAM-168 (5 Sep 2026):** the recurring-payment call now
  sends the payment's own `notes` (reference id, application tag, cycle date, attempt
  number), so settlement webhooks carry the reference whether or not the order's
  notes are inherited. Activation never depended on it (that runs off our poll).
- Is `contact` genuinely mandatory on the recurring-payment call? If yes, add an
  optional `payer` to `PresentDebitInput`.
