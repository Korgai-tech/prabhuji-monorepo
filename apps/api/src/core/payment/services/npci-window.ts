/**
 * NPCI timing rules for UPI Autopay execution.
 *
 * Pure functions over an absolute instant. Every one computes IST as explicit
 * UTC+5:30 arithmetic and NEVER reads the process timezone or uses `Intl` —
 * containers run UTC, developer laptops do not, and a rule that silently means
 * something different in the two places is how you debit at the wrong hour.
 *
 * These live in `services/` rather than `shared/` because they encode this
 * module's regulatory constraints, not a general date utility.
 */

/** IST is UTC+5:30 with no DST — a fixed offset, safe as arithmetic. */
const IST_OFFSET_MINUTES = 5 * 60 + 30;
const MINUTES_PER_DAY = 24 * 60;

/**
 * Non-peak execution windows, in IST minutes-from-midnight, as half-open
 * intervals `[start, end)`.
 *
 * Since 1 Aug 2025 NPCI bars autopay execution during peak hours to protect
 * UPI capacity. Encoded here rather than in the scheduler's cron expression
 * deliberately: the next revision of this rule should be a deploy, not a
 * `terraform apply`.
 */
const DEBIT_WINDOWS: readonly (readonly [number, number])[] = [
  [0, 10 * 60], //         00:00 – 10:00
  [13 * 60, 17 * 60], //   13:00 – 17:00
  [21 * 60 + 30, MINUTES_PER_DAY], // 21:30 – 24:00
];

/**
 * Pre-debit notifications are rejected in the last ten minutes of the day for
 * a T+1 debit — the provider's date arithmetic rolls over mid-request. Firing
 * one here silently loses the cycle, so we wait for midnight.
 */
const PDN_BLACKOUT_START = 23 * 60 + 50; // 23:50 IST

/** Minutes since IST midnight for an absolute instant. */
export function istMinutesOfDay(now: Date): number {
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcMinutes + IST_OFFSET_MINUTES) % MINUTES_PER_DAY;
}

/**
 * The IST calendar date of an instant, as a UTC-midnight `Date`.
 *
 * This is what `transactions.cycle_date` stores. A UTC-midnight Date maps
 * cleanly onto Postgres `DATE` with no timezone reinterpretation, and makes
 * the `(mandateId, cycleDate)` unique constraint mean "this billing day in
 * India" rather than "within 24h of some instant".
 */
export function istDateOnly(now: Date): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate()
    )
  );
}

/** Add whole days to an IST date-only value. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60_000);
}

/**
 * The same day-of-month one month on, clamped to the target month's length.
 *
 * 31 Jan + 1 month is 28 Feb, not 3 March. Overshooting would hand the user
 * days they didn't pay for and drift the billing anchor forward every short
 * month until it desynchronises from the mandate's `ruleValue`.
 */
export function addMonthClamped(date: Date, months = 1): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const lastDayOfTarget = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + months, Math.min(d, lastDayOfTarget)));
}

/**
 * The instant an IST calendar day ends, given that day as a `istDateOnly`
 * value — i.e. midnight IST at the START of the following day.
 *
 * The inverse trip matters more than it looks. `@db.Date` columns read back as
 * UTC midnight, so using one directly as a deadline ends the IST day 5h30m
 * early: a one-day trial granted at 14:00 IST against `startDate = tomorrow`
 * lapsed at 05:30 the next morning, having run about fifteen hours. Anything
 * comparing a stored cycle date against `now` wants this, not the raw value.
 */
export function istEndOfDay(dateOnly: Date): Date {
  return new Date(
    dateOnly.getTime() + (MINUTES_PER_DAY - IST_OFFSET_MINUTES) * 60_000
  );
}

/** Is `now` inside an NPCI non-peak execution window? */
export function isDebitWindowOpen(now: Date): boolean {
  const minute = istMinutesOfDay(now);
  return DEBIT_WINDOWS.some(([start, end]) => minute >= start && minute < end);
}

/** Is `now` inside the late-night PDN blackout? */
export function isPdnBlackout(now: Date): boolean {
  return istMinutesOfDay(now) >= PDN_BLACKOUT_START;
}

/**
 * Whether a debit for `cycleDate` may be presented at `now`.
 *
 * Presenting BEFORE the cycle date would charge early; the window check then
 * keeps us inside NPCI's permitted hours. Late is allowed — a debit that
 * missed its day should still be attempted rather than skipped.
 */
export function canPresentDebit(
  cycleDate: Date,
  now: Date,
  /**
   * The provider's own earliest-acceptable instant, when it told us one.
   *
   * NPCI's 24h notice runs from when the payer was NOTIFIED, not from midnight
   * of the debit day — so a notification raised at 17:10 makes the debit valid
   * from 17:10 the next day, not 00:00. Decentro reports that instant on the
   * notification status read; without honouring it we present from midnight and
   * collect `error_presentation_window_not_started` on every tick until the
   * clock catches up.
   *
   * EVERY NON-NULL VALUE COUNTS, and is honoured verbatim. It arrives one of
   * two ways: reported by the gateway (Decentro's `debit_date`), or synthesised
   * from `MandateProvider.presentationTatHours` for a gateway that reports none
   * (Razorpay). Both are real instants; neither is a placeholder.
   *
   * This used to read `notBefore > cycleDate && …`, because the column was
   * NOT NULL and seeded with the cycle date, so "never learned one" arrived
   * here as that seed rather than as null — and a seed is UTC midnight, i.e.
   * 05:30 IST, which honoured would withhold the 00:00–05:30 slice of NPCI's
   * first window from every such cycle. The filter did its job and also
   * swallowed genuine instants: a Razorpay mandate activated between 00:00 and
   * 04:30 IST synthesises a real `notify + TAT` that lands before the cycle
   * date's midnight, and discarding it presents hours early, which the gateway
   * rejects. TAM-164 made the column nullable so "unknown" is NULL, which is
   * what lets this trust what it is given rather than second-guess it. Do not
   * reintroduce a comparison against `cycleDate` here — the seed it defended
   * against no longer exists, and the comparison is what breaks the early
   * hours.
   *
   * It can only ever DELAY a presentation, never bring one forward — `cycleDate`
   * remains a hard floor, so a bad value cannot cause an early charge.
   */
  notBefore?: Date | null
): boolean {
  if (istDateOnly(now) < cycleDate) return false;
  if (notBefore && now < notBefore) return false;
  return isDebitWindowOpen(now);
}

/**
 * The default lead-time band, for callers with no gateway in hand.
 *
 * 24h is RBI's notice requirement and is common to every gateway. The 48h
 * ceiling is OURS, not a documented limit: scheduling further out widens the
 * window in which a plan change or a cancellation lands after the charge is
 * already registered.
 */
export const DEFAULT_PDN_LEAD_HOURS = { min: 24, max: 48 } as const;

/**
 * Whether a PDN for `cycleDate` may be sent at `now`.
 *
 * RBI mandates 24h of notice before every autopay debit, so the charge must be
 * registered with the gateway at least that far ahead — under Cashfree it is
 * the payer's bank/UPI app that delivers the notice, and it cannot do so for a
 * debit it has not been told about yet. Later than 24h and the debit is refused
 * outright.
 *
 * `leadHours` comes from the ROW'S OWN gateway
 * (`MandateProvider.pdnLeadHours`), because the ceiling is a vendor contract
 * and the vendors disagree: Decentro documents 24–48h, Cashfree publishes no
 * ceiling, and Razorpay debits roughly 25h after the notification is delivered
 * — so a notification raised 48h out is perfectly valid for the first two and
 * simply never becomes a debit on the third. A single hardcoded band silently
 * broke whichever gateway did not share it.
 *
 * The blackout and the execution windows stay global and are NOT parameterised:
 * those are NPCI rules, and a gateway does not get an opinion about them.
 *
 * The scheduler runs every 30 minutes, so even the narrowest band here is
 * sampled ten times — missing it takes real effort.
 */
export function canSendPreDebitNotification(
  cycleDate: Date,
  now: Date,
  leadHours: { min: number; max: number } = DEFAULT_PDN_LEAD_HOURS
): boolean {
  if (isPdnBlackout(now)) return false;
  const leadMs = cycleDate.getTime() - istDateOnly(now).getTime();
  const oneHour = 60 * 60_000;
  return (
    leadMs >= leadHours.min * oneHour && leadMs <= leadHours.max * oneHour
  );
}
