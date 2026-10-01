-- TAM-164: `pdn_notifications.scheduled_debit_at` becomes NULLABLE, and the
-- rows that only ever held its seed are emptied.
--
-- WHY. The column answers "the earliest instant this provider will accept a
-- presentation". It was NOT NULL and seeded at INSERT with the row's own
-- `cycle_date`, so "we never learned an instant" and "midnight" were the same
-- value and could not be told apart. `canPresentDebit` compensated by ignoring
-- anything at or before `cycle_date` — necessary, because a seed is UTC
-- midnight (05:30 IST) and honouring it would withhold the 00:00-05:30 slice of
-- NPCI's first execution window from every cycle whose status read never
-- reported a timestamp.
--
-- That filter is now wrong. Razorpay reports NO debit instant at all, so from
-- TAM-164 we synthesise one (`notification + presentationTatHours`). For a
-- mandate activated between 00:00 and 04:30 IST the synthesised instant lands
-- BEFORE the cycle date's UTC midnight, is discarded as if it were the seed,
-- and the debit is presented from 00:00 IST — hours after the notification
-- rather than the required turnaround, which Razorpay rejects. The rejection is
-- expensive: the order is spent, the retry budget burns, the cycle settles
-- failed, and NPCI auto-revokes a mandate whose FIRST debit fails.
--
-- NULLABILITY RATHER THAN A WIDER COMPARISON. Relaxing the `> cycle_date` test
-- in `canPresentDebit` would re-admit the seed as though it were a real
-- instant and reintroduce the 05:30 bug for every legacy row. Removing the
-- ambiguity at the source is the only change that fixes one without causing the
-- other: NULL now means "unknown", and every non-NULL value is REAL and is
-- enforced.
--
-- THE UPDATE IS NOT COSMETIC. Without it, existing rows keep a seed that the
-- code no longer filters, and the next presentation for each of them would be
-- withheld until 05:30 IST. Equality against `cycle_date` at UTC midnight is
-- exactly how `PdnService` wrote the seed (a JS `Date` at UTC midnight), so it
-- matches the seed and nothing else — a provider-supplied instant is a
-- wall-clock time and never lands on it.
--
-- SAFE ON A LIVE TABLE: dropping NOT NULL takes no table rewrite, and the
-- UPDATE touches only rows that carry no information.

ALTER TABLE "pdn_notifications"
    ALTER COLUMN "scheduled_debit_at" DROP NOT NULL;

UPDATE "pdn_notifications"
SET "scheduled_debit_at" = NULL
WHERE "scheduled_debit_at" = ("cycle_date"::timestamp AT TIME ZONE 'UTC');
