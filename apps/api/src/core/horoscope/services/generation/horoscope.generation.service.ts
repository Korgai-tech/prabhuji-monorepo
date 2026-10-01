import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import type {
  HoroscopeAiClient,
  HoroscopeRepository,
  StepConfigRow,
} from "@api/core/horoscope/repositories";
import {
  GENERATION_LOCALES,
  type AdminResultStep,
  type GenerationLocale,
} from "@api/core/horoscope/types";
import type { HoroscopeAdminService } from "../horoscope.admin.service.js";
import { validateContentSafety } from "../content-safety.js";
import { buildResultSchema, buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import {
  validateGeneratedResult,
  type GeneratedSection,
} from "./response-validator.js";
import type { HoroscopeGenerationLock } from "./generation-lock.js";

const log = createModuleLogger("horoscope:generation");

/** Recorded on every generated row, so a bad batch is findable by provider. */
const PROVIDER_NAME = "openai";

/**
 * Attempts per sign. The second attempt exists because the failures this
 * retries — a drifted payload shape, a safety hit — are stochastic and usually
 * clear on a resample. A third would mostly spend money re-rolling a prompt
 * problem that a retry cannot fix.
 */
const MAX_ATTEMPTS = 2;

/** How often the non-holder polls for the holder's write to land. */
const POLL_INTERVAL_MS = 750;

/** Concurrent generations during a warm sweep. Low: this is background work. */
const WARM_CONCURRENCY = 3;

export interface GenerationTarget {
  zodiacId: string;
  modeId: string;
  dateIst: string;
}

/**
 * Generates a day's horoscope content with an LLM and stores it (TAM-73 content
 * pipeline).
 *
 * ## Why this is not a `HoroscopeProvider`
 *
 * The module's provider seam anticipated an `AiHoroscopeProvider` swapped in at
 * the composition root. That shape assumed a SYNCHRONOUS engine. This pipeline
 * is generate-once-validate-store: the provider is a READ seam invoked per
 * `(sign, date, locale, mode)` inside the service's fallback-locale loop, so
 * implementing it here would generate per request and re-generate once per
 * candidate locale. `CmsHoroscopeProvider` stays the reader; this is a writer
 * that fills the table it reads.
 *
 * ## Write path
 *
 * Storage goes through `HoroscopeAdminService.createResult` rather than the
 * repository, deliberately. That method already cross-validates steps against
 * the config, RE-RUNS the content-safety guardrail and SERVER-COMPUTES
 * `contentSafetyStatus`. Writing around it would mean a second write path with
 * its own (drifting) copy of those rules, and the guarantee "nothing stored was
 * unvalidated" would depend on which path a row came through.
 */
export class HoroscopeGenerationService {
  constructor(
    private readonly ai: HoroscopeAiClient,
    private readonly repo: HoroscopeRepository,
    private readonly admin: HoroscopeAdminService,
    private readonly lock: HoroscopeGenerationLock,
    /** Ceiling on how long a USER request waits. Not a ceiling on generation. */
    private readonly waitMs: number
  ) {}

  /**
   * Ensure content exists for one sign, bounded by the caller's patience.
   *
   * Returns true when content is available to read, false when the caller
   * should surface "being prepared". A false does NOT mean generation failed —
   * it usually means generation is still running and will land shortly.
   */
  async ensureResult(target: GenerationTarget): Promise<boolean> {
    if (await this.repo.hasResultForSign(target)) return true;

    const release = await this.lock.acquire(target.zodiacId, target.dateIst);
    if (!release) {
      // Someone else is generating this exact key. Wait for THEIR write rather
      // than starting a second identical generation.
      return this.pollForResult(target);
    }

    const running = this.generate(target)
      .catch((err: unknown) => {
        log.error(
          {
            event: "horoscope_generation_failed",
            zodiac_id: target.zodiacId,
            date_ist: target.dateIst,
            err: err instanceof Error ? err.message : String(err),
          },
          "generation failed"
        );
        return false;
      })
      .finally(() => void release());

    // Race the generation against the user's patience. On timeout the promise
    // is NOT abandoned — it keeps running to completion in the background, so
    // the user's retry (or the next user) finds finished content. The `.catch`
    // above is what keeps that orphaned promise from becoming an unhandled
    // rejection once nobody is awaiting it.
    return this.raceWithDeadline(running);
  }

  /**
   * Background sweep: generate every sign missing content for `dateIst`.
   *
   * Called fire-and-forget from the FREE zodiac-grid read, which fires when the
   * user opens the Horoscope tab — seconds before they can tap a sign. That
   * ordering is the whole point: it moves the cold-start cost off the Pro-gated
   * request and into a window where nobody is waiting.
   */
  async warmMissing(params: { modeId: string; dateIst: string }): Promise<void> {
    const [signs, existing] = await Promise.all([
      this.repo.findEnabledZodiacSigns(),
      this.repo.findZodiacIdsWithResults(params),
    ]);
    const done = new Set(existing);
    const missing = signs.filter((s) => !done.has(s.zodiacId));
    if (missing.length === 0) return;

    log.info(
      {
        event: "horoscope_warm_sweep_start",
        date_ist: params.dateIst,
        missing: missing.length,
      },
      "warming missing horoscope content"
    );

    // Bounded concurrency: a dozen simultaneous generations would spike both
    // the provider's rate limit and our own connection pool for work that is,
    // by construction, not urgent.
    const queue = [...missing];
    const workers = Array.from(
      { length: Math.min(WARM_CONCURRENCY, queue.length) },
      async () => {
        for (;;) {
          const sign = queue.shift();
          if (!sign) return;
          const target = {
            zodiacId: sign.zodiacId,
            modeId: params.modeId,
            dateIst: params.dateIst,
          };
          const release = await this.lock.acquire(sign.zodiacId, params.dateIst);
          // No lock => an on-demand request is already generating this sign.
          if (!release) continue;
          try {
            await this.generate(target);
          } catch (err) {
            log.error(
              {
                event: "horoscope_warm_generation_failed",
                zodiac_id: sign.zodiacId,
                date_ist: params.dateIst,
                err: err instanceof Error ? err.message : String(err),
              },
              "warm generation failed for one sign"
            );
          } finally {
            await release();
          }
        }
      }
    );
    await Promise.all(workers);
  }

  // ---- internals ---------------------------------------------------------

  /**
   * One sign, end to end: prompt -> model -> FORMAT validation -> content
   * safety -> store every locale. Returns true once content is stored.
   */
  private async generate(target: GenerationTarget): Promise<boolean> {
    const steps = await this.repo.findEnabledSteps(target.modeId);
    if (steps.length === 0) {
      // The service's own empty-config guard already turns this into a 409 on
      // the read path; generating against an empty catalogue would produce an
      // empty object and store nothing useful.
      throw new AppError(
        "no enabled steps configured — nothing to generate",
        409,
        "EMPTY_STEP_CONFIG"
      );
    }

    const signs = await this.repo.findEnabledZodiacSigns();
    const sign = signs.find((s) => s.zodiacId === target.zodiacId);
    if (!sign) {
      throw new AppError("Unknown zodiac sign", 404, "ZODIAC_NOT_FOUND");
    }

    const schema = buildResultSchema(steps);
    const system = buildSystemPrompt(steps);
    const user = buildUserPrompt({
      zodiacDisplayName: sign.displayName,
      // Seeded, native-reviewed labels — see `buildUserPrompt`. Without them the
      // model translates the sign name itself and can name the wrong sign.
      localizedZodiacNames: sign.localizedDisplayName,
      dateIst: target.dateIst,
    });

    let lastReason = "unknown";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const raw = await this.ai.completeJson({
        system,
        user,
        schemaName: "horoscope_daily_result",
        schema,
        temperature: 0.6,
        // Four languages x eight sections needs real headroom; the spec's 500
        // is sized for one language.
        maxOutputTokens: 4000,
      });

      const validated = validateGeneratedResult(raw, steps);
      if (!validated.ok) {
        lastReason = validated.reason;
        log.warn(
          {
            event: "horoscope_generation_malformed",
            zodiac_id: target.zodiacId,
            date_ist: target.dateIst,
            attempt,
            reason: validated.reason,
          },
          "generated payload did not match the expected format"
        );
        continue;
      }
      // Build every locale's steps BEFORE writing any of them, so a safety
      // failure in the fourth locale cannot leave the first three stored.
      const perLocale = GENERATION_LOCALES.map((locale) => ({
        locale,
        steps: this.toSteps(validated.sections, steps, locale),
      }));

      const unsafe = this.firstSafetyViolation(perLocale);
      if (unsafe) {
        lastReason = unsafe;
        log.warn(
          {
            event: "horoscope_generation_unsafe",
            zodiac_id: target.zodiacId,
            date_ist: target.dateIst,
            attempt,
            reason: unsafe,
          },
          "generated content failed the deny-list guardrail"
        );
        continue;
      }

      await this.store(target, perLocale);
      log.info(
        {
          event: "horoscope_generation_stored",
          zodiac_id: target.zodiacId,
          date_ist: target.dateIst,
          locales: GENERATION_LOCALES.length,
          attempt,
        },
        "generated and stored daily horoscope content"
      );
      return true;
    }

    // Deliberately NOT stored. An uncontented day surfaces as "being prepared"
    // and is recoverable on the next request; storing content that failed
    // validation is not.
    throw new AppError(
      `generation failed after ${MAX_ATTEMPTS} attempts: ${lastReason}`,
      502,
      "GENERATION_FAILED"
    );
  }

  /** Map one locale's slice of the payload onto the stored step shape. */
  private toSteps(
    sections: Map<string, GeneratedSection>,
    configs: StepConfigRow[],
    locale: GenerationLocale
  ): AdminResultStep[] {
    const out: AdminResultStep[] = [];
    for (const cfg of configs) {
      const section = sections.get(cfg.providerMapping);
      if (!section) continue; // validation guarantees presence; belt and braces

      const text =
        section.kind === "number"
          ? String(section.value)
          : section.values[locale];

      out.push({
        stepId: cfg.stepId,
        // The TITLE is config, not generated — an editor renames a section
        // without a regeneration. Falls back to English then the canonical.
        title: cfg.localizedTitle[locale] ?? cfg.localizedTitle.en ?? cfg.title,
        displayText: text,
        // Spec item 12: the stored value IS the TTS text unless separately
        // reviewed copy is required.
        ttsText: text,
        order: cfg.order,
        contentType: cfg.contentType,
      });
    }
    return out;
  }

  /**
   * Pre-flight the deny-list over every locale. `createResult` re-runs this on
   * write (and is the authority); running it here first is what makes the
   * all-or-nothing property hold across four separate inserts.
   */
  private firstSafetyViolation(
    perLocale: { locale: GenerationLocale; steps: AdminResultStep[] }[]
  ): string | null {
    for (const { locale, steps } of perLocale) {
      for (const step of steps) {
        const verdict = validateContentSafety({
          title: step.title,
          displayText: step.displayText,
          ttsText: step.ttsText,
        });
        if (!verdict.passed) {
          return `${step.stepId}.${locale} matched ${verdict.category} ("${verdict.matched}")`;
        }
      }
    }
    return null;
  }

  /** Write one row per locale, tolerating a lost race. */
  private async store(
    target: GenerationTarget,
    perLocale: { locale: GenerationLocale; steps: AdminResultStep[] }[]
  ): Promise<void> {
    for (const { locale, steps } of perLocale) {
      try {
        await this.admin.createResult({
          zodiacId: target.zodiacId,
          modeId: target.modeId,
          dateIst: target.dateIst,
          languageCode: locale,
          steps,
          providerName: PROVIDER_NAME,
          // `contentSafetyStatus` is intentionally absent: `createResult`
          // SERVER-COMPUTES it after re-running the guardrail, so no caller —
          // including this one — can forge a "passed" attestation.
        });
      } catch (err) {
        // 409 = the unique constraint fired, i.e. another run already wrote
        // this exact key. That is the lock's backstop doing its job, not a
        // failure — the row exists, which is all the caller wanted.
        if (err instanceof AppError && err.statusCode === 409) {
          log.info(
            {
              event: "horoscope_generation_race_lost",
              zodiac_id: target.zodiacId,
              date_ist: target.dateIst,
              language_code: locale,
            },
            "another run already stored this locale"
          );
          continue;
        }
        throw err;
      }
    }
  }

  /** Poll for another holder's write, up to the caller's deadline. */
  private async pollForResult(target: GenerationTarget): Promise<boolean> {
    const deadline = Date.now() + this.waitMs;
    for (;;) {
      await sleep(POLL_INTERVAL_MS);
      if (await this.repo.hasResultForSign(target)) return true;
      if (Date.now() >= deadline) return false;
    }
  }

  /** Resolve with the generation's result, or false once the deadline passes. */
  private async raceWithDeadline(running: Promise<boolean>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), this.waitMs);
      // Never hold the process open for a deadline nobody is waiting on — this
      // matters for the one-off task and test runners, not the server.
      timer.unref?.();
    });
    try {
      return await Promise.race([running, deadline]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}
