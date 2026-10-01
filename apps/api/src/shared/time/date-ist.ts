/**
 * IST civil-date resolver. Shared because more than one module keys on the
 * civil date in `Asia/Kolkata` rather than the server's UTC date: horoscope's
 * `daily_horoscope_result.date_ist` (TAM-73) and the per-day modal cap
 * (TAM-174). A request at 23:30 UTC is already "tomorrow" in IST (UTC+5:30), so
 * keying off `new Date()`'s UTC date would serve the wrong day near midnight.
 *
 * Lives in `shared/` rather than in either module because `pnpm
 * check:arch-boundaries` forbids one module importing another's internals, and
 * a second copy is how the two modules' day boundaries drift apart.
 *
 * India observes no DST, so IST is a fixed +5:30 offset, but we still resolve
 * via `Intl` with an explicit `timeZone` so the logic is correct-by-construction
 * and survives any future tz change. Returns a stable `YYYY-MM-DD` string.
 */

const IST_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The `YYYY-MM-DD` civil date in Asia/Kolkata for `at` (defaults to now). */
export function resolveDateIst(at: Date = new Date()): string {
  // en-CA formats as `YYYY-MM-DD`.
  return IST_FORMATTER.format(at);
}
