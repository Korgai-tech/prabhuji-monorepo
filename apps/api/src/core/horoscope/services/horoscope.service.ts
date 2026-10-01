import { resolveProEntitlement } from "@api/shared/entitlement";
import { createModuleLogger } from "@api/shared/logs";
import { AppError } from "@api/shared/errors";
import { resolveDateIst } from "@api/shared/time";
import type {
  HoroscopeRepository,
  StepConfigRow,
} from "@api/core/horoscope/repositories";
import {
  DAILY_MODE_ID,
  FALLBACK_LOCALES,
  CONTENT_SAFETY_STATUS,
  type DailyResult,
  type DailyStep,
  type ZodiacCard,
} from "@api/core/horoscope/types";
import type { HoroscopeProvider } from "./horoscope.provider.js";
import { validateContentSafety } from "./content-safety.js";
import type {
  HoroscopeGenerationService,
  HoroscopeGenerationLock,
} from "./generation/index.js";

const log = createModuleLogger("horoscope:service");

/**
 * How long one claimed warm sweep suppresses the next. Long enough that a busy
 * tab does not re-check Postgres per request, short enough that a sweep which
 * failed halfway is retried within the same session.
 */
const WARM_WINDOW_MS = 10 * 60 * 1000;

/** The asset key for the shared result-background media (single seeded row). */
const RESULT_MEDIA_KEY = "horoscope_daily_result";
/** Default locale for grid labels when a sign has no localized entry. */
const DEFAULT_LOCALE = "en";

/**
 * Horoscope business logic (TAM-73) — Prisma-free. DISCOVERY IS FREE, RESULTS ARE
 * PRO. Responsibilities:
 *   1. Zodiac grid (FREE) — localized names + icon URLs, ordered.
 *   2. #EXPORT_CRITICAL entitlement gate on the daily result — Pro is resolved
 *      server-side via the `subscription` facade, FAIL-CLOSED (any error → free →
 *      403, no step payload). The steps are NEVER assembled for a free caller.
 *   3. Deterministic daily result via the `HoroscopeProvider` INTERFACE (never a
 *      concrete engine): resolve the IST civil date, load the enabled step
 *      catalogue, apply the hi→en locale fallback, re-run content safety, attach
 *      media. Empty step config → configuration error (never empty success).
 *
 * The entitlement gate lives HERE (not the controller) to mirror the sibling
 * aarti/mantras fail-closed pattern and keep it unit-testable — the controller
 * stays a thin HTTP boundary.
 */
export class HoroscopeService {
  constructor(
    private readonly repo: HoroscopeRepository,
    private readonly provider: HoroscopeProvider,
    /**
     * The content pipeline. OPTIONAL: absent when no OPENAI_API_KEY is
     * configured, in which case this service behaves exactly as it did before —
     * a missing reading is a 404 and no model is ever called. Fail-closed by
     * construction rather than by a runtime flag check scattered through the
     * methods.
     */
    private readonly generation?: HoroscopeGenerationService,
    private readonly generationLock?: HoroscopeGenerationLock
  ) {}

  // ---- zodiac grid (FREE) -------------------------------------------------

  /** The 12 enabled signs ordered by `sortOrder`, localized to `locale`. FREE. */
  async getZodiacSigns(locale: string): Promise<ZodiacCard[]> {
    const rows = await this.repo.findEnabledZodiacSigns();

    // The grid is loaded when the user opens the Horoscope tab — seconds before
    // they can tap a sign. Warming here moves the cold-start model call into
    // that gap, so the Pro-gated request usually finds finished content. The
    // grid itself is never delayed by it.
    this.kickWarmSweep();

    return rows.map((r) => ({
      zodiacId: r.zodiacId,
      displayName:
        r.localizedDisplayName[locale] ??
        r.localizedDisplayName[DEFAULT_LOCALE] ??
        r.displayName,
      iconAssetUrl: r.iconAssetUrl,
      sortOrder: r.sortOrder,
    }));
  }

  // ---- daily result (PRO-GATED) -------------------------------------------

  /**
   * `GET /horoscope/daily` — Pro-gated. Resolves entitlement server-side and
   * throws `403` BEFORE assembling any steps for a free caller.
   */
  async getDailyResult(params: {
    userId: string;
    zodiacId: string;
    localeRequested: string;
  }): Promise<DailyResult> {
    const { userId, zodiacId, localeRequested } = params;

    // 1. #EXPORT_CRITICAL — Pro gate first, fail-closed. No step payload is ever
    //    built for a non-Pro caller.
    const isPro = await this.resolveEntitlement(userId);
    if (!isPro) {
      throw new AppError(
        "Daily horoscope is a Prabhuji Pro benefit",
        403,
        "FORBIDDEN"
      );
    }

    // 2. Validate the sign is a real, enabled grid member.
    if (!(await this.repo.isZodiacEnabled(zodiacId))) {
      throw new AppError("Unknown zodiac sign", 404, "ZODIAC_NOT_FOUND");
    }

    // 3. Resolve the single enabled daily mode.
    const mode = await this.repo.findEnabledDailyMode(DAILY_MODE_ID);
    if (!mode) {
      throw new AppError(
        "Daily horoscope is being prepared",
        409,
        "HOROSCOPE_MODE_DISABLED"
      );
    }

    // 4. Empty-config guard — a mode with zero enabled steps returns a config
    //    error, NEVER an empty `steps: []` success (PRD §7).
    const enabledSteps = await this.repo.findEnabledSteps(mode.modeId);
    if (enabledSteps.length === 0) {
      log.warn(
        { event: "horoscope_empty_step_config", mode_id: mode.modeId },
        "no enabled steps configured for mode — returning configuration error"
      );
      throw new AppError(
        "Daily horoscope is being prepared",
        409,
        "EMPTY_STEP_CONFIG"
      );
    }

    // 5. IST civil date (never UTC).
    const dateIst = resolveDateIst();

    // 6. Locale fallback: requested → hi → en (deduped). First provider hit wins.
    const candidates = dedupe([localeRequested, ...FALLBACK_LOCALES]);
    let served = await this.resolveServed({
      candidates,
      zodiacId,
      dateIst,
      modeId: mode.modeId,
      enabledSteps,
    });

    // 6b. Nothing stored for today. If the content pipeline is wired, generate
    //     now and re-resolve. This runs AFTER the read attempt, not before, so
    //     the overwhelmingly common case (content already exists) costs no
    //     extra query — generation is the fallback, never the happy path.
    if (!served && this.generation) {
      const ready = await this.generation.ensureResult({
        zodiacId,
        modeId: mode.modeId,
        dateIst,
      });
      if (!ready) {
        // Generation is still running (or just failed). "Being prepared" is
        // both true and already handled by the client, which renders it with a
        // Retry — a retry that will find finished content moments later.
        throw new AppError(
          "Daily horoscope is being prepared",
          409,
          "GENERATION_IN_PROGRESS"
        );
      }
      served = await this.resolveServed({
        candidates,
        zodiacId,
        dateIst,
        modeId: mode.modeId,
        enabledSteps,
      });
    }

    if (!served) {
      throw new AppError(
        "Today's horoscope is not available yet",
        404,
        "RESULT_NOT_FOUND"
      );
    }

    // 8. Media (shared result background). Missing → configuration error.
    const media = await this.repo.findMediaAsset(RESULT_MEDIA_KEY);
    if (!media) {
      throw new AppError(
        "Daily horoscope is being prepared",
        409,
        "MEDIA_NOT_CONFIGURED"
      );
    }

    const fallbackUsed = served.localeServed !== localeRequested;
    if (fallbackUsed) {
      log.info(
        {
          event: "horoscope_locale_fallback",
          zodiac_id: zodiacId,
          locale_requested: localeRequested,
          locale_served: served.localeServed,
        },
        "served a fallback locale"
      );
    }

    return {
      zodiacId,
      modeId: mode.modeId,
      dateIst,
      localeRequested,
      localeServed: served.localeServed,
      fallbackUsed,
      contentSafetyStatus: CONTENT_SAFETY_STATUS,
      providerName: served.providerName,
      steps: served.steps,
      media: {
        backgroundVideoUrl: media.backgroundVideoUrl,
        backgroundStaticFallbackUrl: media.backgroundStaticFallbackUrl,
        assetVersion: media.assetVersion,
      },
    };
  }

  // ---- internals ----------------------------------------------------------

  /**
   * Walk the locale-fallback chain and return the first stored hit, with content
   * safety ENFORCED on the way out.
   *
   * Extracted so the generation path can re-run the identical resolution after
   * writing, rather than keeping a second, subtly different copy of the fallback
   * and safety rules.
   */
  private async resolveServed(params: {
    candidates: string[];
    zodiacId: string;
    dateIst: string;
    modeId: string;
    enabledSteps: StepConfigRow[];
  }): Promise<{
    localeServed: string;
    steps: DailyStep[];
    providerName: string;
  } | null> {
    const { candidates, zodiacId, dateIst, modeId, enabledSteps } = params;

    for (const candidate of candidates) {
      const result = await this.provider.getDailyResult({
        zodiacId,
        dateIst,
        languageCode: candidate,
        modeId,
        enabledSteps,
      });
      if (!result) continue;

      // Content safety — ENFORCED on serve. Prohibited content is never
      // returned; a violation is a loud configuration error, not a fallback.
      for (const step of result.steps) {
        const verdict = validateContentSafety({
          title: step.title,
          displayText: step.displayText,
          ttsText: step.ttsText,
        });
        if (!verdict.passed) {
          log.error(
            {
              event: "horoscope_content_safety_block",
              zodiac_id: zodiacId,
              date_ist: dateIst,
              language_code: candidate,
              step_id: step.stepId,
              category: verdict.category,
            },
            "served content failed the safety validator — blocking"
          );
          throw new AppError(
            "Daily horoscope is temporarily unavailable",
            409,
            "CONTENT_SAFETY_BLOCKED"
          );
        }
      }

      return {
        localeServed: candidate,
        providerName: result.providerName,
        steps: result.steps.map((s) => ({
          stepId: s.stepId,
          title: s.title,
          displayText: s.displayText,
          ttsText: s.ttsText,
          order: s.order,
          contentType: s.contentType,
          ttsEnabled: s.ttsEnabled,
        })),
      };
    }
    return null;
  }

  /**
   * Kick a background sweep for anything missing today, at most once per window.
   *
   * Fire-and-forget BY DESIGN: the zodiac grid is free, is the first thing the
   * Horoscope tab loads, and must never be slowed — let alone broken — by the
   * content pipeline. Every failure path here is swallowed into a log.
   */
  private kickWarmSweep(): void {
    const generation = this.generation;
    const lock = this.generationLock;
    if (!generation || !lock) return;

    const dateIst = resolveDateIst();
    void (async () => {
      // One process claims the window; the rest skip without touching Postgres.
      if (!(await lock.claimWarmWindow(dateIst, WARM_WINDOW_MS))) return;
      await generation.warmMissing({ modeId: DAILY_MODE_ID, dateIst });
    })().catch((err: unknown) => {
      log.warn(
        {
          event: "horoscope_warm_sweep_failed",
          err: err instanceof Error ? err.message : String(err),
        },
        "background horoscope warm sweep failed — serving is unaffected"
      );
    });
  }

  /**
   * Resolve Pro entitlement server-side (#EXPORT_CRITICAL). Delegates to the
   * shared gate, which is FAIL-CLOSED: any error resolving the subscription
   * facade → treat as free (no result), never fail open.
   */
  private async resolveEntitlement(userId: string): Promise<boolean> {
    return resolveProEntitlement(userId, "horoscope:entitlement");
  }
}

/** Order-preserving de-duplication of locale candidates. */
function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
