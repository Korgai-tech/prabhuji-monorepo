-- Update the `refund_policy_text` copy on `paywall_translations` from the
-- initial "Full refund within 7 days" (and its Hindi rendering) to the shorter
-- "Refund policy" label the paywall now shows next to the linked policy page.
--
-- Why a migration and not just a seed edit: `apps/api/src/index.ts` has the
-- boot-time seeder commented out since cf803ff (2026-07-20), so the seed only
-- runs on-demand via `pnpm --filter api run seed:paywall`. Migrations, by
-- contrast, are applied automatically as a one-off ECS task before each
-- service roll (see `docs/DEPLOYMENT.md`) — so stage + prod pick this up
-- deterministically on the next deploy without a manual step. The seed file
-- itself is updated in the same change so a fresh clone matches.
--
-- Scoped to the exact old copy per locale so re-running (or applying against
-- a DB an operator has already hand-edited) is a no-op — nothing else is
-- overwritten.

UPDATE "paywall_translations"
SET "refund_policy_text" = 'Refund policy'
WHERE "locale" = 'en'
  AND "refund_policy_text" = 'Full refund within 7 days';

UPDATE "paywall_translations"
SET "refund_policy_text" = 'रिफंड पॉलिसी'
WHERE "locale" = 'hi'
  AND "refund_policy_text" = '7 दिनों के भीतर पूरा रिफंड';
