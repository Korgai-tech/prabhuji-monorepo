import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { AppError, ValidationError } from "@api/shared/errors";
import type { HoroscopeRepository } from "@api/core/horoscope/repositories";
import {
  CONTENT_SAFETY_STATUS,
  HOROSCOPE_SAFETY_CATEGORIES,
  type AdminDailyResultView,
  type AdminHoroscopeModeUpdateInput,
  type AdminHoroscopeModeView,
  type AdminMediaAssetUpdateInput,
  type AdminMediaAssetView,
  type AdminPage,
  type AdminResultStep,
  type AdminStepConfigUpdateInput,
  type AdminStepConfigView,
  type AdminZodiacSignView,
  type AdminZodiacUpdateInput,
  type DailyResultSortField,
  type HoroscopeModeSortField,
  type LocaleMap,
  type MediaAssetSortField,
  type StepConfigSortField,
  type StepContentType,
  type ZodiacSortField,
} from "@api/core/horoscope/types";
import { validateContentSafety } from "./content-safety.js";
import type { SafetyCategory } from "./content-safety.js";

const log = createModuleLogger("horoscope:admin:service");

/**
 * Compile-time guard: the `safetyCategory` boundary allowlist MUST be exactly
 * the deny-list buckets `validateContentSafety` classifies against. Adding a
 * bucket to `content-safety.ts` without listing it in
 * `HOROSCOPE_SAFETY_CATEGORIES` (types.ts) is a type error here. #EXPORT_CRITICAL.
 */
const _safetyCategoryGuard: readonly SafetyCategory[] =
  HOROSCOPE_SAFETY_CATEGORIES;
void _safetyCategoryGuard;

// --- parsed request params (Zod defaults already applied) -------------------

export interface AdminZodiacListParams {
  page: number;
  pageSize: number;
  sort?: ZodiacSortField;
  order: "asc" | "desc";
  q?: string;
  enabled?: boolean;
}
export interface AdminZodiacCreateParams {
  zodiacId: string;
  displayName: string;
  localizedDisplayName: LocaleMap;
  iconAssetUrl: string;
  sortOrder: number;
  enabled: boolean;
}
export interface AdminZodiacUpdateParams extends AdminZodiacUpdateInput {
  expectedUpdatedAt: string;
}

export interface AdminModeListParams {
  page: number;
  pageSize: number;
  sort?: HoroscopeModeSortField;
  order: "asc" | "desc";
  q?: string;
  enabled?: boolean;
  phase?: number;
}
export interface AdminModeCreateParams {
  modeId: string;
  modeName: string;
  phase: number;
  enabled: boolean;
}
export interface AdminModeUpdateParams extends AdminHoroscopeModeUpdateInput {
  expectedUpdatedAt: string;
}

export interface AdminStepListParams {
  page: number;
  pageSize: number;
  sort?: StepConfigSortField;
  order: "asc" | "desc";
  modeId?: string;
  enabled?: boolean;
}
export interface AdminStepCreateParams {
  stepId: string;
  modeId: string;
  title: string;
  localizedTitle: LocaleMap;
  order: number;
  contentType: StepContentType;
  providerMapping: string;
  safetyCategory: string;
  ttsEnabled: boolean;
  enabled: boolean;
}
export interface AdminStepUpdateParams extends AdminStepConfigUpdateInput {
  expectedUpdatedAt: string;
}

export interface AdminResultListParams {
  page: number;
  pageSize: number;
  sort?: DailyResultSortField;
  order: "asc" | "desc";
  zodiacId?: string;
  modeId?: string;
  dateIst?: string;
  dateFrom?: string;
  dateTo?: string;
  languageCode?: string;
}
export interface AdminResultCreateParams {
  zodiacId: string;
  modeId: string;
  dateIst: string;
  languageCode: string;
  steps: AdminResultStep[];
  providerName: string;
  generatedAt?: string;
}
export interface AdminResultUpdateParams {
  expectedUpdatedAt: string;
  steps?: AdminResultStep[];
  providerName?: string;
  generatedAt?: string;
}

export interface AdminMediaAssetListParams {
  page: number;
  pageSize: number;
  sort?: MediaAssetSortField;
  order: "asc" | "desc";
  q?: string;
}
export interface AdminMediaAssetCreateParams {
  assetKey: string;
  resultBackgroundVideoUrl: string;
  resultBackgroundStaticFallbackUrl: string;
  assetVersion: number;
}
export interface AdminMediaAssetUpdateParams
  extends AdminMediaAssetUpdateInput {
  expectedUpdatedAt: string;
}

/**
 * Admin write-side service for the Horoscope module (TAM-100) — **Prisma-free**
 * (all DB access is delegated to `HoroscopeRepository`).
 *
 * This is the epic's most complex admin surface: five entities including the
 * DATA-DRIVEN ordered step config and the per-`(zodiac, date, locale)` daily
 * result. The two guardrails admin MUST NOT bypass:
 *   - **Media ownership**: every media URL is `validateOwnedUrl`-checked (ADR
 *     §A4) BEFORE the write, via `performServiceCall("media", …)`.
 *   - **Content safety**: writing a `DailyHoroscopeResult` RE-RUNS the existing
 *     `validateContentSafety` over every step and SERVER-COMPUTES
 *     `contentSafetyStatus` — an admin cannot forge a safety attestation, and a
 *     prohibited claim is a 400, exactly as the public serve path enforces.
 */
export class HoroscopeAdminService {
  constructor(private readonly repo: HoroscopeRepository) {}

  // =========================================================================
  // ZodiacSign
  // =========================================================================

  async listZodiac(
    p: AdminZodiacListParams
  ): Promise<AdminPage<AdminZodiacSignView>> {
    const { items, total } = await this.repo.findZodiacPage(p);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async getZodiac(id: string): Promise<AdminZodiacSignView> {
    const row = await this.repo.findZodiacById(id);
    if (!row) throw notFound("Zodiac sign");
    return row;
  }

  async createZodiac(
    p: AdminZodiacCreateParams
  ): Promise<AdminZodiacSignView> {
    await this.validateMediaUrl(p.iconAssetUrl, "zodiacSign", "iconAssetUrl");
    const row = await this.repo.createZodiac(p);
    log.info(
      { event: "zodiac_created", id: row.id, zodiacId: row.zodiacId },
      "zodiac sign created"
    );
    return row;
  }

  async updateZodiac(
    id: string,
    p: AdminZodiacUpdateParams
  ): Promise<AdminZodiacSignView> {
    if (p.iconAssetUrl !== undefined)
      await this.validateMediaUrl(p.iconAssetUrl, "zodiacSign", "iconAssetUrl");
    const data: AdminZodiacUpdateInput = {};
    if (p.displayName !== undefined) data.displayName = p.displayName;
    if (p.localizedDisplayName !== undefined)
      data.localizedDisplayName = p.localizedDisplayName;
    if (p.iconAssetUrl !== undefined) data.iconAssetUrl = p.iconAssetUrl;
    if (p.sortOrder !== undefined) data.sortOrder = p.sortOrder;
    if (p.enabled !== undefined) data.enabled = p.enabled;
    const count = await this.repo.updateZodiacWithPrecondition({
      id,
      expectedUpdatedAt: new Date(p.expectedUpdatedAt),
      data,
    });
    await this.assertWrote(count, id, "Zodiac sign", (i) =>
      this.repo.zodiacExistsById(i)
    );
    return this.getZodiac(id);
  }

  /** `DELETE` = deactivate (`enabled = false`); reversible via `PATCH`. */
  async deactivateZodiac(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminZodiacSignView> {
    const count = await this.repo.updateZodiacWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data: { enabled: false },
    });
    await this.assertWrote(count, id, "Zodiac sign", (i) =>
      this.repo.zodiacExistsById(i)
    );
    return this.getZodiac(id);
  }

  // =========================================================================
  // HoroscopeMode
  // =========================================================================

  async listModes(
    p: AdminModeListParams
  ): Promise<AdminPage<AdminHoroscopeModeView>> {
    const { items, total } = await this.repo.findModePage(p);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async getMode(id: string): Promise<AdminHoroscopeModeView> {
    const row = await this.repo.findModeById(id);
    if (!row) throw notFound("Mode");
    return row;
  }

  async createMode(
    p: AdminModeCreateParams
  ): Promise<AdminHoroscopeModeView> {
    const row = await this.repo.createMode(p);
    log.info(
      { event: "mode_created", id: row.id, modeId: row.modeId },
      "mode created"
    );
    return row;
  }

  async updateMode(
    id: string,
    p: AdminModeUpdateParams
  ): Promise<AdminHoroscopeModeView> {
    const data: AdminHoroscopeModeUpdateInput = {};
    if (p.modeName !== undefined) data.modeName = p.modeName;
    if (p.phase !== undefined) data.phase = p.phase;
    if (p.enabled !== undefined) data.enabled = p.enabled;
    const count = await this.repo.updateModeWithPrecondition({
      id,
      expectedUpdatedAt: new Date(p.expectedUpdatedAt),
      data,
    });
    await this.assertWrote(count, id, "Mode", (i) =>
      this.repo.modeExistsById(i)
    );
    return this.getMode(id);
  }

  async deactivateMode(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminHoroscopeModeView> {
    const count = await this.repo.updateModeWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data: { enabled: false },
    });
    await this.assertWrote(count, id, "Mode", (i) =>
      this.repo.modeExistsById(i)
    );
    return this.getMode(id);
  }

  // =========================================================================
  // HoroscopeStepConfig (DATA-DRIVEN ordered steps: add / remove / reorder /
  // rename / enable — every one is a row edit, not code)
  // =========================================================================

  async listSteps(
    p: AdminStepListParams
  ): Promise<AdminPage<AdminStepConfigView>> {
    const { items, total } = await this.repo.findStepPage(p);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async getStep(id: string): Promise<AdminStepConfigView> {
    const row = await this.repo.findStepById(id);
    if (!row) throw notFound("Step config");
    return row;
  }

  /**
   * Create a step for a mode. The `modeId` → `HoroscopeMode.modeId` FK is
   * validated in the service (a 400 is a better error than a 500 from the
   * constraint). Uniqueness is per-`(modeId, stepId)` → a duplicate is a 409.
   */
  async createStep(
    p: AdminStepCreateParams
  ): Promise<AdminStepConfigView> {
    if (!(await this.repo.modeIdExists(p.modeId))) {
      throw new ValidationError(
        `Unknown modeId "${p.modeId}"`,
        "UNKNOWN_MODE"
      );
    }
    const row = await this.repo.createStep(p);
    log.info(
      { event: "step_created", id: row.id, modeId: row.modeId, stepId: row.stepId },
      "step config created"
    );
    return row;
  }

  /** `modeId`/`stepId` are immutable (rejected at the boundary). */
  async updateStep(
    id: string,
    p: AdminStepUpdateParams
  ): Promise<AdminStepConfigView> {
    const data: AdminStepConfigUpdateInput = {};
    if (p.title !== undefined) data.title = p.title;
    if (p.localizedTitle !== undefined) data.localizedTitle = p.localizedTitle;
    if (p.order !== undefined) data.order = p.order;
    if (p.enabled !== undefined) data.enabled = p.enabled;
    if (p.contentType !== undefined) data.contentType = p.contentType;
    if (p.providerMapping !== undefined)
      data.providerMapping = p.providerMapping;
    if (p.ttsEnabled !== undefined) data.ttsEnabled = p.ttsEnabled;
    if (p.safetyCategory !== undefined) data.safetyCategory = p.safetyCategory;
    const count = await this.repo.updateStepWithPrecondition({
      id,
      expectedUpdatedAt: new Date(p.expectedUpdatedAt),
      data,
    });
    await this.assertWrote(count, id, "Step config", (i) =>
      this.repo.stepExistsById(i)
    );
    return this.getStep(id);
  }

  async deactivateStep(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminStepConfigView> {
    const count = await this.repo.updateStepWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data: { enabled: false },
    });
    await this.assertWrote(count, id, "Step config", (i) =>
      this.repo.stepExistsById(i)
    );
    return this.getStep(id);
  }

  // =========================================================================
  // DailyHoroscopeResult (the Phase-1 horoscope product — the determinism key
  // `(zodiacId, modeId, dateIst, languageCode)` IS the identity)
  // =========================================================================

  async listResults(
    p: AdminResultListParams
  ): Promise<AdminPage<AdminDailyResultView>> {
    const { items, total } = await this.repo.findResultPage(p);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async getResult(id: string): Promise<AdminDailyResultView> {
    const row = await this.repo.findResultById(id);
    if (!row) throw notFound("Daily result");
    return row;
  }

  /**
   * Create a daily result. `zodiacId`/`modeId` are logical refs with NO FK, so
   * BOTH are existence-validated here (the DB will not catch a typo, and a
   * mismatched row is a horoscope that never serves; #EXPORT_CRITICAL). The
   * `steps` are cross-validated against the step config and RE-RUN through
   * `validateContentSafety`; `contentSafetyStatus` is SERVER-COMPUTED.
   */
  async createResult(
    p: AdminResultCreateParams
  ): Promise<AdminDailyResultView> {
    if (!(await this.repo.zodiacIdExists(p.zodiacId))) {
      throw new ValidationError(
        `Unknown zodiacId "${p.zodiacId}"`,
        "UNKNOWN_ZODIAC"
      );
    }
    if (!(await this.repo.modeIdExists(p.modeId))) {
      throw new ValidationError(
        `Unknown modeId "${p.modeId}"`,
        "UNKNOWN_MODE"
      );
    }
    await this.validateSteps(p.modeId, p.steps);
    const contentSafetyStatus = this.assertContentSafe(p.steps);
    const row = await this.repo.createResult({
      zodiacId: p.zodiacId,
      modeId: p.modeId,
      dateIst: p.dateIst,
      languageCode: p.languageCode,
      steps: p.steps,
      providerName: p.providerName,
      generatedAt: p.generatedAt ? new Date(p.generatedAt) : undefined,
      contentSafetyStatus,
    });
    log.info(
      {
        event: "result_created",
        id: row.id,
        zodiacId: row.zodiacId,
        dateIst: row.dateIst,
        languageCode: row.languageCode,
      },
      "daily result created"
    );
    return row;
  }

  /**
   * Update a result. The four determinism-key components are immutable
   * (rejected at the boundary). When `steps` change they are re-validated
   * against the config and re-run through the content-safety guardrail, and
   * `contentSafetyStatus` is re-computed server-side.
   */
  async updateResult(
    id: string,
    p: AdminResultUpdateParams
  ): Promise<AdminDailyResultView> {
    const existing = await this.repo.findResultById(id);
    if (!existing) throw notFound("Daily result");

    const data: AdminResultUpdateData = {};
    if (p.steps !== undefined) {
      await this.validateSteps(existing.modeId, p.steps);
      data.steps = p.steps;
      data.contentSafetyStatus = this.assertContentSafe(p.steps);
    }
    if (p.providerName !== undefined) data.providerName = p.providerName;
    if (p.generatedAt !== undefined) data.generatedAt = new Date(p.generatedAt);

    const count = await this.repo.updateResultWithPrecondition({
      id,
      expectedUpdatedAt: new Date(p.expectedUpdatedAt),
      data,
    });
    await this.assertWrote(count, id, "Daily result", (i) =>
      this.repo.resultExistsById(i)
    );
    return this.getResult(id);
  }

  /**
   * Genuine HARD delete under the `updatedAt` precondition — a deliberate,
   * justified exception to the epic's soft-delete default (TAM-100
   * #PATH_DECISION): dated leaf content with no liveness flag and nothing
   * referencing it. Editors must be able to remove a wrong result before it
   * serves.
   */
  async deleteResult(id: string, expectedUpdatedAt: string): Promise<void> {
    const count = await this.repo.deleteResultWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
    await this.assertWrote(count, id, "Daily result", (i) =>
      this.repo.resultExistsById(i)
    );
    log.info({ event: "result_deleted", id }, "daily result hard-deleted");
  }

  // =========================================================================
  // MediaAsset (horoscope-owned result background; NOT the TAM-84 ledger).
  // No liveness flag and NO delete exposed — deleting a row breaks the result
  // screen background with no fallback; editors update, they do not delete
  // (TAM-100 AC (g), resolving #PLAN_UNCERTAINTY).
  // =========================================================================

  async listMediaAssets(
    p: AdminMediaAssetListParams
  ): Promise<AdminPage<AdminMediaAssetView>> {
    const { items, total } = await this.repo.findMediaAssetPage(p);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async getMediaAsset(id: string): Promise<AdminMediaAssetView> {
    const row = await this.repo.findMediaAssetById(id);
    if (!row) throw notFound("Media asset");
    return row;
  }

  async createMediaAsset(
    p: AdminMediaAssetCreateParams
  ): Promise<AdminMediaAssetView> {
    await this.validateMediaUrl(
      p.resultBackgroundVideoUrl,
      "mediaAsset",
      "resultBackgroundVideoUrl"
    );
    await this.validateMediaUrl(
      p.resultBackgroundStaticFallbackUrl,
      "mediaAsset",
      "resultBackgroundStaticFallbackUrl"
    );
    const row = await this.repo.createMediaAsset(p);
    log.info(
      { event: "media_asset_created", id: row.id, assetKey: row.assetKey },
      "media asset created"
    );
    return row;
  }

  async updateMediaAsset(
    id: string,
    p: AdminMediaAssetUpdateParams
  ): Promise<AdminMediaAssetView> {
    if (p.resultBackgroundVideoUrl !== undefined)
      await this.validateMediaUrl(
        p.resultBackgroundVideoUrl,
        "mediaAsset",
        "resultBackgroundVideoUrl"
      );
    if (p.resultBackgroundStaticFallbackUrl !== undefined)
      await this.validateMediaUrl(
        p.resultBackgroundStaticFallbackUrl,
        "mediaAsset",
        "resultBackgroundStaticFallbackUrl"
      );
    const data: AdminMediaAssetUpdateInput = {};
    if (p.resultBackgroundVideoUrl !== undefined)
      data.resultBackgroundVideoUrl = p.resultBackgroundVideoUrl;
    if (p.resultBackgroundStaticFallbackUrl !== undefined)
      data.resultBackgroundStaticFallbackUrl =
        p.resultBackgroundStaticFallbackUrl;
    if (p.assetVersion !== undefined) data.assetVersion = p.assetVersion;
    const count = await this.repo.updateMediaAssetWithPrecondition({
      id,
      expectedUpdatedAt: new Date(p.expectedUpdatedAt),
      data,
    });
    await this.assertWrote(count, id, "Media asset", (i) =>
      this.repo.mediaAssetExistsById(i)
    );
    return this.getMediaAsset(id);
  }

  // =========================================================================
  // internals
  // =========================================================================

  /**
   * Turn a 0-count optimistic-concurrency write into the right status: a
   * follow-up existence check disambiguates **404** (row gone) from **409**
   * `STALE_WRITE` (someone else wrote first) — ADR §C3.
   */
  private async assertWrote(
    count: number,
    id: string,
    label: string,
    exists: (id: string) => Promise<boolean>
  ): Promise<void> {
    if (count > 0) return;
    if (!(await exists(id))) throw notFound(label);
    throw new AppError(
      `${label} was modified by someone else; reload and retry`,
      409,
      "STALE_WRITE"
    );
  }

  /**
   * Media-URL ownership validation (ADR §A4) — called BEFORE persisting ANY
   * media column. Reaches `IMediaApi.validateOwnedUrl` (TAM-84) ONLY via
   * `performServiceCall`; it throws `ValidationError` (→ 400) unless the URL was
   * minted by our presign flow for this exact `(module, entity, field)` and the
   * object exists with an allowlisted content-type. The frozen TAM-84 registry
   * tokens: `horoscope.zodiacSign.iconAssetUrl`,
   * `horoscope.mediaAsset.resultBackgroundVideoUrl`,
   * `horoscope.mediaAsset.resultBackgroundStaticFallbackUrl`.
   */
  private async validateMediaUrl(
    url: string,
    entity: "zodiacSign" | "mediaAsset",
    field: string
  ): Promise<void> {
    await performServiceCall(
      "media",
      (m) => m.validateOwnedUrl({ url, module: "horoscope", entity, field }),
      "horoscope:admin:media",
      "media URL validation failed"
    );
  }

  /**
   * Cross-validate a result's `steps` against the mode's step config: every
   * `stepId` must exist for the mode and its `contentType` must match the
   * config (a mismatch renders a broken/empty step → 400). A step whose config
   * is DISABLED is WARNED, not blocked (resolving #PLAN_UNCERTAINTY — blocking
   * would stop legitimate authoring of a temporarily disabled step).
   */
  private async validateSteps(
    modeId: string,
    steps: AdminResultStep[]
  ): Promise<void> {
    const configs = await this.repo.findStepConfigsForMode(modeId);
    const byId = new Map(configs.map((c) => [c.stepId, c]));
    for (const step of steps) {
      const cfg = byId.get(step.stepId);
      if (!cfg) {
        throw new ValidationError(
          `Step "${step.stepId}" is not configured for mode "${modeId}"`,
          "UNKNOWN_STEP"
        );
      }
      if (cfg.contentType !== step.contentType) {
        throw new ValidationError(
          `Step "${step.stepId}" contentType "${step.contentType}" does not match its config "${cfg.contentType}"`,
          "STEP_CONTENT_TYPE_MISMATCH"
        );
      }
      if (!cfg.enabled) {
        log.warn(
          { event: "result_step_disabled", modeId, stepId: step.stepId },
          "result references a disabled step config"
        );
      }
    }
  }

  /**
   * RE-RUN the existing content-safety guardrail over every step (the SAME
   * validator the public serve path enforces — reused, not reimplemented) and
   * SERVER-COMPUTE `contentSafetyStatus`. A prohibited claim (medical/financial/
   * fear/ritual-pressure/harm) is a 400; admin CANNOT bypass the guardrail nor
   * forge a "passed" attestation. #EXPORT_CRITICAL.
   */
  private assertContentSafe(steps: AdminResultStep[]): string {
    for (const step of steps) {
      const verdict = validateContentSafety({
        title: step.title,
        displayText: step.displayText,
        ttsText: step.ttsText,
      });
      if (!verdict.passed) {
        throw new ValidationError(
          `Step "${step.stepId}" failed the content-safety check (${verdict.category}: "${verdict.matched}")`,
          "CONTENT_SAFETY_VIOLATION"
        );
      }
    }
    return CONTENT_SAFETY_STATUS;
  }
}

/** The repo's result-update input, with `generatedAt` as a `Date`. */
interface AdminResultUpdateData {
  steps?: AdminResultStep[];
  providerName?: string;
  generatedAt?: Date;
  contentSafetyStatus?: string;
}

function notFound(label: string): AppError {
  return new AppError(`${label} not found`, 404, "NOT_FOUND");
}
