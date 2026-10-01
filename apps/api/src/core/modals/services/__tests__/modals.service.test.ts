import { beforeEach, describe, expect, test } from "vitest";
import { ModalsService } from "../modals.service.js";
import type {
  ModalHookEffect,
  ModalHookInput,
  ModalStateRow,
  ModalsRepositoryPort,
} from "@api/core/modals/types";

/**
 * Hand-rolled fake, matching this repo's convention (no mocking library).
 * It records calls so a test can assert "nothing was written" as precisely as
 * "this was written".
 */
class FakeRepo implements ModalsRepositoryPort {
  state: ModalStateRow | null = null;
  seenTaskIds = new Set<string>();
  calls: string[] = [];
  // What `claimAndApply` actually received for `(effect, applied)`, in call
  // order — lets a test assert the real decision (unservable, halted no-op,
  // armed, …) was made BEFORE the claim, not just that the call happened.
  claims: { effect: ModalHookEffect; applied: boolean }[] = [];
  // Set by a test to make claimAndApply's effect step itself fail — proves
  // (Blocker 2) that the claim and the apply are ONE unit: a failure here
  // must NOT leave `taskId` claimed, so `seenTaskIds` is deliberately not
  // updated on this path, and a retry gets a genuine second attempt rather
  // than reading back "duplicate" for an effect that never ran.
  applyShouldThrow = false;

  // Each field is annotated with the PORT's method type rather than letting the
  // initialiser infer one. Later tests reassign these with a typed parameter
  // (`repo.advanceLedger = async (input) => …`), and an inferred zero-arg type
  // would make that parameter an implicit `any` — a lint and strict-mode error.
  // Not `async` — every body below is purely synchronous, and this repo's
  // `@typescript-eslint/require-await` gate errors on an `async` function with
  // no `await` inside. Explicit `Promise.resolve(...)` keeps the port's Promise
  // return type without the disallowed no-op `async`.
  findState: ModalsRepositoryPort["findState"] = () => Promise.resolve(this.state);

  claimAndApply: ModalsRepositoryPort["claimAndApply"] = (input, effect, applied) => {
    this.calls.push("claimAndApply");
    this.claims.push({ effect, applied });
    if (this.seenTaskIds.has(input.taskId)) return Promise.resolve(false);
    if (this.applyShouldThrow) {
      return Promise.reject(new Error("simulated apply failure inside claimAndApply's transaction"));
    }
    this.seenTaskIds.add(input.taskId);
    if (effect === "arm") this.calls.push("upsertArm");
    if (effect === "halt") this.calls.push("applyHalt");
    if (effect === "clear") this.calls.push("clearArm");
    return Promise.resolve(true);
  };

  findServable: ModalsRepositoryPort["findServable"] = () => Promise.resolve(null);
  // A genuine compare-and-swap against `this.state.showCount`, not an
  // unconditional `true` — so a test exercising the DEFAULT (unoverridden)
  // implementation still proves the real idempotency behaviour: a second call
  // pinning the same `expectedShowCount` a first call already consumed fails,
  // exactly like the real repository's `updateMany` losing its WHERE match.
  advanceLedger: ModalsRepositoryPort["advanceLedger"] = (input) => {
    if (!this.state || this.state.showCount !== input.expectedShowCount) {
      return Promise.resolve(false);
    }
    this.state.showCount += 1;
    return Promise.resolve(true);
  };
  appendImpression: ModalsRepositoryPort["appendImpression"] = () => {
    this.calls.push("appendImpression");
    return Promise.resolve();
  };
}

function armInput(overrides: Partial<ModalHookInput> = {}): ModalHookInput {
  return {
    taskId: "campaign-delivery-91823",
    action: "arm",
    origin: "event",
    userId: "01a01482-6685-7233-8000-000000000001",
    modalKey: "status_intro",
    triggerSource: "post_outcome",
    surface: "home",
    content: {
      hi: { title: "अब स्टेटस पर दिखेगा आपका नाम और फोटो", ctaText: "नाम और फोटो डालें", ctaDeeplink: "prabhuji://status/personal-details" },
      en: { title: "Your name and photo on your status", ctaText: "Add name and photo", ctaDeeplink: "prabhuji://status/personal-details" },
    },
    maxLifetime: 3,
    maxPerDay: 1,
    sourceEventName: "set_wallpaper_result",
    audienceId: 42,
    audienceName: "prabhuji-status-intro",
    campaignId: 12,
    occurredAt: new Date("2026-09-11T06:35:00.000Z"),
    ...overrides,
  };
}

function stateRow(overrides: Partial<ModalStateRow> = {}): ModalStateRow {
  return {
    userId: "01a01482-6685-7233-8000-000000000001",
    modalKey: "status_intro",
    triggerSource: "post_outcome",
    surface: "home",
    content: {},
    armedAt: new Date("2026-09-11T06:35:00.000Z"),
    lastOutcomeModule: "set_wallpaper_result",
    showCount: 0,
    shownTodayCount: 0,
    lastShownDateIst: null,
    maxLifetime: 3,
    maxPerDay: 1,
    haltedAt: null,
    ...overrides,
  };
}

let repo: FakeRepo;
let service: ModalsService;

beforeEach(() => {
  repo = new FakeRepo();
  service = new ModalsService(repo);
});

describe("handleHook — arm", () => {
  test("arms a user with no prior state", async () => {
    const result = await service.handleHook(armInput());

    expect(result.applied).toBe(true);
    expect(repo.calls).toContain("upsertArm");
    expect(repo.claims).toEqual([{ effect: "arm", applied: true }]);
  });

  test("a repeated task_id changes nothing and still succeeds", async () => {
    await service.handleHook(armInput());
    repo.calls = [];

    const second = await service.handleHook(armInput());

    expect(second.applied).toBe(false);
    expect(second.reason).toBe("duplicate");
    expect(repo.calls).not.toContain("upsertArm");
  });

  test("an arm onto a halted row is recorded and ignored", async () => {
    repo.state = stateRow({ haltedAt: new Date("2026-09-10T00:00:00.000Z") });

    const result = await service.handleHook(armInput({ taskId: "campaign-delivery-2" }));

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("halted");
    expect(repo.calls).not.toContain("upsertArm");
    expect(repo.calls).toContain("claimAndApply");
    expect(repo.claims).toEqual([{ effect: "none", applied: false }]);
  });
});

describe("handleHook — unservable arm (Blocker 3a)", () => {
  test("an arm with no surface is refused, not stored", async () => {
    const result = await service.handleHook(armInput({ surface: null }));

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("unservable");
    expect(repo.calls).not.toContain("upsertArm");
    expect(repo.claims).toEqual([{ effect: "none", applied: false }]);
  });

  test("an arm with no usable content in any locale is refused", async () => {
    const result = await service.handleHook(
      armInput({ content: { hi: { title: "", ctaText: "", ctaDeeplink: "" } } })
    );

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("unservable");
    expect(repo.calls).not.toContain("upsertArm");
  });

  test("an arm whose only locale has an out-of-scheme ctaDeeplink is refused", async () => {
    // Same shared usability check that gates the CTA scheme (`prabhuji://` /
    // `https://`) — a rogue scheme must never 400 the webhook (it is a
    // campaign misconfiguration, not malformed JSON) and must never be stored
    // either, so it is refused at intake exactly like a missing field.
    const result = await service.handleHook(
      armInput({ content: { hi: { title: "t", ctaText: "c", ctaDeeplink: "javascript:alert(1)" } } })
    );

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("unservable");
    expect(repo.calls).not.toContain("upsertArm");
  });

  test("an arm usable in at least one locale is armed", async () => {
    const result = await service.handleHook(
      armInput({
        content: {
          hi: { title: "", ctaText: "", ctaDeeplink: "" },
          en: { title: "t", ctaText: "c", ctaDeeplink: "prabhuji://x" },
        },
      })
    );

    expect(result.applied).toBe(true);
    expect(result.reason).toBe("armed");
    expect(repo.calls).toContain("upsertArm");
  });

  // The whole point of refusing at intake: `findServable` picks ONE row by
  // `armedAt desc`, so an unservable row that got stored anyway would sort
  // ahead of a genuinely servable one and hide it forever. Refusing it before
  // it is ever written means there is nothing to sort ahead of anything.
  test("an unservable arm does not block a later servable arm for the same key", async () => {
    const refused = await service.handleHook(
      armInput({ taskId: "campaign-delivery-u1", surface: null })
    );
    expect(refused.reason).toBe("unservable");
    expect(repo.calls).not.toContain("upsertArm");

    const armed = await service.handleHook(armInput({ taskId: "campaign-delivery-u2" }));
    expect(armed.applied).toBe(true);
    expect(armed.reason).toBe("armed");
    expect(repo.calls).toContain("upsertArm");
  });
});

describe("handleHook — claim+apply is one transaction (Blocker 2)", () => {
  // The bug this closes: `recordDelivery` used to commit `taskId` in its OWN
  // transaction, then `upsertArm`/`applyHalt`/`clearArm` ran separately. If
  // THAT threw, the request 500ed, dispatch retried the same `taskId`, and
  // the retry read back "duplicate" — `applied: false` — having applied
  // nothing, and the arm was lost silently forever.
  test("a failure applying the effect does not claim the task_id — a retry gets a real second attempt", async () => {
    repo.applyShouldThrow = true;
    await expect(service.handleHook(armInput())).rejects.toThrow();
    expect(repo.seenTaskIds.has("campaign-delivery-91823")).toBe(false);

    repo.applyShouldThrow = false;
    const retry = await service.handleHook(armInput());

    expect(retry.applied).toBe(true);
    expect(retry.reason).toBe("armed");
    expect(repo.calls).toContain("upsertArm");
  });

  test("the same failure-then-retry shape holds for a halt", async () => {
    repo.applyShouldThrow = true;
    await expect(
      service.handleHook(armInput({ action: "halt", sourceEventName: "status_share_result" }))
    ).rejects.toThrow();

    repo.applyShouldThrow = false;
    const retry = await service.handleHook(
      armInput({ action: "halt", sourceEventName: "status_share_result" })
    );

    expect(retry.applied).toBe(true);
    expect(retry.reason).toBe("halted");
    expect(repo.calls).toContain("applyHalt");
  });
});

describe("handleHook — halt", () => {
  test("origin:event halts permanently", async () => {
    repo.state = stateRow();

    const result = await service.handleHook(
      armInput({
        taskId: "campaign-delivery-3",
        action: "halt",
        origin: "event",
        sourceEventName: "status_share_result",
      })
    );

    expect(result.applied).toBe(true);
    expect(result.reason).toBe("halted");
    expect(repo.calls).toContain("applyHalt");
    expect(repo.calls).not.toContain("clearArm");
    expect(repo.claims).toEqual([{ effect: "halt", applied: true }]);
  });

  // A halt that arrives BEFORE any arm is the whole reason audience B exists:
  // a user who shares a named status without ever qualifying for the modal is
  // never a member of audience A, so A's exit rule can never fire for them.
  test("origin:event with no existing row still halts", async () => {
    repo.state = null;

    const result = await service.handleHook(
      armInput({ taskId: "campaign-delivery-4", action: "halt", origin: "event" })
    );

    expect(result.applied).toBe(true);
    expect(repo.calls).toContain("applyHalt");
  });

  // A cron expiry is not a user action. Halting on one would permanently hide a
  // modal because a sweep ran, which presents as "it stopped working for some
  // users" and is close to undiagnosable.
  test("origin:cron clears the arm and does NOT halt", async () => {
    repo.state = stateRow();

    const result = await service.handleHook(
      armInput({
        taskId: "campaign-delivery-5",
        action: "halt",
        origin: "cron",
        sourceEventName: null,
      })
    );

    expect(result.applied).toBe(true);
    expect(result.reason).toBe("expired");
    expect(repo.calls).toContain("clearArm");
    expect(repo.calls).not.toContain("applyHalt");
    expect(repo.claims).toEqual([{ effect: "clear", applied: true }]);
  });
});

describe("next — the serve gate", () => {
  // The repository applies the SQL gate; the service applies the same rules to
  // whatever it gets back, so a row the repo let through for the wrong reason
  // still cannot be served.
  test("serves an armed, uncapped modal with showNumber = showCount + 1", async () => {
    repo.state = stateRow({ showCount: 1, shownTodayCount: 1, lastShownDateIst: "2026-09-10" });
    repo.state.content = {
      hi: { title: "नाम और फोटो", ctaText: "डालें", ctaDeeplink: "prabhuji://status" },
    };
    repo.findServable = () => Promise.resolve(repo.state);

    const modal = await service.next(
      "01a01482-6685-7233-8000-000000000001",
      "home",
      "hi",
      new Date("2026-09-11T06:00:00.000Z")
    );

    expect(modal).not.toBeNull();
    expect(modal?.showNumber).toBe(2);
    expect(modal?.localeServed).toBe("hi");
    expect(modal?.lastOutcomeModule).toBe("set_wallpaper_result");
  });

  test("returns null when nothing is armed", async () => {
    repo.findServable = () => Promise.resolve(null);

    expect(await service.next("u", "home", "hi")).toBeNull();
  });

  test("returns null when the lifetime cap is reached", async () => {
    repo.state = stateRow({ showCount: 3, maxLifetime: 3 });
    repo.findServable = () => Promise.resolve(repo.state);

    expect(await service.next("u", "home", "hi", new Date("2026-09-11T06:00:00.000Z"))).toBeNull();
  });

  test("returns null when today's cap is reached", async () => {
    // 06:00 UTC on the 11th is 11:30 IST on the 11th.
    repo.state = stateRow({ shownTodayCount: 1, maxPerDay: 1, lastShownDateIst: "2026-09-11" });
    repo.findServable = () => Promise.resolve(repo.state);

    expect(await service.next("u", "home", "hi", new Date("2026-09-11T06:00:00.000Z"))).toBeNull();
  });

  test("serves again once the IST day has rolled", async () => {
    repo.state = stateRow({ shownTodayCount: 1, maxPerDay: 1, lastShownDateIst: "2026-09-11" });
    repo.state.content = { en: { title: "t", ctaText: "c", ctaDeeplink: "prabhuji://d" } };
    repo.findServable = () => Promise.resolve(repo.state);

    // 18:30 UTC on the 11th is already the 12th in IST.
    const modal = await service.next("u", "home", "en", new Date("2026-09-11T18:30:00.000Z"));

    expect(modal).not.toBeNull();
  });

  test("maxPerDay of 2 serves twice on the same IST day", async () => {
    repo.state = stateRow({ shownTodayCount: 1, maxPerDay: 2, lastShownDateIst: "2026-09-11" });
    repo.state.content = { en: { title: "t", ctaText: "c", ctaDeeplink: "prabhuji://d" } };
    repo.findServable = () => Promise.resolve(repo.state);

    expect(await service.next("u", "home", "en", new Date("2026-09-11T06:00:00.000Z"))).not.toBeNull();
  });

  test("returns null when halted", async () => {
    repo.state = stateRow({ haltedAt: new Date("2026-09-10T00:00:00.000Z") });
    repo.findServable = () => Promise.resolve(repo.state);

    expect(await service.next("u", "home", "hi", new Date("2026-09-11T06:00:00.000Z"))).toBeNull();
  });
});

describe("next — locale fallback", () => {
  function withContent(content: Record<string, unknown>) {
    repo.state = stateRow();
    repo.state.content = content as never;
    repo.findServable = () => Promise.resolve(repo.state);
  }
  const AT = new Date("2026-09-11T06:00:00.000Z");

  test("falls back to hi when the requested locale is absent", async () => {
    withContent({
      hi: { title: "h", ctaText: "c", ctaDeeplink: "prabhuji://d" },
      en: { title: "e", ctaText: "c", ctaDeeplink: "prabhuji://d" },
    });

    const modal = await service.next("u", "home", "mr", AT);
    expect(modal?.localeServed).toBe("hi");
  });

  test("falls back to en when hi is absent too", async () => {
    withContent({ en: { title: "e", ctaText: "c", ctaDeeplink: "prabhuji://d" } });

    const modal = await service.next("u", "home", "mr", AT);
    expect(modal?.localeServed).toBe("en");
  });

  test("falls back to the first key present when neither hi nor en exists", async () => {
    withContent({ ta: { title: "t", ctaText: "c", ctaDeeplink: "prabhuji://d" } });

    const modal = await service.next("u", "home", "mr", AT);
    expect(modal?.localeServed).toBe("ta");
  });

  // A modal with no copy is worse than no modal: the app would paint an empty
  // sheet the user has to dismiss.
  test("returns null rather than a modal with empty copy", async () => {
    withContent({});

    expect(await service.next("u", "home", "hi", AT)).toBeNull();
  });

  test("an absent locale param still resolves", async () => {
    withContent({ hi: { title: "h", ctaText: "c", ctaDeeplink: "prabhuji://d" } });

    const modal = await service.next("u", "home", undefined, AT);
    expect(modal?.localeServed).toBe("hi");
  });
});

describe("recordImpression", () => {
  const USER = "01a01482-6685-7233-8000-000000000001";

  function impression(overrides: Record<string, unknown> = {}) {
    return {
      userId: USER,
      modalKey: "status_intro",
      triggerSource: "post_outcome",
      action: "viewed" as const,
      dismissMethod: null,
      // The show the client was told it got (`ServableModal.showNumber`).
      // Matches the default `stateRow().showCount` of 0 (expectedShowCount =
      // showNumber - 1 = 0) so existing tests below keep behaving the same.
      showNumber: 1,
      now: new Date("2026-09-11T06:00:00.000Z"),
      ...overrides,
    };
  }

  test("a viewed impression advances the ledger", async () => {
    repo.state = stateRow();
    let advanced: { todayIst: string; rolled: boolean } | null = null;
    repo.advanceLedger = (input) => {
      advanced = { todayIst: input.todayIst, rolled: input.rolled };
      return Promise.resolve(true);
    };

    const result = await service.recordImpression(impression());

    expect(result.counted).toBe(true);
    expect(advanced).toEqual({ todayIst: "2026-09-11", rolled: true });
    expect(repo.calls).toContain("appendImpression");
  });

  test("rolled is false when the stored IST day is today", async () => {
    repo.state = stateRow({ lastShownDateIst: "2026-09-11", shownTodayCount: 0 });
    let rolled: boolean | null = null;
    repo.advanceLedger = (input) => {
      rolled = input.rolled;
      return Promise.resolve(true);
    };

    await service.recordImpression(impression());

    expect(rolled).toBe(false);
  });

  // 18:29 UTC and 18:31 UTC on the same date are DIFFERENT IST days. This is
  // the one boundary a UTC-based implementation gets wrong.
  test("18:29 UTC still counts against the same IST day", async () => {
    repo.state = stateRow({ lastShownDateIst: "2026-09-11" });
    let rolled: boolean | null = null;
    repo.advanceLedger = (input) => {
      rolled = input.rolled;
      return Promise.resolve(true);
    };

    await service.recordImpression(impression({ now: new Date("2026-09-11T18:29:59.000Z") }));

    expect(rolled).toBe(false);
  });

  test("18:30 UTC rolls to the next IST day", async () => {
    repo.state = stateRow({ lastShownDateIst: "2026-09-11" });
    let captured: { todayIst: string; rolled: boolean } | null = null;
    repo.advanceLedger = (input) => {
      captured = { todayIst: input.todayIst, rolled: input.rolled };
      return Promise.resolve(true);
    };

    await service.recordImpression(impression({ now: new Date("2026-09-11T18:30:00.000Z") }));

    expect(captured).toEqual({ todayIst: "2026-09-12", rolled: true });
  });

  test("cta_clicked and dismissed append but never advance the ledger", async () => {
    repo.state = stateRow();
    let advanceCalls = 0;
    repo.advanceLedger = () => {
      advanceCalls += 1;
      return Promise.resolve(true);
    };

    await service.recordImpression(impression({ action: "cta_clicked" }));
    await service.recordImpression(impression({ action: "dismissed", dismissMethod: "cross" }));

    expect(advanceCalls).toBe(0);
    expect(repo.calls.filter((c) => c === "appendImpression")).toHaveLength(2);
  });

  // The compare-and-swap's affected-row count is the authority: a losing
  // writer's update matches zero rows because the row no longer holds the
  // `showCount` it pinned. A second viewed for the same show loses the race
  // and must not count.
  test("a losing conditional update does not count the show", async () => {
    repo.state = stateRow();
    repo.advanceLedger = () => Promise.resolve(false);

    const result = await service.recordImpression(impression());

    expect(result.counted).toBe(false);
  });

  // The CAS must be keyed on what the CLIENT says it was served, not on a
  // fresh server-side read — a fresh read is current by definition and would
  // always advance, which is exactly the sequential-duplicate bug this fixes.
  // `state.showCount` is deliberately set to something else (5) so this test
  // fails loudly if `expectedShowCount` is ever re-derived from the read
  // instead of from `input.showNumber`.
  test("derives expectedShowCount from the echoed showNumber, not a fresh read", async () => {
    repo.state = stateRow({ showCount: 5 });
    let seen: number | null = null;
    repo.advanceLedger = (input) => {
      seen = input.expectedShowCount;
      return Promise.resolve(true);
    };

    await service.recordImpression(impression({ showNumber: 2 }));

    expect(seen).toBe(1);
  });

  // The idempotency guarantee this whole fix exists for: a SEQUENTIAL
  // duplicate (a network retry, a double widget rebuild), not merely a
  // simultaneous one. Uses the FakeRepo's default (unoverridden)
  // `advanceLedger`, which performs a real compare-and-swap against
  // `state.showCount`, so this exercises the actual wiring end to end.
  test("a second recordImpression for the same showNumber does not count", async () => {
    repo.state = stateRow({ showCount: 0 });

    const first = await service.recordImpression(impression({ showNumber: 1 }));
    const second = await service.recordImpression(impression({ showNumber: 1 }));

    expect(first.counted).toBe(true);
    expect(second.counted).toBe(false);
    expect(repo.state.showCount).toBe(1);
  });

  test("an impression for an unknown modal is a no-op, not an error", async () => {
    repo.state = null;

    const result = await service.recordImpression(impression());

    expect(result.counted).toBe(false);
    expect(repo.calls).not.toContain("appendImpression");
  });

  // A `showNumber` the server never issued (state.showCount + 1) is refused
  // BEFORE any write — not a 4xx, because the app believes this already
  // happened and would just retry forever. Guards against a fabricated show
  // number writing a bogus impression row (there is no `counted` column, so a
  // losing report is indistinguishable from a real one) or pushing
  // `shownTodayCount` past `maxPerDay`.
  test("a showNumber the server never issued is ignored before any write", async () => {
    repo.state = stateRow({ showCount: 0 });

    const result = await service.recordImpression(impression({ showNumber: 5 }));

    expect(result.counted).toBe(false);
    expect(repo.calls).not.toContain("appendImpression");
  });

  // The boundary: the NEXT show (state.showCount + 1) is exactly what
  // `GET /modals/next` would have issued, so it must still be accepted.
  test("the next issuable showNumber is accepted", async () => {
    repo.state = stateRow({ showCount: 2 });

    const result = await service.recordImpression(impression({ showNumber: 3 }));

    expect(result.counted).toBe(true);
  });
});
