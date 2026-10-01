import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import {
  fakeSubscriptionApi,
  freeStatus,
  proStatus,
} from "@api/shared/testing";
import type {
  MediaAssetRow,
  StepConfigRow,
  ZodiacRow,
} from "../../repositories/horoscope.repository.js";
import type {
  HoroscopeProvider,
  ProviderQuery,
  ProviderResult,
} from "../horoscope.provider.js";
import { HoroscopeService } from "../horoscope.service.js";

/**
 * Unit coverage for `HoroscopeService` (TAM-73). The repo AND the
 * `HoroscopeProvider` are mocked; the `subscription` FACADE is registered into
 * `GlobalServiceMap` as a fake so `performServiceCall` resolves the entitlement
 * check. Focus: the #EXPORT_CRITICAL Pro gate (fail-closed), the hi→en locale
 * fallback, the empty-config guard, the no-result error, and the grid localization.
 */

interface RepoMock {
  findEnabledZodiacSigns: Mock;
  findEnabledDailyMode: Mock;
  isZodiacEnabled: Mock;
  findEnabledSteps: Mock;
  findMediaAsset: Mock;
}

function makeRepo(): RepoMock {
  return {
    findEnabledZodiacSigns: vi.fn().mockResolvedValue([]),
    findEnabledDailyMode: vi.fn().mockResolvedValue({ modeId: "daily_horoscope" }),
    isZodiacEnabled: vi.fn().mockResolvedValue(true),
    findEnabledSteps: vi.fn().mockResolvedValue([stepConfig()]),
    findMediaAsset: vi.fn().mockResolvedValue(mediaRow()),
  };
}

function stepConfig(overrides: Partial<StepConfigRow> = {}): StepConfigRow {
  return {
    stepId: overrides.stepId ?? "namaste",
    modeId: "daily_horoscope",
    title: "Namaste",
    localizedTitle: { en: "Namaste", hi: "नमस्ते" },
    order: overrides.order ?? 0,
    contentType: "text",
    providerMapping: "namaste",
    ttsEnabled: true,
    safetyCategory: "greeting",
  };
}

function mediaRow(): MediaAssetRow {
  return {
    backgroundVideoUrl: "https://cdn.example.com/h.mp4",
    backgroundStaticFallbackUrl: "https://placehold.co/1080x1920",
    assetVersion: 1,
  };
}

function zodiacRow(overrides: Partial<ZodiacRow> = {}): ZodiacRow {
  return {
    zodiacId: overrides.zodiacId ?? "cancer",
    displayName: overrides.displayName ?? "Cancer",
    localizedDisplayName: overrides.localizedDisplayName ?? { en: "Cancer", hi: "कर्क" },
    iconAssetUrl: "https://placehold.co/128x128",
    sortOrder: overrides.sortOrder ?? 3,
  };
}

/** A fake provider that returns a safe result only for the locales in `available`. */
class FakeProvider implements HoroscopeProvider {
  calls: ProviderQuery[] = [];
  constructor(private readonly available: Set<string>) {}
  getDailyResult(query: ProviderQuery): Promise<ProviderResult | null> {
    this.calls.push(query);
    if (!this.available.has(query.languageCode)) return Promise.resolve(null);
    return Promise.resolve({
      providerName: "cms",
      contentSafetyStatus: "passed",
      steps: [
        {
          stepId: "namaste",
          title: "Namaste",
          displayText: "Namaste, dear Cancer. Have a calm day.",
          ttsText: "Namaste, dear Cancer. Have a calm day.",
          order: 0,
          contentType: "text",
          ttsEnabled: true,
        },
      ],
    });
  }
}

let subscriptionStatus: "active" | "free";
function registerSubscription(): void {
  registerGlobalService(
    "subscription",
    fakeSubscriptionApi({
      // The gate reads `isEntitled`, not `status` — `trialing` and in-grace
      // `past_due` are entitled too, and a lapsed `active` is not.
      getStatus: () =>
        Promise.resolve(
          subscriptionStatus === "active" ? proStatus() : freeStatus()
        ),
    })
  );
}

let repo: RepoMock;

beforeEach(() => {
  subscriptionStatus = "active";
  repo = makeRepo();
  registerSubscription();
});

afterEach(() => {
  clearGlobalServices();
  vi.restoreAllMocks();
});

function svc(provider: HoroscopeProvider): HoroscopeService {
  return new HoroscopeService(repo as never, provider);
}

describe("getZodiacSigns (FREE grid)", () => {
  test("localizes to the requested locale, falling back to the canonical label", async () => {
    repo.findEnabledZodiacSigns.mockResolvedValue([
      zodiacRow({ zodiacId: "cancer", localizedDisplayName: { en: "Cancer", hi: "कर्क" } }),
      zodiacRow({ zodiacId: "leo", localizedDisplayName: { en: "Leo" } }),
    ]);
    const hi = await svc(new FakeProvider(new Set())).getZodiacSigns("hi");
    expect(hi[0]?.displayName).toBe("कर्क");
    // leo has no hi → falls back to en label.
    expect(hi[1]?.displayName).toBe("Leo");
  });
});

describe("#EXPORT_CRITICAL Pro gate (fail-closed)", () => {
  test("free user → 403 and the provider is NEVER called (no steps assembled)", async () => {
    subscriptionStatus = "free";
    const provider = new FakeProvider(new Set(["en", "hi"]));
    await expect(
      svc(provider).getDailyResult({ userId: "u", zodiacId: "cancer", localeRequested: "en" })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(provider.calls).toHaveLength(0);
  });

  test("entitlement facade error → fails closed to 403", async () => {
    clearGlobalServices();
    registerGlobalService(
      "subscription",
      fakeSubscriptionApi({
        getStatus: () => Promise.reject(new Error("boom")),
      })
    );
    const provider = new FakeProvider(new Set(["en"]));
    await expect(
      svc(provider).getDailyResult({ userId: "u", zodiacId: "cancer", localeRequested: "en" })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(provider.calls).toHaveLength(0);
  });
});

describe("daily result (Pro)", () => {
  test("requested locale present → served with no fallback", async () => {
    const provider = new FakeProvider(new Set(["en", "hi"]));
    const res = await svc(provider).getDailyResult({
      userId: "u",
      zodiacId: "cancer",
      localeRequested: "en",
    });
    expect(res.localeServed).toBe("en");
    expect(res.fallbackUsed).toBe(false);
    expect(res.steps).toHaveLength(1);
    expect(res.contentSafetyStatus).toBe("passed");
    expect(res.media.assetVersion).toBe(1);
  });

  test("unsupported locale (ta) → falls back to hi", async () => {
    const provider = new FakeProvider(new Set(["hi", "en"]));
    const res = await svc(provider).getDailyResult({
      userId: "u",
      zodiacId: "cancer",
      localeRequested: "ta",
    });
    expect(res.localeServed).toBe("hi");
    expect(res.fallbackUsed).toBe(true);
    // Tried ta first, then hi.
    expect(provider.calls.map((c) => c.languageCode)).toEqual(["ta", "hi"]);
  });

  test("falls back all the way to en", async () => {
    const provider = new FakeProvider(new Set(["en"]));
    const res = await svc(provider).getDailyResult({
      userId: "u",
      zodiacId: "cancer",
      localeRequested: "ta",
    });
    expect(res.localeServed).toBe("en");
    expect(provider.calls.map((c) => c.languageCode)).toEqual(["ta", "hi", "en"]);
  });

  test("no result in any locale → 404 RESULT_NOT_FOUND", async () => {
    const provider = new FakeProvider(new Set());
    await expect(
      svc(provider).getDailyResult({ userId: "u", zodiacId: "cancer", localeRequested: "en" })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test("unknown/disabled zodiac → 404", async () => {
    repo.isZodiacEnabled.mockResolvedValue(false);
    const provider = new FakeProvider(new Set(["en"]));
    await expect(
      svc(provider).getDailyResult({ userId: "u", zodiacId: "cancer", localeRequested: "en" })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(provider.calls).toHaveLength(0);
  });

  test("empty step config → 409 (configuration error, not empty success)", async () => {
    repo.findEnabledSteps.mockResolvedValue([]);
    const provider = new FakeProvider(new Set(["en"]));
    await expect(
      svc(provider).getDailyResult({ userId: "u", zodiacId: "cancer", localeRequested: "en" })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(provider.calls).toHaveLength(0);
  });
});

/**
 * The AI content pipeline's wiring into the read path.
 *
 * The generator itself is covered in `generation/__tests__`; what matters here
 * is that it is OPTIONAL and correctly sequenced — with it absent the service
 * behaves exactly as it always has, and with it present it runs only when the
 * stored read came up empty.
 */
describe("generation wiring", () => {
  function makeGeneration(ensure: boolean) {
    return {
      ensureResult: vi.fn().mockResolvedValue(ensure),
      warmMissing: vi.fn().mockResolvedValue(undefined),
    };
  }
  function makeLock() {
    return {
      acquire: vi.fn().mockResolvedValue(async () => {}),
      claimWarmWindow: vi.fn().mockResolvedValue(true),
    };
  }
  function svcWith(
    provider: HoroscopeProvider,
    generation: ReturnType<typeof makeGeneration>,
    lock = makeLock()
  ): HoroscopeService {
    return new HoroscopeService(
      repo as never,
      provider,
      generation as never,
      lock as never
    );
  }

  test("no generator wired → a missing reading is still a 404, nothing is generated", async () => {
    // The kill switch is structural: with no OPENAI_API_KEY configured the
    // composition root passes no generator at all.
    const provider = new FakeProvider(new Set());
    await expect(
      svc(provider).getDailyResult({ userId: "u", zodiacId: "cancer", localeRequested: "en" })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test("stored content short-circuits — the generator is never consulted", async () => {
    const generation = makeGeneration(true);
    const provider = new FakeProvider(new Set(["en"]));

    await svcWith(provider, generation).getDailyResult({
      userId: "u",
      zodiacId: "cancer",
      localeRequested: "en",
    });

    expect(generation.ensureResult).not.toHaveBeenCalled();
  });

  test("empty read → generates, then re-resolves and serves", async () => {
    const generation = makeGeneration(true);
    // Empty on the first pass, populated once generation reports success.
    let generated = false;
    const provider: HoroscopeProvider = {
      getDailyResult: vi.fn(() =>
        Promise.resolve(
          generated
            ? {
                providerName: "openai",
                contentSafetyStatus: "passed",
                steps: [
                  {
                    stepId: "namaste",
                    title: "Namaste",
                    displayText: "Namaste, dear Cancer. Have a calm day.",
                    ttsText: "Namaste, dear Cancer. Have a calm day.",
                    order: 0,
                    contentType: "text" as const,
                    ttsEnabled: true,
                  },
                ],
              }
            : null
        )
      ),
    };
    generation.ensureResult.mockImplementation(() => {
      generated = true;
      return Promise.resolve(true);
    });

    const result = await svcWith(provider, generation).getDailyResult({
      userId: "u",
      zodiacId: "cancer",
      localeRequested: "en",
    });

    const target = generation.ensureResult.mock.calls[0]?.[0] as {
      zodiacId: string;
      modeId: string;
      dateIst: string;
    };
    expect(target.zodiacId).toBe("cancer");
    expect(target.modeId).toBe("daily_horoscope");
    // The IST civil date, resolved server-side — never a client-supplied one.
    expect(target.dateIst).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.providerName).toBe("openai");
  });

  test("generation still running → 409 GENERATION_IN_PROGRESS, not 404", async () => {
    // The distinction is user-visible: the app renders 409 as "isn't ready yet"
    // with a Retry, and 404 as a generic failure.
    const generation = makeGeneration(false);
    const provider = new FakeProvider(new Set());

    await expect(
      svcWith(provider, generation).getDailyResult({
        userId: "u",
        zodiacId: "cancer",
        localeRequested: "en",
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "GENERATION_IN_PROGRESS",
    });
  });

  test("a free caller never reaches generation — the Pro gate runs first", async () => {
    subscriptionStatus = "free";
    const generation = makeGeneration(true);
    const provider = new FakeProvider(new Set());

    await expect(
      svcWith(provider, generation).getDailyResult({
        userId: "u",
        zodiacId: "cancer",
        localeRequested: "en",
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    // Not merely unserved — a free tap must not be able to spend money on a
    // model call.
    expect(generation.ensureResult).not.toHaveBeenCalled();
  });

  test("the FREE grid kicks a warm sweep without blocking on it", async () => {
    const generation = makeGeneration(true);
    const lock = makeLock();
    repo.findEnabledZodiacSigns.mockResolvedValue([zodiacRow()]);

    const signs = await svcWith(new FakeProvider(new Set()), generation, lock)
      .getZodiacSigns("hi");

    expect(signs).toHaveLength(1); // served immediately
    await vi.waitFor(() => expect(generation.warmMissing).toHaveBeenCalled());
  });

  test("a losing warm-window claim does no work", async () => {
    const generation = makeGeneration(true);
    const lock = makeLock();
    lock.claimWarmWindow.mockResolvedValue(false);
    repo.findEnabledZodiacSigns.mockResolvedValue([zodiacRow()]);

    await svcWith(new FakeProvider(new Set()), generation, lock).getZodiacSigns("hi");
    await vi.waitFor(() => expect(lock.claimWarmWindow).toHaveBeenCalled());
    expect(generation.warmMissing).not.toHaveBeenCalled();
  });

  test("a failing warm sweep never breaks the grid", async () => {
    const generation = makeGeneration(true);
    generation.warmMissing.mockRejectedValue(new Error("openai is down"));
    repo.findEnabledZodiacSigns.mockResolvedValue([zodiacRow()]);

    await expect(
      svcWith(new FakeProvider(new Set()), generation).getZodiacSigns("hi")
    ).resolves.toHaveLength(1);
    await vi.waitFor(() => expect(generation.warmMissing).toHaveBeenCalled());
  });
});
