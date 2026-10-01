import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import type {
  DailyResultRow,
  StepConfigRow,
} from "../../repositories/horoscope.repository.js";
import { CmsHoroscopeProvider } from "../horoscope.provider.js";

/**
 * Unit coverage for `CmsHoroscopeProvider` (TAM-73). The repo is mocked. Proves
 * the provider reads seeded rows only (no network), returns deterministic ordered
 * steps for a key, and treats the ENABLED STEP CONFIG as authoritative for order
 * + title (reorder/rename without reseed).
 */

interface RepoMock {
  findDailyResult: Mock;
}

function makeRepo(): RepoMock {
  return { findDailyResult: vi.fn().mockResolvedValue(null) };
}

function step(
  stepId: string,
  order: number,
  overrides: Partial<StepConfigRow> = {}
): StepConfigRow {
  return {
    stepId,
    modeId: "daily_horoscope",
    title: overrides.title ?? `${stepId} EN`,
    localizedTitle: overrides.localizedTitle ?? { en: `${stepId} EN`, hi: `${stepId} HI` },
    order,
    contentType: overrides.contentType ?? "text",
    providerMapping: stepId,
    ttsEnabled: overrides.ttsEnabled ?? true,
    safetyCategory: "general",
  };
}

function resultRow(overrides: Partial<DailyResultRow> = {}): DailyResultRow {
  return {
    zodiacId: "taurus",
    modeId: "daily_horoscope",
    dateIst: "2026-07-14",
    languageCode: "en",
    providerName: "cms",
    contentSafetyStatus: "passed",
    steps: overrides.steps ?? [
      { stepId: "namaste", title: "Namaste", displayText: "Hello", ttsText: "Hello", order: 0, contentType: "text" },
      { stepId: "good_time", title: "Good time", displayText: "Nice", ttsText: "Nice", order: 1, contentType: "text" },
    ],
    ...overrides,
  };
}

let repo: RepoMock;
let provider: CmsHoroscopeProvider;

beforeEach(() => {
  repo = makeRepo();
  provider = new CmsHoroscopeProvider(repo as never);
});

describe("getDailyResult", () => {
  test("returns null when no stored row exists for the key", async () => {
    repo.findDailyResult.mockResolvedValue(null);
    const res = await provider.getDailyResult({
      zodiacId: "taurus",
      dateIst: "2026-07-14",
      languageCode: "en",
      modeId: "daily_horoscope",
      enabledSteps: [step("namaste", 0)],
    });
    expect(res).toBeNull();
  });

  test("returns steps in CONFIG order with the config's localized title", async () => {
    repo.findDailyResult.mockResolvedValue(
      resultRow({
        steps: [
          { stepId: "good_time", title: "old", displayText: "B", ttsText: "B", order: 9, contentType: "text" },
          { stepId: "namaste", title: "old", displayText: "A", ttsText: "A", order: 9, contentType: "text" },
        ],
      })
    );
    // Config declares namaste before good_time and RENAMES the titles.
    const res = await provider.getDailyResult({
      zodiacId: "taurus",
      dateIst: "2026-07-14",
      languageCode: "hi",
      modeId: "daily_horoscope",
      enabledSteps: [step("namaste", 0), step("good_time", 1)],
    });
    expect(res?.steps.map((s) => s.stepId)).toEqual(["namaste", "good_time"]);
    // Title comes from the CONFIG's localizedTitle for the served locale (hi).
    expect(res?.steps[0]?.title).toBe("namaste HI");
    // displayText/ttsText come from the stored row.
    expect(res?.steps[0]?.displayText).toBe("A");
  });

  test("drops an enabled step that has no stored content", async () => {
    repo.findDailyResult.mockResolvedValue(
      resultRow({
        steps: [
          { stepId: "namaste", title: "n", displayText: "A", ttsText: "A", order: 0, contentType: "text" },
        ],
      })
    );
    const res = await provider.getDailyResult({
      zodiacId: "taurus",
      dateIst: "2026-07-14",
      languageCode: "en",
      modeId: "daily_horoscope",
      enabledSteps: [step("namaste", 0), step("lucky_number", 1)],
    });
    expect(res?.steps.map((s) => s.stepId)).toEqual(["namaste"]);
  });

  test("is deterministic — two identical calls return identical steps", async () => {
    repo.findDailyResult.mockResolvedValue(resultRow());
    const q = {
      zodiacId: "taurus",
      dateIst: "2026-07-14",
      languageCode: "en",
      modeId: "daily_horoscope",
      enabledSteps: [step("namaste", 0), step("good_time", 1)],
    };
    const a = await provider.getDailyResult(q);
    const b = await provider.getDailyResult(q);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("returns null when no enabled step has stored content", async () => {
    repo.findDailyResult.mockResolvedValue(
      resultRow({
        steps: [
          { stepId: "orphan", title: "o", displayText: "x", ttsText: "x", order: 0, contentType: "text" },
        ],
      })
    );
    const res = await provider.getDailyResult({
      zodiacId: "taurus",
      dateIst: "2026-07-14",
      languageCode: "en",
      modeId: "daily_horoscope",
      enabledSteps: [step("namaste", 0)],
    });
    expect(res).toBeNull();
  });
});
