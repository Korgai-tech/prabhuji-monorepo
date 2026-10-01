-- TAM-143: move the live plan to ₹299/month with the ₹2 registration deposit,
-- and correct the copy that called it a free trial.
--
-- DATA, not schema — deliberately, and this is the only data migration in the
-- repo. The alternative was a manual post-deploy step, and the window it opens
-- is the problem: between the code deploy and the manual UPDATE, the paywall
-- advertises one price while the gateway registers another. Prisma applies this
-- in the same one-off ECS task that runs the schema migration, immediately
-- before the services roll, so the price and the code that charges it land
-- together.
--
-- NOT the seed. `prisma/seeds/paywall-config.seed.ts` carries the same values,
-- but the deploy pipeline never runs it (`prisma migrate deploy` only), and
-- running the full paywall seed against prod would re-assert every benefit,
-- label and config row — silently reverting anything edited through the CMS
-- since launch. This touches exactly the four rows that must change.
--
-- GUARDED ON THE OLD VALUES so it is idempotent and cannot clobber a later
-- price change: an environment already at ₹299 (a fresh DB seeded from the
-- updated seed file) matches nothing and this is a no-op. An empty database —
-- every integration test — likewise updates zero rows.
--
-- WHY THE COPY IS PART OF THIS. "1-day free trial" described a ₹0 registration
-- this plan no longer has. ₹2 is debited with the UPI PIN that authorises the
-- mandate, so the old wording would be a false statement about a charge, shown
-- on the screen where the user consents to it. It is not decoration and it does
-- not belong in a follow-up.
--
-- SAFE TO RUN NOW because prod holds zero mandates, zero subscriptions and zero
-- transactions (verified 2026-07-30). Nobody is mid-cycle at ₹5.

UPDATE "paywall_plans"
SET "amount_paise"           = 29900,
    "initial_deposit_paise"  = 200
WHERE "plan_id" = 'month'
  AND "amount_paise" = 500;

UPDATE "paywall_plan_translations" t
SET "trial_label"              = '1 day for ₹2',
    "display_price_text"       = '₹299 / month',
    "subscription_detail_text" = '₹2 today, then ₹299/month from tomorrow. Auto-renews monthly. Cancel anytime.'
FROM "paywall_plans" p
WHERE t."plan_id" = p."id"
  AND p."plan_id" = 'month'
  AND t."locale"  = 'en'
  AND t."display_price_text" = '₹5 / month';

UPDATE "paywall_plan_translations" t
SET "trial_label"              = '1 दिन ₹2 में',
    "display_price_text"       = '₹299 / महीना',
    "subscription_detail_text" = 'आज ₹2, फिर कल से ₹299/महीना। मासिक स्वतः नवीनीकरण। कभी भी रद्द करें।'
FROM "paywall_plans" p
WHERE t."plan_id" = p."id"
  AND p."plan_id" = 'month'
  AND t."locale"  = 'hi'
  AND t."display_price_text" = '₹5 / महीना';
