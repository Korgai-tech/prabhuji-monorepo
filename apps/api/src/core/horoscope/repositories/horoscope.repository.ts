import { Prisma } from "@prisma/client";
import type {
  DailyHoroscopeResult,
  HoroscopeMode,
  HoroscopeStepConfig,
  MediaAsset,
  ZodiacSign,
} from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import { AppError } from "@api/shared/errors";
import type {
  AdminDailyResultUpdateInput,
  AdminDailyResultView,
  AdminHoroscopeModeUpdateInput,
  AdminHoroscopeModeView,
  AdminMediaAssetUpdateInput,
  AdminMediaAssetView,
  AdminResultStep,
  AdminStepConfigUpdateInput,
  AdminStepConfigView,
  AdminZodiacSignView,
  AdminZodiacUpdateInput,
  DailyResultSortField,
  HoroscopeModeSortField,
  LocaleMap,
  MediaAssetSortField,
  StepConfigSortField,
  StepContentType,
  ZodiacSortField,
} from "@api/core/horoscope/types";

/**
 * Horoscope module repository — the ONLY place `@prisma/client` is reached for
 * this module (arch-boundaries.json enforces it; the service + provider stay
 * Prisma-free). Owns the zodiac grid read, the enabled-mode + enabled-step
 * catalogue reads, the deterministic daily-result composite-key read, and the
 * shared media-asset read.
 *
 * It stores + reads flat rows only. Locale fallback, entitlement gating, content
 * safety and step reconciliation are the SERVICE's job — the repo never decides
 * what a caller may see.
 */

/** A zodiac row for the grid; `localizedDisplayName` is the raw `{locale:label}` map. */
export interface ZodiacRow {
  zodiacId: string;
  displayName: string;
  localizedDisplayName: Record<string, string>;
  iconAssetUrl: string;
  sortOrder: number;
}

/** One enabled step-config row (the editable catalogue — steps are DATA). */
export interface StepConfigRow {
  stepId: string;
  modeId: string;
  title: string;
  localizedTitle: Record<string, string>;
  order: number;
  contentType: StepContentType;
  providerMapping: string;
  ttsEnabled: boolean;
  safetyCategory: string;
}

/** A stored step inside a `daily_horoscope_result.steps` JSON array. */
export interface StoredStep {
  stepId: string;
  title: string;
  displayText: string;
  ttsText: string;
  order: number;
  contentType: StepContentType;
}

/** A daily-result row keyed by `(zodiacId, modeId, dateIst, languageCode)`. */
export interface DailyResultRow {
  zodiacId: string;
  modeId: string;
  dateIst: string;
  languageCode: string;
  steps: StoredStep[];
  providerName: string;
  contentSafetyStatus: string;
}

/** The shared result-background media row. */
export interface MediaAssetRow {
  backgroundVideoUrl: string;
  backgroundStaticFallbackUrl: string;
  assetVersion: number;
}

export class HoroscopeRepository {
  /** The 12 (enabled) zodiac signs ordered by `(sort_order, zodiac_id)` for the grid. */
  async findEnabledZodiacSigns(): Promise<ZodiacRow[]> {
    const rows = await getPrisma().zodiacSign.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: "asc" }, { zodiacId: "asc" }],
      select: {
        zodiacId: true,
        displayName: true,
        localizedDisplayName: true,
        iconAssetUrl: true,
        sortOrder: true,
      },
    });
    return rows.map((r) => ({
      zodiacId: r.zodiacId,
      displayName: r.displayName,
      localizedDisplayName: asLocaleMap(r.localizedDisplayName),
      iconAssetUrl: r.iconAssetUrl,
      sortOrder: r.sortOrder,
    }));
  }

  /** The single enabled daily mode id (or `null` if none is enabled). */
  async findEnabledDailyMode(modeId: string): Promise<{ modeId: string } | null> {
    const row = await getPrisma().horoscopeMode.findFirst({
      where: { modeId, enabled: true },
      select: { modeId: true },
    });
    return row ? { modeId: row.modeId } : null;
  }

  /** Whether a zodiac slug exists AND is enabled (grid membership check). */
  async isZodiacEnabled(zodiacId: string): Promise<boolean> {
    const row = await getPrisma().zodiacSign.findFirst({
      where: { zodiacId, enabled: true },
      select: { zodiacId: true },
    });
    return row !== null;
  }

  /**
   * The enabled step catalogue for a mode, ordered by `(order, step_id)`. This is
   * the authoritative step order at SERVE time — reorder / disable a step via a
   * row edit and the served result follows, no reseed (PRD §6.5).
   */
  async findEnabledSteps(modeId: string): Promise<StepConfigRow[]> {
    const rows = await getPrisma().horoscopeStepConfig.findMany({
      where: { modeId, enabled: true },
      orderBy: [{ order: "asc" }, { stepId: "asc" }],
      select: {
        stepId: true,
        modeId: true,
        title: true,
        localizedTitle: true,
        order: true,
        contentType: true,
        providerMapping: true,
        ttsEnabled: true,
        safetyCategory: true,
      },
    });
    return rows.map((r) => ({
      stepId: r.stepId,
      modeId: r.modeId,
      title: r.title,
      localizedTitle: asLocaleMap(r.localizedTitle),
      order: r.order,
      contentType: r.contentType as StepContentType,
      providerMapping: r.providerMapping,
      ttsEnabled: r.ttsEnabled,
      safetyCategory: r.safetyCategory,
    }));
  }

  /** The deterministic daily result for a composite key (or `null`). */
  async findDailyResult(params: {
    zodiacId: string;
    modeId: string;
    dateIst: string;
    languageCode: string;
  }): Promise<DailyResultRow | null> {
    const row = await getPrisma().dailyHoroscopeResult.findUnique({
      where: { daily_horoscope_result_unique: params },
      select: {
        zodiacId: true,
        modeId: true,
        dateIst: true,
        languageCode: true,
        steps: true,
        providerName: true,
        contentSafetyStatus: true,
      },
    });
    if (!row) return null;
    return {
      zodiacId: row.zodiacId,
      modeId: row.modeId,
      dateIst: row.dateIst,
      languageCode: row.languageCode,
      steps: asStoredSteps(row.steps),
      providerName: row.providerName,
      contentSafetyStatus: row.contentSafetyStatus,
    };
  }

  /**
   * Whether ANY locale's result exists for `(zodiacId, modeId, dateIst)`.
   *
   * The generation path's readiness check. It deliberately does not care WHICH
   * locale: a generation writes every locale in one transaction-less burst, so
   * "one exists" and "all exist" differ only inside a window the lock already
   * covers, and checking one row is an index hit rather than a scan.
   */
  async hasResultForSign(params: {
    zodiacId: string;
    modeId: string;
    dateIst: string;
  }): Promise<boolean> {
    const row = await getPrisma().dailyHoroscopeResult.findFirst({
      where: params,
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * The zodiac slugs that ALREADY have content for a date — the warm sweep
   * subtracts these from the enabled grid to find what still needs generating.
   * One indexed read for the whole day rather than twelve existence checks.
   */
  async findZodiacIdsWithResults(params: {
    modeId: string;
    dateIst: string;
  }): Promise<string[]> {
    const rows = await getPrisma().dailyHoroscopeResult.findMany({
      where: params,
      select: { zodiacId: true },
      distinct: ["zodiacId"],
    });
    return rows.map((r) => r.zodiacId);
  }

  /** The shared result-background media asset (or `null` if unseeded). */
  async findMediaAsset(assetKey: string): Promise<MediaAssetRow | null> {
    const row = await getPrisma().mediaAsset.findUnique({
      where: { assetKey },
      select: {
        resultBackgroundVideoUrl: true,
        resultBackgroundStaticFallbackUrl: true,
        assetVersion: true,
      },
    });
    if (!row) return null;
    return {
      backgroundVideoUrl: row.resultBackgroundVideoUrl,
      backgroundStaticFallbackUrl: row.resultBackgroundStaticFallbackUrl,
      assetVersion: row.assetVersion,
    };
  }

  // =========================================================================
  // ADMIN write surface (TAM-100). Prisma stays confined here; the admin
  // service is Prisma-free. These methods do NOT filter on `enabled` — an editor
  // manages both enabled and deactivated rows (`enabled` is a query option).
  // =========================================================================

  // --- ZodiacSign ----------------------------------------------------------

  async findZodiacPage(params: {
    page: number;
    pageSize: number;
    sort?: ZodiacSortField;
    order: "asc" | "desc";
    q?: string;
    enabled?: boolean;
  }): Promise<{ items: AdminZodiacSignView[]; total: number }> {
    const where: Prisma.ZodiacSignWhereInput = {
      ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
      ...(params.q
        ? {
            OR: [
              { zodiacId: { contains: params.q, mode: "insensitive" } },
              { displayName: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const orderBy = zodiacOrderBy(params.sort, params.order);
    const [rows, total] = await Promise.all([
      getPrisma().zodiacSign.findMany({
        where,
        orderBy,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      getPrisma().zodiacSign.count({ where }),
    ]);
    return { items: rows.map(toZodiacView), total };
  }

  async findZodiacById(id: string): Promise<AdminZodiacSignView | null> {
    const row = await getPrisma().zodiacSign.findUnique({ where: { id } });
    return row ? toZodiacView(row) : null;
  }

  async zodiacExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().zodiacSign.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /** Whether a zodiac slug exists at all (enabled or not) — result-ref check. */
  async zodiacIdExists(zodiacId: string): Promise<boolean> {
    const row = await getPrisma().zodiacSign.findUnique({
      where: { zodiacId },
      select: { zodiacId: true },
    });
    return row !== null;
  }

  async createZodiac(input: {
    zodiacId: string;
    displayName: string;
    localizedDisplayName: LocaleMap;
    iconAssetUrl: string;
    sortOrder: number;
    enabled: boolean;
  }): Promise<AdminZodiacSignView> {
    try {
      const row = await getPrisma().zodiacSign.create({
        data: {
          zodiacId: input.zodiacId,
          displayName: input.displayName,
          localizedDisplayName: input.localizedDisplayName,
          iconAssetUrl: input.iconAssetUrl,
          sortOrder: input.sortOrder,
          enabled: input.enabled,
        },
      });
      return toZodiacView(row);
    } catch (err) {
      throw conflictOr(err, `zodiac sign "${input.zodiacId}" already exists`);
    }
  }

  async updateZodiacWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminZodiacUpdateInput;
  }): Promise<number> {
    const res = await getPrisma().zodiacSign.updateMany({
      where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      data: toZodiacWrite(params.data),
    });
    return res.count;
  }

  // --- HoroscopeMode -------------------------------------------------------

  async findModePage(params: {
    page: number;
    pageSize: number;
    sort?: HoroscopeModeSortField;
    order: "asc" | "desc";
    q?: string;
    enabled?: boolean;
    phase?: number;
  }): Promise<{ items: AdminHoroscopeModeView[]; total: number }> {
    const where: Prisma.HoroscopeModeWhereInput = {
      ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
      ...(params.phase !== undefined ? { phase: params.phase } : {}),
      ...(params.q
        ? {
            OR: [
              { modeId: { contains: params.q, mode: "insensitive" } },
              { modeName: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const orderBy = modeOrderBy(params.sort, params.order);
    const [rows, total] = await Promise.all([
      getPrisma().horoscopeMode.findMany({
        where,
        orderBy,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      getPrisma().horoscopeMode.count({ where }),
    ]);
    return { items: rows.map(toModeView), total };
  }

  async findModeById(id: string): Promise<AdminHoroscopeModeView | null> {
    const row = await getPrisma().horoscopeMode.findUnique({ where: { id } });
    return row ? toModeView(row) : null;
  }

  async modeExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().horoscopeMode.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /** Whether a `modeId` business key exists — step FK + result-ref check. */
  async modeIdExists(modeId: string): Promise<boolean> {
    const row = await getPrisma().horoscopeMode.findUnique({
      where: { modeId },
      select: { modeId: true },
    });
    return row !== null;
  }

  async createMode(input: {
    modeId: string;
    modeName: string;
    phase: number;
    enabled: boolean;
  }): Promise<AdminHoroscopeModeView> {
    try {
      const row = await getPrisma().horoscopeMode.create({ data: input });
      return toModeView(row);
    } catch (err) {
      throw conflictOr(err, `mode "${input.modeId}" already exists`);
    }
  }

  async updateModeWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminHoroscopeModeUpdateInput;
  }): Promise<number> {
    const res = await getPrisma().horoscopeMode.updateMany({
      where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      data: params.data,
    });
    return res.count;
  }

  // --- HoroscopeStepConfig -------------------------------------------------

  async findStepPage(params: {
    page: number;
    pageSize: number;
    sort?: StepConfigSortField;
    order: "asc" | "desc";
    modeId?: string;
    enabled?: boolean;
  }): Promise<{ items: AdminStepConfigView[]; total: number }> {
    const where: Prisma.HoroscopeStepConfigWhereInput = {
      ...(params.modeId !== undefined ? { modeId: params.modeId } : {}),
      ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
    };
    const orderBy = stepOrderBy(params.sort, params.order);
    const [rows, total] = await Promise.all([
      getPrisma().horoscopeStepConfig.findMany({
        where,
        orderBy,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      getPrisma().horoscopeStepConfig.count({ where }),
    ]);
    return { items: rows.map(toStepView), total };
  }

  async findStepById(id: string): Promise<AdminStepConfigView | null> {
    const row = await getPrisma().horoscopeStepConfig.findUnique({
      where: { id },
    });
    return row ? toStepView(row) : null;
  }

  async stepExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().horoscopeStepConfig.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * The step catalogue for a mode (every step, enabled or not), for the
   * result `steps`↔config consistency check. Returns the config's `contentType`
   * + `enabled` so the service can match content types and warn on disabled.
   */
  async findStepConfigsForMode(
    modeId: string
  ): Promise<{ stepId: string; contentType: StepContentType; enabled: boolean }[]> {
    const rows = await getPrisma().horoscopeStepConfig.findMany({
      where: { modeId },
      select: { stepId: true, contentType: true, enabled: true },
    });
    return rows.map((r) => ({
      stepId: r.stepId,
      contentType: r.contentType as StepContentType,
      enabled: r.enabled,
    }));
  }

  async createStep(input: {
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
  }): Promise<AdminStepConfigView> {
    try {
      const row = await getPrisma().horoscopeStepConfig.create({
        data: {
          stepId: input.stepId,
          modeId: input.modeId,
          title: input.title,
          localizedTitle: input.localizedTitle,
          order: input.order,
          contentType: input.contentType,
          providerMapping: input.providerMapping,
          safetyCategory: input.safetyCategory,
          ttsEnabled: input.ttsEnabled,
          enabled: input.enabled,
        },
      });
      return toStepView(row);
    } catch (err) {
      throw conflictOr(
        err,
        `step "${input.stepId}" already exists for mode "${input.modeId}"`
      );
    }
  }

  async updateStepWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminStepConfigUpdateInput;
  }): Promise<number> {
    const res = await getPrisma().horoscopeStepConfig.updateMany({
      where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      data: toStepWrite(params.data),
    });
    return res.count;
  }

  // --- DailyHoroscopeResult ------------------------------------------------

  async findResultPage(params: {
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
  }): Promise<{ items: AdminDailyResultView[]; total: number }> {
    const dateFilter =
      params.dateIst !== undefined
        ? params.dateIst
        : params.dateFrom !== undefined || params.dateTo !== undefined
          ? {
              ...(params.dateFrom !== undefined ? { gte: params.dateFrom } : {}),
              ...(params.dateTo !== undefined ? { lte: params.dateTo } : {}),
            }
          : undefined;
    const where: Prisma.DailyHoroscopeResultWhereInput = {
      ...(params.zodiacId !== undefined ? { zodiacId: params.zodiacId } : {}),
      ...(params.modeId !== undefined ? { modeId: params.modeId } : {}),
      ...(params.languageCode !== undefined
        ? { languageCode: params.languageCode }
        : {}),
      ...(dateFilter !== undefined ? { dateIst: dateFilter } : {}),
    };
    const orderBy = resultOrderBy(params.sort, params.order);
    const [rows, total] = await Promise.all([
      getPrisma().dailyHoroscopeResult.findMany({
        where,
        orderBy,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      getPrisma().dailyHoroscopeResult.count({ where }),
    ]);
    return { items: rows.map(toResultView), total };
  }

  async findResultById(id: string): Promise<AdminDailyResultView | null> {
    const row = await getPrisma().dailyHoroscopeResult.findUnique({
      where: { id },
    });
    return row ? toResultView(row) : null;
  }

  async resultExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().dailyHoroscopeResult.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  async createResult(input: {
    zodiacId: string;
    modeId: string;
    dateIst: string;
    languageCode: string;
    steps: AdminResultStep[];
    providerName: string;
    generatedAt?: Date;
    contentSafetyStatus: string;
  }): Promise<AdminDailyResultView> {
    try {
      const row = await getPrisma().dailyHoroscopeResult.create({
        data: {
          zodiacId: input.zodiacId,
          modeId: input.modeId,
          dateIst: input.dateIst,
          languageCode: input.languageCode,
          steps: input.steps as unknown as Prisma.InputJsonValue,
          providerName: input.providerName,
          ...(input.generatedAt ? { generatedAt: input.generatedAt } : {}),
          contentSafetyStatus: input.contentSafetyStatus,
        },
      });
      return toResultView(row);
    } catch (err) {
      throw conflictOr(
        err,
        `a result already exists for (${input.zodiacId}, ${input.modeId}, ${input.dateIst}, ${input.languageCode})`
      );
    }
  }

  async updateResultWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminDailyResultUpdateInput;
  }): Promise<number> {
    const res = await getPrisma().dailyHoroscopeResult.updateMany({
      where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      data: toResultWrite(params.data),
    });
    return res.count;
  }

  /**
   * Genuine HARD delete under the `updatedAt` precondition (a deliberate,
   * justified exception to the epic's soft-delete default — dated leaf content
   * with no liveness flag and nothing referencing it; TAM-100 #PATH_DECISION).
   * Returns the count so the service disambiguates 404 vs 409.
   */
  async deleteResultWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
  }): Promise<number> {
    const res = await getPrisma().dailyHoroscopeResult.deleteMany({
      where: { id: params.id, updatedAt: params.expectedUpdatedAt },
    });
    return res.count;
  }

  // --- MediaAsset ----------------------------------------------------------

  async findMediaAssetPage(params: {
    page: number;
    pageSize: number;
    sort?: MediaAssetSortField;
    order: "asc" | "desc";
    q?: string;
  }): Promise<{ items: AdminMediaAssetView[]; total: number }> {
    const where: Prisma.MediaAssetWhereInput = params.q
      ? { assetKey: { contains: params.q, mode: "insensitive" } }
      : {};
    const orderBy = mediaAssetOrderBy(params.sort, params.order);
    const [rows, total] = await Promise.all([
      getPrisma().mediaAsset.findMany({
        where,
        orderBy,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      getPrisma().mediaAsset.count({ where }),
    ]);
    return { items: rows.map(toMediaAssetView), total };
  }

  async findMediaAssetById(id: string): Promise<AdminMediaAssetView | null> {
    const row = await getPrisma().mediaAsset.findUnique({ where: { id } });
    return row ? toMediaAssetView(row) : null;
  }

  async mediaAssetExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().mediaAsset.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  async createMediaAsset(input: {
    assetKey: string;
    resultBackgroundVideoUrl: string;
    resultBackgroundStaticFallbackUrl: string;
    assetVersion: number;
  }): Promise<AdminMediaAssetView> {
    try {
      const row = await getPrisma().mediaAsset.create({ data: input });
      return toMediaAssetView(row);
    } catch (err) {
      throw conflictOr(err, `media asset "${input.assetKey}" already exists`);
    }
  }

  async updateMediaAssetWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminMediaAssetUpdateInput;
  }): Promise<number> {
    const res = await getPrisma().mediaAsset.updateMany({
      where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      data: params.data,
    });
    return res.count;
  }
}

/** Narrow a Prisma `Json` column to a `{ locale: string }` map defensively. */
function asLocaleMap(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }
  return {};
}

// ---------------------------------------------------------------------------
// admin row mappers (Date → ISO, Json narrowed) + `orderBy` builders + the
// shared unique-constraint → 409 helper. Kept out of the class for readability.
// ---------------------------------------------------------------------------

function toZodiacView(row: ZodiacSign): AdminZodiacSignView {
  return {
    id: row.id,
    zodiacId: row.zodiacId,
    displayName: row.displayName,
    localizedDisplayName: asLocaleMap(row.localizedDisplayName),
    iconAssetUrl: row.iconAssetUrl,
    sortOrder: row.sortOrder,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toZodiacWrite(
  data: AdminZodiacUpdateInput
): Prisma.ZodiacSignUpdateManyMutationInput {
  const out: Prisma.ZodiacSignUpdateManyMutationInput = {};
  if (data.displayName !== undefined) out.displayName = data.displayName;
  if (data.localizedDisplayName !== undefined)
    out.localizedDisplayName = data.localizedDisplayName;
  if (data.iconAssetUrl !== undefined) out.iconAssetUrl = data.iconAssetUrl;
  if (data.sortOrder !== undefined) out.sortOrder = data.sortOrder;
  if (data.enabled !== undefined) out.enabled = data.enabled;
  return out;
}

function toModeView(row: HoroscopeMode): AdminHoroscopeModeView {
  return {
    id: row.id,
    modeId: row.modeId,
    modeName: row.modeName,
    enabled: row.enabled,
    phase: row.phase,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toStepView(row: HoroscopeStepConfig): AdminStepConfigView {
  return {
    id: row.id,
    stepId: row.stepId,
    modeId: row.modeId,
    title: row.title,
    localizedTitle: asLocaleMap(row.localizedTitle),
    order: row.order,
    enabled: row.enabled,
    contentType: row.contentType as StepContentType,
    providerMapping: row.providerMapping,
    ttsEnabled: row.ttsEnabled,
    safetyCategory: row.safetyCategory,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toStepWrite(
  data: AdminStepConfigUpdateInput
): Prisma.HoroscopeStepConfigUpdateManyMutationInput {
  const out: Prisma.HoroscopeStepConfigUpdateManyMutationInput = {};
  if (data.title !== undefined) out.title = data.title;
  if (data.localizedTitle !== undefined)
    out.localizedTitle = data.localizedTitle;
  if (data.order !== undefined) out.order = data.order;
  if (data.enabled !== undefined) out.enabled = data.enabled;
  if (data.contentType !== undefined) out.contentType = data.contentType;
  if (data.providerMapping !== undefined)
    out.providerMapping = data.providerMapping;
  if (data.ttsEnabled !== undefined) out.ttsEnabled = data.ttsEnabled;
  if (data.safetyCategory !== undefined)
    out.safetyCategory = data.safetyCategory;
  return out;
}

function toResultView(row: DailyHoroscopeResult): AdminDailyResultView {
  return {
    id: row.id,
    zodiacId: row.zodiacId,
    modeId: row.modeId,
    dateIst: row.dateIst,
    languageCode: row.languageCode,
    steps: asStoredSteps(row.steps),
    providerName: row.providerName,
    generatedAt: row.generatedAt.toISOString(),
    contentSafetyStatus: row.contentSafetyStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toResultWrite(
  data: AdminDailyResultUpdateInput
): Prisma.DailyHoroscopeResultUpdateManyMutationInput {
  const out: Prisma.DailyHoroscopeResultUpdateManyMutationInput = {};
  if (data.steps !== undefined)
    out.steps = data.steps as unknown as Prisma.InputJsonValue;
  if (data.providerName !== undefined) out.providerName = data.providerName;
  if (data.generatedAt !== undefined) out.generatedAt = data.generatedAt;
  if (data.contentSafetyStatus !== undefined)
    out.contentSafetyStatus = data.contentSafetyStatus;
  return out;
}

function toMediaAssetView(row: MediaAsset): AdminMediaAssetView {
  return {
    id: row.id,
    assetKey: row.assetKey,
    resultBackgroundVideoUrl: row.resultBackgroundVideoUrl,
    resultBackgroundStaticFallbackUrl: row.resultBackgroundStaticFallbackUrl,
    assetVersion: row.assetVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function zodiacOrderBy(
  sort: ZodiacSortField | undefined,
  order: "asc" | "desc"
): Prisma.ZodiacSignOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ sortOrder: "asc" }, { zodiacId: "asc" }];
    case "zodiacId":
      return [{ zodiacId: order }];
    case "displayName":
      return [{ displayName: order }, { zodiacId: "asc" }];
    case "sortOrder":
      return [{ sortOrder: order }, { zodiacId: "asc" }];
    case "enabled":
      return [{ enabled: order }, { sortOrder: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

function modeOrderBy(
  sort: HoroscopeModeSortField | undefined,
  order: "asc" | "desc"
): Prisma.HoroscopeModeOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ modeId: "asc" }];
    case "modeId":
      return [{ modeId: order }];
    case "enabled":
      return [{ enabled: order }, { modeId: "asc" }];
    case "phase":
      return [{ phase: order }, { modeId: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

function stepOrderBy(
  sort: StepConfigSortField | undefined,
  order: "asc" | "desc"
): Prisma.HoroscopeStepConfigOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ modeId: "asc" }, { order: "asc" }, { stepId: "asc" }];
    case "stepId":
      return [{ stepId: order }];
    case "modeId":
      return [{ modeId: order }, { order: "asc" }];
    case "order":
      return [{ order: order }, { stepId: "asc" }];
    case "enabled":
      return [{ enabled: order }, { order: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

function resultOrderBy(
  sort: DailyResultSortField | undefined,
  order: "asc" | "desc"
): Prisma.DailyHoroscopeResultOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ dateIst: "desc" }, { zodiacId: "asc" }];
    case "zodiacId":
      return [{ zodiacId: order }, { dateIst: "desc" }];
    case "modeId":
      return [{ modeId: order }, { dateIst: "desc" }];
    case "dateIst":
      return [{ dateIst: order }, { zodiacId: "asc" }];
    case "languageCode":
      return [{ languageCode: order }, { dateIst: "desc" }];
    case "generatedAt":
      return [{ generatedAt: order }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

function mediaAssetOrderBy(
  sort: MediaAssetSortField | undefined,
  order: "asc" | "desc"
): Prisma.MediaAssetOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ assetKey: "asc" }];
    case "assetKey":
      return [{ assetKey: order }];
    case "assetVersion":
      return [{ assetVersion: order }, { assetKey: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

/**
 * Map a Prisma unique-constraint violation (`P2002`) to a **409** with the given
 * message; re-throw anything else. Every admin create funnels through this so a
 * duplicate business key is a 409, never a 500 (TAM-100 AC (b)).
 */
function conflictOr(err: unknown, message: string): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    return new AppError(message, 409, "CONFLICT");
  }
  return err;
}

/** Narrow a Prisma `Json` `steps` column to a typed stored-step array. */
function asStoredSteps(value: unknown): StoredStep[] {
  if (!Array.isArray(value)) return [];
  const out: StoredStep[] = [];
  for (const raw of value) {
    if (raw && typeof raw === "object") {
      const s = raw as Record<string, unknown>;
      if (
        typeof s.stepId === "string" &&
        typeof s.title === "string" &&
        typeof s.displayText === "string" &&
        typeof s.ttsText === "string" &&
        typeof s.order === "number" &&
        typeof s.contentType === "string"
      ) {
        out.push({
          stepId: s.stepId,
          title: s.title,
          displayText: s.displayText,
          ttsText: s.ttsText,
          order: s.order,
          contentType: s.contentType as StepContentType,
        });
      }
    }
  }
  return out;
}
