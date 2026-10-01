-- TAM-164: the monthly plan's trial goes from 3 days to 1 — the first full-price
-- debit moves from D+3 to D+1 — and the copy that states the length follows it.
--
-- DATA, not schema, and the second such migration in the repo after
-- 20260730190000_price_plan_at_299. Same reasoning as that one: the alternative
-- is a manual post-deploy UPDATE, and the window it opens is the problem. The
-- paywall would advertise one trial length while `createMandate` computed a
-- first-debit date from another, and every mandate registered in between would
-- carry a `trial_ends_at` that contradicts the screen the user consented on.
-- Prisma applies this in the same one-off ECS task as the schema migrations,
-- immediately before the services roll, so the number and the code that reads it
-- land together.
--
-- NOT THE SEED. `prisma/seeds/paywall-config.seed.ts` carries the same values and
-- is updated alongside this, but the deploy pipeline runs `prisma migrate deploy`
-- only. Running the full paywall seed against prod would re-assert every benefit,
-- label and config row and silently revert anything edited through the CMS. This
-- touches exactly the rows that must change.
--
-- GUARDED ON THE OLD VALUES, so it is idempotent and cannot clobber a later
-- change. An environment already at 1 day matches nothing and this is a no-op;
-- so is an empty database, which is every integration test.
--
-- WHY THE COPY IS PART OF THIS AND NOT A FOLLOW-UP. `trial_label` and
-- `subscription_detail_text` STATE THE LENGTH ("3 days for ₹2"). Shipping the
-- number without them would leave the paywall making a false statement about
-- when a real ₹299 debit happens, on the screen where the user authorises it.
-- That is not decoration.
--
-- ⚠️ THE GATEWAY MATTERS. A one-day trial puts the first cycle 24h out, which is
-- at the FLOOR of every gateway's notification lead band. It is billable on
-- Decentro (24h floor) and, since TAM-164, on Razorpay ({24,48} plus a
-- synthesised presentation instant). A gateway declaring a floor above 24h
-- refuses these plans outright at registration with PLAN_NOT_PURCHASABLE
-- (`plan_trial_shorter_than_pdn_lead`) rather than selling something it can
-- never bill — loud by design, but it is a dead paywall. Re-check
-- `pdnLeadHours` before switching PAYMENT_PROVIDER while this value is 1.

UPDATE "paywall_plans"
SET "trial_days" = 1
WHERE "plan_id" = 'month'
  AND "trial_days" = 3;

UPDATE "paywall_plan_translations" t
SET "trial_label"              = '1 day for ₹2',
    "subscription_detail_text" = 'for 1 day, then ₹299/month'
FROM "paywall_plans" p
WHERE t."plan_id" = p."id"
  AND p."plan_id" = 'month'
  AND t."locale"  = 'en'
  AND t."trial_label" = '3 days for ₹2';

UPDATE "paywall_plan_translations" t
SET "trial_label"              = '1 दिन ₹2 में',
    "subscription_detail_text" = '1 दिन के लिए, फिर ₹299/महीना'
FROM "paywall_plans" p
WHERE t."plan_id" = p."id"
  AND p."plan_id" = 'month'
  AND t."locale"  = 'hi'
  AND t."trial_label" = '3 दिन ₹2 में';
