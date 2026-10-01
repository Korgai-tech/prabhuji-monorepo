import { createModuleLogger } from "@api/shared/logs";
import type {
  HoroscopeRepository,
  StepConfigRow,
} from "@api/core/horoscope/repositories";
import type { StepContentType } from "@api/core/horoscope/types";

const log = createModuleLogger("horoscope:provider");

/**
 * A single provider-produced step. The `displayText`/`ttsText` are the content;
 * `title`/`order`/`contentType`/`ttsEnabled` come from the STEP CONFIG (the
 * editable catalogue) so a rename/reorder/disable takes effect without reseeding.
 */
export interface ProviderStep {
  stepId: string;
  title: string;
  displayText: string;
  ttsText: string;
  order: number;
  contentType: StepContentType;
  ttsEnabled: boolean;
}

/** What a provider returns for one `(zodiac, dateIst, language, mode)` request. */
export interface ProviderResult {
  steps: ProviderStep[];
  providerName: string;
  contentSafetyStatus: string;
}

/** The provider's input. `enabledSteps` is the ordered, authoritative catalogue. */
export interface ProviderQuery {
  zodiacId: string;
  dateIst: string;
  languageCode: string;
  modeId: string;
  enabledSteps: StepConfigRow[];
}

/**
 * #PATH_DECISION — the horoscope engine abstraction (TAM-56 Scope Decision 3).
 *
 * The controller/service/routes (and therefore the mobile client) depend ONLY on
 * this interface, NEVER on a concrete engine. Phase 1 resolves it to
 * `CmsHoroscopeProvider` (seeded rows). When Business finalizes the engine
 * (open-question q1), a new `ApiHoroscopeProvider` / `AiHoroscopeProvider`
 * implements this SAME interface and is swapped in the composition root — no
 * change to the service, controller, routes, schemas, or the mobile app.
 *
 * Contract: return the ordered steps for the given key, or `null` if no content
 * exists for that exact `(zodiac, dateIst, language, mode)` (the service then
 * tries the next fallback locale). Implementations MUST be deterministic for a
 * given key and MUST NOT leak partial/unsafe content — the service re-validates
 * safety, but a provider is expected to only surface content it already trusts.
 */
export interface HoroscopeProvider {
  getDailyResult(query: ProviderQuery): Promise<ProviderResult | null>;
}

/**
 * Phase-1 concrete provider: serves the seeded `daily_horoscope_result` rows from
 * Postgres via the repository. NO network call, NO runtime LLM — this is a pure
 * CMS read. It reconciles the stored steps against the ENABLED step catalogue:
 * only steps that are both stored AND enabled are returned, in the CONFIG's
 * order, with the CONFIG's (localized) title/contentType/ttsEnabled — so
 * reordering/renaming/disabling a step in `horoscope_step_config` changes the
 * served result with no reseed (PRD §6.5, "steps are data, not code").
 */
export class CmsHoroscopeProvider implements HoroscopeProvider {
  readonly providerName = "cms";

  constructor(private readonly repo: HoroscopeRepository) {}

  async getDailyResult(query: ProviderQuery): Promise<ProviderResult | null> {
    const row = await this.repo.findDailyResult({
      zodiacId: query.zodiacId,
      modeId: query.modeId,
      dateIst: query.dateIst,
      languageCode: query.languageCode,
    });
    if (!row) return null;

    const storedByStepId = new Map(row.steps.map((s) => [s.stepId, s]));

    // Config order is authoritative; drop enabled steps that have no stored
    // content (a configuration/content gap the service treats as empty-config).
    const steps: ProviderStep[] = [];
    for (const cfg of query.enabledSteps) {
      const stored = storedByStepId.get(cfg.stepId);
      if (!stored) {
        log.warn(
          {
            event: "horoscope_step_content_missing",
            zodiac_id: query.zodiacId,
            date_ist: query.dateIst,
            language_code: query.languageCode,
            step_id: cfg.stepId,
          },
          "enabled step has no stored content for this key"
        );
        continue;
      }
      steps.push({
        stepId: cfg.stepId,
        title: cfg.localizedTitle[query.languageCode] ?? cfg.title,
        displayText: stored.displayText,
        ttsText: stored.ttsText,
        order: cfg.order,
        contentType: cfg.contentType,
        ttsEnabled: cfg.ttsEnabled,
      });
    }
    if (steps.length === 0) return null;

    return {
      steps,
      providerName: row.providerName || this.providerName,
      contentSafetyStatus: row.contentSafetyStatus,
    };
  }
}
