import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import { AppError } from "@api/shared/errors";
import type {
  AiJsonRequest,
  HoroscopeAiClient,
  StepConfigRow,
} from "../../../repositories/index.js";
import type { HoroscopeAdminService } from "../../horoscope.admin.service.js";
import type { HoroscopeRepository } from "../../../repositories/horoscope.repository.js";
import type { HoroscopeGenerationLock } from "../generation-lock.js";
import { HoroscopeGenerationService } from "../horoscope.generation.service.js";
import { GENERATION_LOCALES } from "../../../types.js";

/**
 * Unit coverage for the AI content pipeline. The AI client, the repository, the
 * admin write service and the lock are ALL faked — nothing here touches a
 * network, an API key or Postgres.
 *
 * The properties that matter most, and why:
 *   - a payload with the wrong SHAPE, or one that trips the content-safety
 *     deny-list, is never stored (a stored bad reading is served to real users
 *     until someone notices);
 *   - a payload is stored for every locale or for none (a safety failure in the
 *     last locale must not leave the earlier ones behind — vacuous while
 *     `GENERATION_LOCALES` is Hindi-only, load-bearing again the moment a
 *     second locale returns);
 *   - a lost write race is a no-op, not an error (the unique constraint is the
 *     real concurrency guard, and it is EXPECTED to fire).
 */

const DATE_IST = "2026-07-22";
const TARGET = { zodiacId: "taurus", modeId: "daily_horoscope", dateIst: DATE_IST };

// --- fixtures ---------------------------------------------------------------

function step(overrides: Partial<StepConfigRow> = {}): StepConfigRow {
  return {
    stepId: "namaste",
    modeId: "daily_horoscope",
    title: "Namaste",
    localizedTitle: { en: "Namaste", hi: "नमस्ते", mr: "नमस्कार", te: "నమస్తే" },
    order: 0,
    contentType: "text",
    providerMapping: "namaste",
    ttsEnabled: true,
    safetyCategory: "greeting",
    ...overrides,
  };
}

const TEXT_STEP = step();
const NUMBER_STEP = step({
  stepId: "lucky_number",
  providerMapping: "lucky_number",
  contentType: "number",
  title: "Lucky number",
  localizedTitle: { en: "Lucky number", hi: "शुभ अंक", mr: "शुभ अंक", te: "అదృష్ట సంఖ్య" },
  order: 6,
});

/**
 * A payload that passes every layer. Hindi-only, matching `GENERATION_LOCALES`
 * — the schema sent to the provider has no other locale key, so a fixture
 * carrying `en`/`mr`/`te` would be testing a response shape that can no longer
 * occur.
 */
function goodPayload(overrides: Record<string, unknown> = {}) {
  return {
    namaste: {
      hi: "आज मन स्थिर रहेगा और अधूरे काम पूरे करने का अच्छा अवसर मिलेगा।",
    },
    lucky_number: 6,
    ...overrides,
  };
}

/** Fake AI client. One call per generation attempt; no second verification call. */
function makeAi(options: { payloads?: unknown[] } = {}) {
  const payloads = [...(options.payloads ?? [goodPayload()])];
  const requests: AiJsonRequest[] = [];

  const completeJson = vi.fn((req: AiJsonRequest) => {
    requests.push(req);
    // Repeat the final payload once the scripted ones run out, so a test that
    // only cares about the first attempt does not have to script the rest.
    return Promise.resolve(payloads.length > 1 ? payloads.shift() : payloads[0]);
  });
  const client: HoroscopeAiClient = { completeJson };
  // `completeJson` is returned separately so assertions reference the mock
  // directly rather than reaching through the object (no-unbound-method).
  return { client, requests, completeJson };
}

interface RepoMock {
  findEnabledSteps: Mock;
  findEnabledZodiacSigns: Mock;
  hasResultForSign: Mock;
  findZodiacIdsWithResults: Mock;
}

function makeRepo(steps: StepConfigRow[] = [TEXT_STEP, NUMBER_STEP]): RepoMock {
  return {
    findEnabledSteps: vi.fn().mockResolvedValue(steps),
    findEnabledZodiacSigns: vi.fn().mockResolvedValue([
      { zodiacId: "taurus", displayName: "Taurus", localizedDisplayName: {}, iconAssetUrl: "", sortOrder: 1 },
      { zodiacId: "aries", displayName: "Aries", localizedDisplayName: {}, iconAssetUrl: "", sortOrder: 0 },
    ]),
    hasResultForSign: vi.fn().mockResolvedValue(false),
    findZodiacIdsWithResults: vi.fn().mockResolvedValue([]),
  };
}

function makeAdmin() {
  return { createResult: vi.fn().mockResolvedValue({ id: "r1" }) };
}

/** Lock that always grants. `acquire` is overridden per-test where it matters. */
function makeLock(granted = true) {
  return {
    acquire: vi.fn().mockResolvedValue(granted ? () => Promise.resolve() : null),
    claimWarmWindow: vi.fn().mockResolvedValue(true),
  };
}

function makeService(parts: {
  ai?: HoroscopeAiClient;
  repo?: RepoMock;
  admin?: ReturnType<typeof makeAdmin>;
  lock?: ReturnType<typeof makeLock>;
  waitMs?: number;
} = {}) {
  const ai = parts.ai ?? makeAi().client;
  const repo = parts.repo ?? makeRepo();
  const admin = parts.admin ?? makeAdmin();
  const lock = parts.lock ?? makeLock();
  const service = new HoroscopeGenerationService(
    ai,
    repo as unknown as HoroscopeRepository,
    admin as unknown as HoroscopeAdminService,
    lock as unknown as HoroscopeGenerationLock,
    parts.waitMs ?? 5_000
  );
  return { service, ai, repo, admin, lock };
}

// --- tests ------------------------------------------------------------------

describe("HoroscopeGenerationService — storage fan out", () => {
  test("one generation writes one row per generated locale", async () => {
    const { service, admin } = makeService();

    await expect(service.ensureResult(TARGET)).resolves.toBe(true);

    expect(admin.createResult).toHaveBeenCalledTimes(GENERATION_LOCALES.length);
    expect(
      admin.createResult.mock.calls.map((c) => (c[0] as { languageCode: string }).languageCode)
    ).toEqual([...GENERATION_LOCALES]);
  });

  test("the determinism key and provider are recorded on every row", async () => {
    const { service, admin } = makeService();
    await service.ensureResult(TARGET);

    for (const [payload] of admin.createResult.mock.calls) {
      expect(payload).toMatchObject({
        zodiacId: "taurus",
        modeId: "daily_horoscope",
        dateIst: DATE_IST,
        providerName: "openai",
      });
    }
  });

  test("contentSafetyStatus is never sent — the write path computes it", async () => {
    // Passing it would be an attempt to forge a safety attestation; the admin
    // service owns that value precisely so no caller can.
    const { service, admin } = makeService();
    await service.ensureResult(TARGET);

    for (const [payload] of admin.createResult.mock.calls) {
      expect(payload).not.toHaveProperty("contentSafetyStatus");
    }
  });

  test("titles come from config, body text from the model", async () => {
    const { service, admin } = makeService();
    await service.ensureResult(TARGET);

    const hindi = admin.createResult.mock.calls
      .map(([p]) => p as { languageCode: string; steps: { stepId: string; title: string; displayText: string }[] })
      .find((p) => p.languageCode === "hi");

    const namaste = hindi?.steps.find((s) => s.stepId === "namaste");
    expect(namaste?.title).toBe("नमस्ते"); // localizedTitle.hi, not generated
    expect(namaste?.displayText).toContain("आज मन स्थिर रहेगा");
  });

  test("a number step is stringified into both displayText and ttsText", async () => {
    const { service, admin } = makeService();
    await service.ensureResult(TARGET);

    const [first] = admin.createResult.mock.calls[0] as [
      { steps: { stepId: string; displayText: string; ttsText: string }[] },
    ];
    const lucky = first.steps.find((s) => s.stepId === "lucky_number");
    expect(lucky?.displayText).toBe("6");
    expect(lucky?.ttsText).toBe("6");
  });

  test("steps are stored under stepId even when providerMapping differs", async () => {
    const goodTime = step({ stepId: "good_time", providerMapping: "good_time_today" });
    const { service, admin } = makeService({
      repo: makeRepo([goodTime]),
      ai: makeAi({
        payloads: [
          {
            good_time_today: {
              en: "Late morning suits planning, important conversations and focused work today.",
              hi: "देर सुबह का समय योजना बनाने और जरूरी बातचीत के लिए अच्छा रहेगा।",
              mr: "उशिरा सकाळची वेळ नियोजन आणि महत्त्वाच्या संभाषणासाठी चांगली आहे.",
              te: "ఉదయం ఆలస్యంగా ప్రణాళిక మరియు ముఖ్యమైన సంభాషణలకు మంచి సమయం.",
            },
          },
        ],
      }).client,
    });

    await service.ensureResult(TARGET);
    const [first] = admin.createResult.mock.calls[0] as [
      { steps: { stepId: string }[] },
    ];
    expect(first.steps[0]?.stepId).toBe("good_time");
  });
});

describe("HoroscopeGenerationService — format + safety gates", () => {
  test("a payload with the wrong shape is retried, and the retry is stored", async () => {
    const { client } = makeAi({
      payloads: [{ namaste: "not an object", lucky_number: 6 }, goodPayload()],
    });
    const { service, admin } = makeService({ ai: client });

    await expect(service.ensureResult(TARGET)).resolves.toBe(true);
    expect(admin.createResult).toHaveBeenCalledTimes(GENERATION_LOCALES.length);
  });

  test("a payload that fails twice stores NOTHING and reports failure", async () => {
    const bad = { namaste: "not an object", lucky_number: 6 };
    const { client } = makeAi({ payloads: [bad, bad] });
    const { service, admin } = makeService({ ai: client });

    // ensureResult swallows the throw into `false` — the caller's contract is
    // "is content available", not "did generation succeed".
    await expect(service.ensureResult(TARGET)).resolves.toBe(false);
    expect(admin.createResult).not.toHaveBeenCalled();
  });

  test("deny-list content is never stored", async () => {
    // A medical cure claim, in Hindi. The English deny-list is unreachable from
    // the generation path now that `GENERATION_LOCALES` is Hindi-only — it stays
    // enforced on the SERVE path, where rows written before the narrowing (and
    // any admin-authored English copy) still flow through the same validator.
    const unsafe = goodPayload({
      namaste: { hi: "आज आपका रोग पूरी तरह ठीक हो जाएगा और दवा बंद कर दें।" },
    });
    const { client } = makeAi({ payloads: [unsafe, unsafe] });
    const { service, admin } = makeService({ ai: client });

    await expect(service.ensureResult(TARGET)).resolves.toBe(false);
    expect(admin.createResult).not.toHaveBeenCalled();
  });

  test("an Indic deny-list hit is caught even though the English patterns cannot see it", async () => {
    // The whole point of the Indic patterns, and now the ONLY guardrail on the
    // generation path: a financial guarantee written in Devanagari matches no
    // English regex, so before `INDIC_DENY_LIST` this payload was stored.
    const unsafe = goodPayload({
      namaste: { hi: "आज निश्चित लाभ होगा और आपका धन दोगुना होगा।" },
    });
    const { client } = makeAi({ payloads: [unsafe, unsafe] });
    const { service, admin } = makeService({ ai: client });

    await expect(service.ensureResult(TARGET)).resolves.toBe(false);
    expect(admin.createResult).not.toHaveBeenCalled();
  });

  test("safety is checked across EVERY locale before any row is written", async () => {
    // The pre-flight pass builds all locales, then writes — so a violation in
    // the last one cannot leave the earlier ones stored. With a single generated
    // locale there is no partial state to observe, so this asserts the reachable
    // half: a violation anywhere blocks the ENTIRE write, across both steps.
    // Restoring a locale to `GENERATION_LOCALES` should restore a case that puts
    // the violation in the LAST locale and asserts zero rows.
    const unsafe = goodPayload({
      namaste: { hi: "यह पूजा ही आपको बचा सकती है, महंगी पूजा जरूर कराएं।" },
    });
    const { client } = makeAi({ payloads: [unsafe, unsafe] });
    const { service, admin } = makeService({ ai: client });

    await expect(service.ensureResult(TARGET)).resolves.toBe(false);
    expect(admin.createResult).not.toHaveBeenCalled();
  });
});

describe("HoroscopeGenerationService — concurrency", () => {
  test("existing content short-circuits: no lock, no model call", async () => {
    const repo = makeRepo();
    repo.hasResultForSign.mockResolvedValue(true);
    const { client, completeJson } = makeAi();
    const { service, lock, admin } = makeService({ repo, ai: client });

    await expect(service.ensureResult(TARGET)).resolves.toBe(true);
    expect(completeJson).not.toHaveBeenCalled();
    expect(lock.acquire).not.toHaveBeenCalled();
    expect(admin.createResult).not.toHaveBeenCalled();
  });

  test("a lost lock waits for the holder's write instead of generating", async () => {
    const repo = makeRepo();
    // Missing on the pre-check, present by the time we poll.
    repo.hasResultForSign.mockResolvedValueOnce(false).mockResolvedValue(true);
    const { client, completeJson } = makeAi();
    const { service } = makeService({
      repo,
      ai: client,
      lock: makeLock(false),
      waitMs: 2_000,
    });

    await expect(service.ensureResult(TARGET)).resolves.toBe(true);
    expect(completeJson).not.toHaveBeenCalled();
  });

  test("a lost race on write is swallowed — the unique constraint is expected to fire", async () => {
    const admin = makeAdmin();
    admin.createResult
      .mockRejectedValueOnce(new AppError("already exists", 409, "CONFLICT"))
      .mockResolvedValue({ id: "r1" });
    const { service } = makeService({ admin });

    await expect(service.ensureResult(TARGET)).resolves.toBe(true);
    expect(admin.createResult).toHaveBeenCalledTimes(GENERATION_LOCALES.length);
  });

  test("a non-409 write failure is NOT swallowed", async () => {
    const admin = makeAdmin();
    admin.createResult.mockRejectedValue(
      new AppError("database exploded", 500, "INTERNAL")
    );
    const { service } = makeService({ admin });

    await expect(service.ensureResult(TARGET)).resolves.toBe(false);
  });

  test("the user's wait is bounded — a slow generation returns 'not ready'", async () => {
    let release!: (v: unknown) => void;
    const pending = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    const client: HoroscopeAiClient = {
      completeJson: vi.fn(() => pending),
    };
    const { service } = makeService({ ai: client, waitMs: 30 });

    // Generation is still in flight; the caller gives up and the endpoint
    // surfaces "being prepared" rather than holding the request open.
    await expect(service.ensureResult(TARGET)).resolves.toBe(false);

    release(goodPayload()); // let the background promise settle
  });
});

describe("HoroscopeGenerationService — warm sweep", () => {
  let repo: RepoMock;

  beforeEach(() => {
    repo = makeRepo();
  });

  test("generates only the signs missing content", async () => {
    repo.findZodiacIdsWithResults.mockResolvedValue(["taurus"]);
    const admin = makeAdmin();
    const { service } = makeService({ repo, admin });

    await service.warmMissing({ modeId: "daily_horoscope", dateIst: DATE_IST });

    // Only `aries` was missing → one row per generated locale, none for taurus.
    expect(admin.createResult).toHaveBeenCalledTimes(GENERATION_LOCALES.length);
    expect(
      admin.createResult.mock.calls.every(([p]) => (p as { zodiacId: string }).zodiacId === "aries")
    ).toBe(true);
  });

  test("a fully-covered day does no work at all", async () => {
    repo.findZodiacIdsWithResults.mockResolvedValue(["taurus", "aries"]);
    const { client, completeJson } = makeAi();
    const { service, admin } = makeService({ repo, ai: client });

    await service.warmMissing({ modeId: "daily_horoscope", dateIst: DATE_IST });

    expect(completeJson).not.toHaveBeenCalled();
    expect(admin.createResult).not.toHaveBeenCalled();
  });

  test("one sign failing does not abort the sweep", async () => {
    const admin = makeAdmin();
    admin.createResult.mockRejectedValueOnce(
      new AppError("boom", 500, "INTERNAL")
    );
    const { service } = makeService({ repo, admin });

    await expect(
      service.warmMissing({ modeId: "daily_horoscope", dateIst: DATE_IST })
    ).resolves.toBeUndefined();
  });

  test("a sign already being generated on demand is skipped", async () => {
    const lock = makeLock(false); // every acquire loses
    const { client, completeJson } = makeAi();
    const { service, admin } = makeService({ repo, ai: client, lock });

    await service.warmMissing({ modeId: "daily_horoscope", dateIst: DATE_IST });

    expect(completeJson).not.toHaveBeenCalled();
    expect(admin.createResult).not.toHaveBeenCalled();
  });
});

describe("HoroscopeGenerationService — configuration guards", () => {
  test("an empty step catalogue generates nothing", async () => {
    const { client, completeJson } = makeAi();
    const { service } = makeService({ repo: makeRepo([]), ai: client });

    await expect(service.ensureResult(TARGET)).resolves.toBe(false);
    expect(completeJson).not.toHaveBeenCalled();
  });

  test("an unknown zodiac slug generates nothing", async () => {
    const { client, completeJson } = makeAi();
    const { service } = makeService({ ai: client });

    await expect(
      service.ensureResult({ ...TARGET, zodiacId: "notasign" })
    ).resolves.toBe(false);
    expect(completeJson).not.toHaveBeenCalled();
  });
});
