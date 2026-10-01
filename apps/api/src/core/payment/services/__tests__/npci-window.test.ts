import { describe, expect, test } from "vitest";
import {
  addDays,
  addMonthClamped,
  canPresentDebit,
  canSendPreDebitNotification,
  isDebitWindowOpen,
  isPdnBlackout,
  istDateOnly,
  istEndOfDay,
  istMinutesOfDay,
} from "../npci-window.js";
import { PDN_ACTIVATION_DELAY_MS } from "../billing-cycle.service.js";

/**
 * The highest-value tests in the payment module.
 *
 * Everything here decides WHEN real money moves. A boundary that is off by an
 * hour debits users inside NPCI's peak window (rejected, cycle lost); one that
 * silently reads the process timezone works on a developer laptop and fails in
 * a UTC container, which is the worst possible failure shape.
 *
 * Every case is expressed as an IST wall-clock time converted to its UTC
 * instant, so the intent is readable and the arithmetic is exercised.
 */

/** IST wall-clock → the absolute instant, on 2026-07-21 unless stated. */
function ist(hhmm: string, day = 21): Date {
  const [h, m] = hhmm.split(":").map(Number);
  // IST is UTC+5:30, so subtract the offset to get UTC.
  return new Date(Date.UTC(2026, 6, day, h, m) - (5 * 60 + 30) * 60_000);
}

const D = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe("istMinutesOfDay", () => {
  test.each([
    ["00:00", 0],
    ["05:30", 330],
    ["09:59", 599],
    ["23:59", 1439],
  ])("IST %s → %i minutes", (time, expected) => {
    expect(istMinutesOfDay(ist(time))).toBe(expected);
  });

  test("wraps correctly across the UTC day boundary", () => {
    // 02:00 IST is 20:30 UTC the PREVIOUS day — the case naive arithmetic
    // gets wrong, landing on a negative minute or the wrong window.
    const instant = new Date("2026-07-20T20:30:00.000Z");
    expect(istMinutesOfDay(instant)).toBe(2 * 60);
  });
});

describe("isDebitWindowOpen — NPCI non-peak hours", () => {
  test.each([
    // window 1: 00:00–10:00
    ["00:00", true],
    ["09:59", true],
    ["10:00", false], // exclusive upper bound — peak starts
    ["12:59", false],
    // window 2: 13:00–17:00
    ["13:00", true], // inclusive lower bound
    ["16:59", true],
    ["17:00", false],
    ["21:29", false],
    // window 3: 21:30–24:00
    ["21:30", true],
    ["23:59", true],
  ])("IST %s → open=%s", (time, expected) => {
    expect(isDebitWindowOpen(ist(time))).toBe(expected);
  });
});

describe("isPdnBlackout", () => {
  test.each([
    ["23:49", false],
    ["23:50", true],
    ["23:59", true],
    ["00:00", false],
  ])("IST %s → blackout=%s", (time, expected) => {
    expect(isPdnBlackout(ist(time))).toBe(expected);
  });
});

describe("timezone independence", () => {
  // The rules are absolute-instant functions, so the same instant must yield
  // the same answer no matter what TZ the process runs under. Containers are
  // UTC; laptops are not. This asserts the property directly rather than
  // trusting that no `Intl`/local-getter crept in.
  const instant = ist("13:30");

  test("verdict does not depend on process.env.TZ", () => {
    const original = process.env.TZ;
    const verdicts: boolean[] = [];
    try {
      for (const tz of ["UTC", "America/New_York", "Asia/Kolkata", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        verdicts.push(isDebitWindowOpen(instant));
      }
    } finally {
      process.env.TZ = original;
    }
    expect(new Set(verdicts).size).toBe(1);
    expect(verdicts[0]).toBe(true);
  });
});

describe("istDateOnly", () => {
  test("late-evening UTC already belongs to the NEXT IST day", () => {
    // 19:00 UTC on the 20th is 00:30 IST on the 21st. Getting this wrong
    // makes the billing cycle claim the wrong date and either double-charge
    // or skip a day.
    expect(istDateOnly(new Date("2026-07-20T19:00:00.000Z"))).toEqual(
      D("2026-07-21")
    );
  });

  test("early UTC is still the same IST day", () => {
    expect(istDateOnly(new Date("2026-07-21T00:30:00.000Z"))).toEqual(
      D("2026-07-21")
    );
  });

  test("returns UTC midnight so it maps cleanly onto a Postgres DATE", () => {
    const d = istDateOnly(ist("15:45"));
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });
});

/**
 * The trial deadline depends entirely on this. A stored cycle date used AS a
 * deadline ends the IST day at 05:30 IST — which is how a "1 day" trial granted
 * at 14:00 IST expired the next morning having run about fifteen hours.
 */
describe("istEndOfDay", () => {
  test("an IST day ends at 18:30 UTC, not at its own UTC midnight", () => {
    expect(istEndOfDay(D("2026-08-01")).toISOString()).toBe(
      "2026-08-01T18:30:00.000Z"
    );
  });

  test("it is strictly LATER than the raw date-only value", () => {
    // The whole bug in one assertion: the raw value is 5h30m early.
    const cycle = D("2026-08-01");
    expect(istEndOfDay(cycle).getTime()).toBeGreaterThan(cycle.getTime());
    expect(istEndOfDay(cycle).getTime() - cycle.getTime()).toBe(
      18.5 * 60 * 60_000
    );
  });

  test("it is exactly the start of the next IST day", () => {
    // So a deadline set here and a cycle claimed for the following day cannot
    // leave an unentitled gap between them.
    const endOfFirst = istEndOfDay(D("2026-08-01"));
    expect(istDateOnly(new Date(endOfFirst.getTime() + 1))).toEqual(
      D("2026-08-02")
    );
  });

  test("a trial granted late in the IST day still runs past 24h", () => {
    // 2026-07-29T12:00Z is 17:30 IST. With trialDays=1 the cycle is the 30th.
    const grantedAt = new Date("2026-07-29T12:00:00.000Z");
    const deadline = istEndOfDay(addDays(istDateOnly(grantedAt), 1));
    expect(deadline.getTime() - grantedAt.getTime()).toBeGreaterThan(
      24 * 60 * 60_000
    );
  });
});

describe("addMonthClamped — billing anchor stability", () => {
  test.each([
    ["2026-01-31", "2026-02-28"], // clamps into a short month
    ["2028-01-31", "2028-02-29"], // leap year
    ["2026-01-30", "2026-02-28"],
    ["2026-03-31", "2026-04-30"],
    ["2026-07-21", "2026-08-21"], // the ordinary case
    ["2026-12-15", "2027-01-15"], // year rollover
  ])("%s + 1 month → %s", (from, expected) => {
    expect(addMonthClamped(D(from))).toEqual(D(expected));
  });

  test("clamping does not drift the anchor forward over a year", () => {
    // The bug this prevents: if Jan 31 + 1 month overshot to Mar 3, every
    // short month would push the billing date later until it desynchronised
    // from the mandate's `ruleValue` and the debit stopped being eligible.
    let d = D("2026-01-31");
    const days: number[] = [];
    for (let i = 0; i < 12; i++) {
      d = addMonthClamped(d);
      days.push(d.getUTCDate());
    }
    // Every month lands on its own last day at worst, never spills over.
    expect(Math.max(...days)).toBeLessThanOrEqual(31);
    expect(days.every((day) => day >= 28)).toBe(true);
  });
});

describe("canSendPreDebitNotification — the 24–48h lead", () => {
  const cycle = D("2026-07-24");

  test("72h ahead is too early", () => {
    expect(canSendPreDebitNotification(cycle, ist("09:00", 21))).toBe(false);
  });

  test("48h ahead is the earliest allowed", () => {
    expect(canSendPreDebitNotification(cycle, ist("09:00", 22))).toBe(true);
  });

  test("24h ahead is the latest allowed", () => {
    expect(canSendPreDebitNotification(cycle, ist("09:00", 23))).toBe(true);
  });

  test("same day is too late — the debit will be refused without a PDN", () => {
    expect(canSendPreDebitNotification(cycle, ist("09:00", 24))).toBe(false);
  });

  test("the late-night blackout wins even inside the valid lead window", () => {
    expect(canSendPreDebitNotification(cycle, ist("23:00", 22))).toBe(true);
    expect(canSendPreDebitNotification(cycle, ist("23:50", 22))).toBe(false);
  });
});

describe("canPresentDebit", () => {
  const cycle = D("2026-07-21");

  test("not before the cycle date, even in an open window", () => {
    expect(canPresentDebit(cycle, ist("09:00", 20))).toBe(false);
  });

  test("on the cycle date inside a window", () => {
    expect(canPresentDebit(cycle, ist("09:00", 21))).toBe(true);
  });

  test("on the cycle date outside a window", () => {
    expect(canPresentDebit(cycle, ist("11:00", 21))).toBe(false);
  });

  test("late is allowed — a missed day retries rather than skipping the cycle", () => {
    expect(canPresentDebit(cycle, ist("14:00", 23))).toBe(true);
  });

  test("the provider's own instant delays a presentation within the day", () => {
    // NPCI's 24h notice runs from when the payer was NOTIFIED, so a notice
    // raised at 17:10 makes the debit valid from 17:10 the next day — not from
    // midnight. Presenting earlier is refused by the gateway.
    const notBefore = ist("17:10", 21);
    expect(canPresentDebit(cycle, ist("09:00", 21), notBefore)).toBe(false);
    // 17:00–21:30 is a closed NPCI window, so the first real chance is 21:30.
    expect(canPresentDebit(cycle, ist("21:45", 21), notBefore)).toBe(true);
  });

  test("no instant known — nothing beyond the cycle date holds it back", () => {
    // `scheduled_debit_at` is NULLABLE since TAM-164, so "we never learned an
    // instant" arrives here as null and the cycle date alone governs. It used to
    // arrive as a SEED equal to the cycle date, which this function had to
    // filter out by hand — the seed is UTC midnight = 05:30 IST, and honouring
    // it would have withheld 00:00–05:30 of NPCI's first window from every cycle
    // whose status read never reported a timestamp.
    expect(canPresentDebit(cycle, ist("02:00", 21), null)).toBe(true);
    expect(canPresentDebit(cycle, ist("02:00", 21))).toBe(true);
  });

  test("an EARLY-MORNING instant is honoured, not mistaken for the old seed", () => {
    // THE REGRESSION TAM-164 EXISTS TO PREVENT, and the reason the fix had to be
    // nullability rather than a wider comparison.
    //
    // A Razorpay mandate activated between 00:00 and 04:30 IST synthesises a
    // real `notify + TAT` that lands in the early hours of the cycle date —
    // BEFORE the cycle date's own UTC midnight (05:30 IST). The old
    // `notBefore > cycleDate` filter, written to discard the seed, discarded
    // this too: the debit was then presented from 00:00 IST, hours after the
    // notification instead of the required turnaround, and the gateway rejected
    // it. A rejection here is expensive — the order is spent, the retry budget
    // burns, the cycle settles failed, and NPCI auto-revokes a mandate whose
    // FIRST debit fails.
    const earlyMorning = ist("03:00", 21); // 21:30 UTC on the 20th — before `cycle`
    expect(earlyMorning.getTime()).toBeLessThan(cycle.getTime());

    // Held back until its own instant…
    expect(canPresentDebit(cycle, ist("01:00", 21), earlyMorning)).toBe(false);
    // …and released at it, inside the 00:00–10:00 window.
    expect(canPresentDebit(cycle, ist("03:30", 21), earlyMorning)).toBe(true);
  });

  test("a floor never brings a presentation forward", () => {
    // The cycle date stays a HARD floor. A bad or stale instant can only ever
    // delay a debit, never cause an early charge.
    expect(canPresentDebit(cycle, ist("09:00", 20), ist("00:01", 19))).toBe(false);
  });
});

describe("addDays", () => {
  test("crosses a month boundary", () => {
    expect(addDays(D("2026-07-30"), 3)).toEqual(D("2026-08-02"));
  });

  test("the trial offset used at signup", () => {
    expect(addDays(D("2026-07-21"), 3)).toEqual(D("2026-07-24"));
  });
});

/**
 * THE D+1 CONVERSION TABLE (TAM-164).
 *
 * The whole point of the one-day trial, stated as the only thing that actually
 * matters to the business: given a mandate approved at hour X, which day does
 * the ₹299 land on?
 *
 * Three rules compose to answer it, and no single one of them is enough:
 *
 *   1. the gateway will not accept a presentation before `activation + TAT`;
 *   2. NPCI will not execute outside 00:00-10:00, 13:00-17:00 or 21:30-24:00;
 *   3. `cycleDate` is a hard floor, so nothing can be presented early.
 *
 * Composing them by hand in a review is exactly the kind of arithmetic that
 * looks right and is off by one window, so it is done here instead — for every
 * hour of the day, against the real functions rather than a restatement of
 * them.
 *
 * The answer is D+1 for activations up to 23:00 IST and D+2 after, which is the
 * ~96% of signups the ticket claims. Nothing is lost in the remaining hour: a
 * late presentation is explicitly allowed, so those cycles debit on D+2 rather
 * than being stranded.
 */
describe("a one-day trial converts on D+1", () => {
  const TAT_HOURS = 25;
  const ACTIVATION_DAY = 21;
  const cycle = D("2026-07-22"); // D+1

  /**
   * The first instant the sweep would actually present, found the way the sweep
   * finds it: by asking `canPresentDebit` on a tick, every 30 minutes, exactly
   * as the scheduler does. Deliberately NOT computed in closed form — a closed
   * form here would be a second implementation of the thing under test.
   */
  function firstPresentableAt(activation: Date): Date | null {
    // The FULL chain, as it really runs:
    //   activation → +PDN_ACTIVATION_DELAY_MS → notification
    //              → +presentationTatHours    → earliest presentation
    //              → next open NPCI window    → the debit
    const notifiedAt = new Date(activation.getTime() + PDN_ACTIVATION_DELAY_MS);
    const notBefore = new Date(notifiedAt.getTime() + TAT_HOURS * 3_600_000);
    for (let tick = 0; tick < 4 * 48; tick += 1) {
      const now = new Date(activation.getTime() + tick * 30 * 60_000);
      if (canPresentDebit(cycle, now, notBefore)) return now;
    }
    return null;
  }

  /** Which IST day an instant falls on, relative to the activation day. */
  function dayOffset(at: Date): number {
    return Math.round(
      (istDateOnly(at).getTime() - D("2026-07-21").getTime()) / 86_400_000
    );
  }

  test.each([
    ["00:30", 1],
    ["06:00", 1],
    ["09:30", 1], // +25h lands at 10:30, inside the 10:00-13:00 peak → waits for 13:00
    ["12:00", 1],
    ["15:00", 1],
    ["18:00", 1], // +25h lands at 19:00, inside the 17:00-21:30 peak → waits for 21:30
    ["20:45", 1],
    ["22:00", 1], // comfortably inside D+1's final window
  ])("activation at IST %s debits on D+%i", (time, expected) => {
    const at = firstPresentableAt(ist(time, ACTIVATION_DAY));
    expect(at).not.toBeNull();
    expect(dayOffset(at as Date)).toBe(expected);
  });

  test("the D+1 cutoff is arithmetic MINUS one sweep tick, not the arithmetic alone", () => {
    // Two different cutoffs, and confusing them is how a coverage estimate ends
    // up wrong by half an hour.
    //
    // The ARITHMETIC one is `48h − TAT − delay` = 22:50 at today's constants:
    // later than that and `activation + delay + TAT` crosses into D+2. But the
    // sweep does not present continuously — it presents on 30-minute ticks. An
    // activation at 22:45 becomes presentable at D+1 23:55, and the last tick of
    // D+1 available to it falls at 23:45, TEN MINUTES SHORT. The next tick is on
    // D+2.
    //
    // So the EFFECTIVE cutoff is up to one tick earlier than the arithmetic one,
    // and exactly how much earlier depends on where the EventBridge schedule's
    // ticks happen to fall — which we do not control and must not assume.
    const cutoffMinutes =
      48 * 60 - TAT_HOURS * 60 - PDN_ACTIVATION_DELAY_MS / 60_000;
    const midnight = ist("00:00", ACTIVATION_DAY).getTime();
    const at = (minutes: number): number =>
      dayOffset(firstPresentableAt(new Date(midnight + minutes * 60_000)) as Date);

    // Past the arithmetic cutoff: D+2, always.
    expect(at(cutoffMinutes + 5)).toBe(2);
    // Inside the last tick before it: D+2 as well — this is the gap the
    // arithmetic alone would have called D+1.
    expect(at(cutoffMinutes - 5)).toBe(2);
    // A full tick clear of it: D+1, reliably.
    expect(at(cutoffMinutes - 35)).toBe(1);
  });

  test.each([
    ["23:15", 2],
    ["23:55", 2],
  ])("activation at IST %s slips to D+%i — late, never lost", (time, expected) => {
    // `activation + 25h` crosses midnight, so D+1's last window has closed. The
    // cycle is NOT stranded: `canPresentDebit` allows a late presentation, so it
    // debits on the next open window instead of being skipped forever.
    const at = firstPresentableAt(ist(time, ACTIVATION_DAY));
    expect(at).not.toBeNull();
    expect(dayOffset(at as Date)).toBe(expected);
  });

  test("the cycle date is still a hard floor, whatever the turnaround says", () => {
    // A turnaround short enough to fall BEFORE the cycle date must not pull the
    // debit forward — being wrong about the TAT has to mean billing late, never
    // billing early. This is what makes the unconfirmed 25 safe to ship against.
    const activation = ist("09:00", ACTIVATION_DAY);
    const tooEarly = new Date(activation.getTime() + 2 * 3_600_000);
    expect(canPresentDebit(cycle, ist("12:00", ACTIVATION_DAY), tooEarly)).toBe(
      false
    );
  });

  test("a longer turnaround costs coverage, and only coverage", () => {
    // If Razorpay's real figure turns out to be 30h rather than 25h, D+1 still
    // works — for fewer activations. The design degrades along one axis instead
    // of breaking, which is the property that lets the number stay unconfirmed
    // while the code is built and tested.
    const at30h = (time: string): number => {
      const activation = ist(time, ACTIVATION_DAY);
      const notBefore = new Date(activation.getTime() + 30 * 3_600_000);
      for (let tick = 0; tick < 4 * 48; tick += 1) {
        const now = new Date(activation.getTime() + tick * 30 * 60_000);
        if (canPresentDebit(cycle, now, notBefore)) return dayOffset(now);
      }
      throw new Error("never presentable");
    };
    expect(at30h("09:00")).toBe(1); // morning signups still convert on D+1
    expect(at30h("20:00")).toBe(2); // evening ones slip a day
  });
});

/**
 * The wait before the first notification (TAM-164), and the one condition under
 * which it must NOT be taken.
 *
 * The wait exists so a just-approved mandate has settled at the gateway before
 * we create a notification order against it — a premature order is refused, and
 * a refusal spends one of three dispatch attempts.
 *
 * But at a 24h lead the cycle is notifiable ONLY on the activation day. Past the
 * 23:50 blackout, or past IST midnight, it can never be notified again — so a
 * wait that crosses either boundary does not delay the notification, it destroys
 * the cycle. Silently, because nothing is ever claimed. The rule asserted here is
 * that the delay yields to the boundary, and never the other way round.
 *
 * Driven by the REAL constant, not a copy of it: the unsafe window widens with
 * the delay, so a hardcoded figure here would silently stop describing the code
 * the first time the wait is retuned.
 */
describe("the activation notification delay yields to the day boundary", () => {
  const cycle = D("2026-07-22"); // a one-day trial approved on the 21st
  const lead = { min: 24, max: 48 };
  const delayMinutes = PDN_ACTIVATION_DELAY_MS / 60_000;

  /** Would waiting the configured delay still leave this cycle notifiable? */
  const safeToWait = (activation: Date): boolean => {
    const after = new Date(activation.getTime() + PDN_ACTIVATION_DELAY_MS);
    return !isPdnBlackout(after) && canSendPreDebitNotification(cycle, after, lead);
  };

  test.each(["00:10", "09:00", "17:00", "22:00", "23:00"])(
    "IST %s — waiting is safe",
    (time) => {
      expect(safeToWait(ist(time, 21))).toBe(true);
    }
  );

  test("late enough that the wait would cross a boundary, it is not taken", () => {
    // Expressed relative to the constant so these stay meaningful when it moves.
    const blackoutStart = ist("23:50", 21);
    const justInside = new Date(blackoutStart.getTime() - (delayMinutes - 1) * 60_000);
    const wellInside = new Date(blackoutStart.getTime() - 1 * 60_000);
    expect(safeToWait(justInside)).toBe(false);
    expect(safeToWait(wellInside)).toBe(false);
    // Already past midnight-minus-delay: the lead, not the blackout, refuses it.
    expect(safeToWait(ist("23:58", 21))).toBe(false);
  });

  test("the unsafe window is exactly the delay plus the blackout, and sits at the end of the day", () => {
    // THE property worth pinning. The window is `delay + 10min` wide — the ten
    // being the 23:50–24:00 blackout — so retuning the delay moves it in a way
    // that is predictable rather than surprising. If this ever grew into hours,
    // a real slice of the evening would be silently taking the no-wait path.
    const unsafe = Array.from({ length: 24 * 60 }, (_, m) => m).filter((m) =>
      !safeToWait(new Date(ist("00:00", 21).getTime() + m * 60_000))
    );

    expect(unsafe).toHaveLength(delayMinutes + 10);
    // Contiguous, and running to the very last minute of the IST day.
    expect(Math.max(...unsafe)).toBe(24 * 60 - 1);
    expect(Math.min(...unsafe)).toBe(24 * 60 - (delayMinutes + 10));
  });
});
