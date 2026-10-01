import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { AppError, ValidationError } from "@api/shared/errors";
import type { LanguageCode } from "@api/shared/language.schema";
import type { AartiRepository } from "@api/core/aarti/repositories";
import type {
  AartiSectionType,
  AdminAudioCategoryDetailView,
  AdminAudioCategoryPage,
  AdminAudioCategoryUpdateInput,
  AdminAudioItemDetailView,
  AdminAudioItemPage,
  AdminAudioItemUpdateInput,
  AdminHomepageSectionDetailView,
  AdminHomepageSectionItemView,
  AdminHomepageSectionPage,
  AdminHomepageSectionUpdateInput,
  AudioCategorySortField,
  AudioItemSortField,
  HomepageSectionSortField,
} from "@api/core/aarti/types";

const log = createModuleLogger("aarti:admin:service");

// ---------------------------------------------------------------------------
// parsed-input param shapes (Zod defaults already applied at the boundary)
// ---------------------------------------------------------------------------

export interface AdminCategoryListParams {
  page: number;
  pageSize: number;
  sort?: AudioCategorySortField;
  order: "asc" | "desc";
  q?: string;
  isActive?: boolean;
}

export interface AdminCategoryCreateParams {
  slug: string;
  name: string;
  imageUrl?: string | null;
  description?: string | null;
  displayColor?: string | null;
  sortOrder: number;
  isActive: boolean;
  // TAM-109: per-locale label overrides embedded in the create body.
  translations: { locale: string; name: string; description?: string }[];
}

export interface AdminCategoryUpdateParams {
  expectedUpdatedAt: string;
  name?: string;
  imageUrl?: string | null;
  description?: string | null;
  displayColor?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  // TAM-109: undefined ⇒ leave untouched; provided (incl. []) ⇒ replace the set.
  translations?: { locale: string; name: string; description?: string }[];
}

export interface AdminItemListParams {
  page: number;
  pageSize: number;
  sort?: AudioItemSortField;
  order: "asc" | "desc";
  q?: string;
  isActive?: boolean;
  categoryId?: string;
  deitySlug?: string;
  isFeatured?: boolean;
  isPrabhujiOriginal?: boolean;
}

export interface AdminItemCreateParams {
  slug: string;
  title: string;
  coverImageUrl: string;
  audioStreamUrl: string;
  singerName?: string | null;
  composerNames?: string | null;
  // TAM-108: single-deity + multi-language content model.
  deitySlug: string;
  languages: LanguageCode[];
  description?: string | null;
  publishedAt?: string | null;
  isFeatured: boolean;
  isPrabhujiOriginal: boolean;
  isActive: boolean;
}

export interface AdminItemUpdateParams {
  expectedUpdatedAt: string;
  title?: string;
  coverImageUrl?: string;
  audioStreamUrl?: string;
  singerName?: string | null;
  composerNames?: string | null;
  // TAM-108: single-deity + multi-language content model.
  deitySlug?: string;
  languages?: LanguageCode[];
  description?: string | null;
  publishedAt?: string | null;
  isFeatured?: boolean;
  isPrabhujiOriginal?: boolean;
  isActive?: boolean;
}

export interface AdminSectionListParams {
  page: number;
  pageSize: number;
  sort?: HomepageSectionSortField;
  order: "asc" | "desc";
  q?: string;
  isActive?: boolean;
}

export interface AdminSectionCreateParams {
  sectionType: AartiSectionType;
  title: string;
  sortOrder: number;
  isActive: boolean;
  itemQuery?: string | null;
  // TAM-109: per-locale title overrides embedded in the create body.
  translations: { locale: string; title: string }[];
}

export interface AdminSectionUpdateParams {
  expectedUpdatedAt: string;
  title?: string;
  sortOrder?: number;
  isActive?: boolean;
  itemQuery?: string | null;
  // TAM-109: undefined ⇒ leave untouched; provided (incl. []) ⇒ replace the set.
  translations?: { locale: string; title: string }[];
}

/**
 * Admin write-side service for the Aarti & Bhajans module (TAM-90) —
 * **Prisma-free** (all DB access is delegated to `AartiRepository`). Mirrors the
 * TAM-88 deity exemplar's shape across three entities.
 *
 * #EXPORT_CRITICAL — admin reads are NOT Pro-gated and this service **NEVER
 * calls the subscription facade**: `getItemById` returns `audioStreamUrl` in
 * full so an editor sees what they are editing (ADR §C1). The public
 * `AartiService`'s fail-closed entitlement gate is a physically separate path
 * and stays untouched — there is no bypass flag threaded through it.
 *
 * Two write-path validations run BEFORE any DB write (both via
 * `performServiceCall`, never by importing another module's internals):
 *   - every media column (`imageUrl`, `coverImageUrl`, `audioStreamUrl`) is
 *     ownership-checked by `media.validateOwnedUrl` (ADR §A4) → 400 on failure;
 *   - every `deitySlug` tag is checked through `deity.getBySlug` (there is NO
 *     DB FK; TAM-57) → 400 on an unknown slug.
 */
export class AartiAdminService {
  constructor(private readonly repo: AartiRepository) {}

  // =======================================================================
  // AudioCategory
  // =======================================================================

  async listCategories(
    params: AdminCategoryListParams
  ): Promise<AdminAudioCategoryPage> {
    return this.repo.findAdminCategoryPage(params);
  }

  async getCategoryById(id: string): Promise<AdminAudioCategoryDetailView> {
    const row = await this.repo.findAdminCategoryById(id);
    if (!row) throw new AppError("Category not found", 404, "NOT_FOUND");
    return row;
  }

  async createCategory(
    params: AdminCategoryCreateParams
  ): Promise<AdminAudioCategoryDetailView> {
    const imageUrl = params.imageUrl ?? null;
    if (imageUrl !== null) {
      await this.validateMediaUrl(imageUrl, "audioCategory", "imageUrl");
    }
    const row = await this.repo.createAdminCategory({
      slug: params.slug,
      name: params.name,
      imageUrl,
      description: params.description ?? null,
      displayColor: params.displayColor ?? null,
      sortOrder: params.sortOrder,
      isActive: params.isActive,
      translations: toCategoryTranslationRows(params.translations),
    });
    log.info(
      { event: "aarti_admin_category_created", id: row.id, slug: row.slug },
      "category created"
    );
    return row;
  }

  async updateCategory(
    id: string,
    params: AdminCategoryUpdateParams
  ): Promise<AdminAudioCategoryDetailView> {
    if (params.imageUrl !== undefined && params.imageUrl !== null) {
      await this.validateMediaUrl(params.imageUrl, "audioCategory", "imageUrl");
    }
    const data: AdminAudioCategoryUpdateInput = {};
    if (params.name !== undefined) data.name = params.name;
    if (params.imageUrl !== undefined) data.imageUrl = params.imageUrl;
    if (params.description !== undefined) data.description = params.description;
    if (params.displayColor !== undefined) data.displayColor = params.displayColor;
    if (params.sortOrder !== undefined) data.sortOrder = params.sortOrder;
    if (params.isActive !== undefined) data.isActive = params.isActive;
    // TAM-109: undefined ⇒ leave translations untouched; provided ⇒ replace-set.
    const translations =
      params.translations === undefined
        ? undefined
        : toCategoryTranslationRows(params.translations);
    const row = await this.writeWithPrecondition(
      "Category",
      () =>
        this.repo.updateCategoryWithPrecondition({
          id,
          expectedUpdatedAt: new Date(params.expectedUpdatedAt),
          data,
          translations,
        }),
      () => this.repo.categoryExistsById(id),
      () => this.getCategoryById(id)
    );
    log.info({ event: "aarti_admin_category_updated", id }, "category updated");
    return row;
  }

  /** "Delete" = deactivate (`isActive = false`); the row survives (ADR §C4). */
  async deactivateCategory(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminAudioCategoryDetailView> {
    const row = await this.writeWithPrecondition(
      "Category",
      () =>
        this.repo.updateCategoryWithPrecondition({
          id,
          expectedUpdatedAt: new Date(expectedUpdatedAt),
          data: { isActive: false },
        }),
      () => this.repo.categoryExistsById(id),
      () => this.getCategoryById(id)
    );
    log.info(
      { event: "aarti_admin_category_deactivated", id },
      "category deactivated"
    );
    return row;
  }

  // =======================================================================
  // AudioItem
  // =======================================================================

  async listItems(params: AdminItemListParams): Promise<AdminAudioItemPage> {
    return this.repo.findAdminItemPage(params);
  }

  /**
   * Full audio detail — `audioStreamUrl` in FULL. NOT Pro-gated: this service
   * never consults the subscription facade (#EXPORT_CRITICAL).
   */
  async getItemById(id: string): Promise<AdminAudioItemDetailView> {
    const row = await this.repo.findAdminItemById(id);
    if (!row) throw new AppError("Audio item not found", 404, "NOT_FOUND");
    return row;
  }

  async createItem(
    params: AdminItemCreateParams
  ): Promise<AdminAudioItemDetailView> {
    await this.validateMediaUrl(params.coverImageUrl, "audioItem", "coverImageUrl");
    await this.validateMediaUrl(
      params.audioStreamUrl,
      "audioItem",
      "audioStreamUrl"
    );
    await this.validateDeitySlug(params.deitySlug);
    const row = await this.repo.createAdminItem({
      slug: params.slug,
      title: params.title,
      coverImageUrl: params.coverImageUrl,
      audioStreamUrl: params.audioStreamUrl,
      singerName: params.singerName ?? null,
      composerNames: params.composerNames ?? null,
      deitySlug: params.deitySlug,
      languages: params.languages,
      description: params.description ?? null,
      publishedAt: parseNullableDate(params.publishedAt),
      isFeatured: params.isFeatured,
      isPrabhujiOriginal: params.isPrabhujiOriginal,
      isActive: params.isActive,
    });
    log.info(
      { event: "aarti_admin_item_created", id: row.id, slug: row.slug },
      "audio item created"
    );
    await this.syncHomeFeed(row);
    return row;
  }

  /**
   * Auto-feed: mirror this audio item into the Home feed (best-effort).
   *
   * TAM-176 — takes the POST-WRITE ROW, not the request params, and runs on
   * create, update AND deactivate. Params are a partial patch on update, so
   * they cannot describe the card; the row is the truth after the write. The
   * card's slug is derived from the content slug, which is immutable, so every
   * call updates the same card rather than making a new one.
   *
   * Best-effort by design: a Home-feed hiccup must never fail a content write,
   * and the next edit re-syncs anyway.
   */
  private async syncHomeFeed(row: AdminAudioItemDetailView): Promise<void> {
    try {
      await performServiceCall(
        "home",
        (home) =>
          home.upsertContentFeedCard({
            contentType: "aarti",
            contentId: row.id,
            contentSlug: row.slug,
            // TAM-175 — the card inherits its content's deity so the Home feed
            // can build a per-god pool. Null stays null: an untagged item is an
            // "any god" card, never silently assigned one.
            deitySlug: row.deitySlug,
            // TAM-176 — the card follows its content's lifecycle. The feed
            // never joins back to the source row, so this is the only thing
            // keeping a deactivated item out of it.
            isActive: row.isActive,
            title: row.title,
            heroImageUrl: row.coverImageUrl,
            audioPreviewUrl: row.audioStreamUrl,
          }),
        "aarti:home-feed",
        "home feed sync failed"
      );
    } catch (err) {
      log.warn({ err, id: row.id }, "home feed auto-card failed (non-fatal)");
    }
  }

  async updateItem(
    id: string,
    params: AdminItemUpdateParams
  ): Promise<AdminAudioItemDetailView> {
    if (params.coverImageUrl !== undefined) {
      await this.validateMediaUrl(params.coverImageUrl, "audioItem", "coverImageUrl");
    }
    if (params.audioStreamUrl !== undefined) {
      await this.validateMediaUrl(
        params.audioStreamUrl,
        "audioItem",
        "audioStreamUrl"
      );
    }
    if (params.deitySlug !== undefined) {
      await this.validateDeitySlug(params.deitySlug);
    }
    const data: AdminAudioItemUpdateInput = {};
    if (params.title !== undefined) data.title = params.title;
    if (params.coverImageUrl !== undefined) data.coverImageUrl = params.coverImageUrl;
    if (params.audioStreamUrl !== undefined) data.audioStreamUrl = params.audioStreamUrl;
    if (params.singerName !== undefined) data.singerName = params.singerName;
    if (params.composerNames !== undefined) data.composerNames = params.composerNames;
    if (params.deitySlug !== undefined) data.deitySlug = params.deitySlug;
    if (params.languages !== undefined) data.languages = params.languages;
    if (params.description !== undefined) data.description = params.description;
    if (params.publishedAt !== undefined) {
      data.publishedAt = parseNullableDate(params.publishedAt);
    }
    if (params.isFeatured !== undefined) data.isFeatured = params.isFeatured;
    if (params.isPrabhujiOriginal !== undefined) {
      data.isPrabhujiOriginal = params.isPrabhujiOriginal;
    }
    if (params.isActive !== undefined) data.isActive = params.isActive;
    const row = await this.writeWithPrecondition(
      "Audio item",
      () =>
        this.repo.updateItemWithPrecondition({
          id,
          expectedUpdatedAt: new Date(params.expectedUpdatedAt),
          data,
        }),
      () => this.repo.itemExistsById(id),
      () => this.getItemById(id)
    );
    log.info({ event: "aarti_admin_item_updated", id }, "audio item updated");
    await this.syncHomeFeed(row);
    return row;
  }

  /** "Delete" = deactivate (`isActive = false`); the row survives (ADR §C4). */
  async deactivateItem(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminAudioItemDetailView> {
    const row = await this.writeWithPrecondition(
      "Audio item",
      () =>
        this.repo.updateItemWithPrecondition({
          id,
          expectedUpdatedAt: new Date(expectedUpdatedAt),
          data: { isActive: false },
        }),
      () => this.repo.itemExistsById(id),
      () => this.getItemById(id)
    );
    log.info({ event: "aarti_admin_item_deactivated", id }, "audio item deactivated");
    await this.syncHomeFeed(row);
    return row;
  }

  /**
   * Replace an item's category tag set (set-semantics; one `$transaction`). An
   * unknown `categoryId` → 400 (no partial write). `AudioCategoryTag` has a real
   * FK, so removing a tag is a correct delete of a join row (ADR §C4).
   */
  async setCategoryTags(
    id: string,
    categoryIds: string[]
  ): Promise<AdminAudioItemDetailView> {
    await this.ensureItemExists(id);
    const unique = [...new Set(categoryIds)];
    if (unique.length > 0) {
      const existing = await this.repo.findExistingCategoryIds(unique);
      const missing = unique.filter((cid) => !existing.includes(cid));
      if (missing.length > 0) {
        throw new ValidationError(
          `Unknown category id(s): ${missing.join(", ")}`,
          "UNKNOWN_CATEGORY_ID"
        );
      }
    }
    await this.repo.setCategoryTags(id, unique);
    log.info(
      { event: "aarti_admin_item_category_tags_set", id, count: unique.length },
      "category tags replaced"
    );
    return this.getItemById(id);
  }

  // =======================================================================
  // HomepageSection
  // =======================================================================

  async listSections(
    params: AdminSectionListParams
  ): Promise<AdminHomepageSectionPage> {
    return this.repo.findAdminSectionPage(params);
  }

  async getSectionById(id: string): Promise<AdminHomepageSectionDetailView> {
    const row = await this.repo.findAdminSectionById(id);
    if (!row) throw new AppError("Section not found", 404, "NOT_FOUND");
    return row;
  }

  /**
   * A duplicate BUILT-IN `sectionType` → 409 (raised in the repo by the partial
   * unique index). TAM-160: many `curated` sections are allowed, so there is
   * deliberately NO service-level uniqueness check here — that would be a
   * `findFirst`-then-`create` race (#PATH_DECISION 1).
   */
  async createSection(
    params: AdminSectionCreateParams
  ): Promise<AdminHomepageSectionDetailView> {
    const row = await this.repo.createAdminSection({
      sectionType: params.sectionType,
      title: params.title,
      sortOrder: params.sortOrder,
      isActive: params.isActive,
      itemQuery: params.itemQuery ?? null,
      translations: params.translations,
    });
    log.info(
      {
        event: "aarti_admin_section_created",
        id: row.id,
        sectionType: row.sectionType,
      },
      "section created"
    );
    return row;
  }

  async updateSection(
    id: string,
    params: AdminSectionUpdateParams
  ): Promise<AdminHomepageSectionDetailView> {
    const data: AdminHomepageSectionUpdateInput = {};
    if (params.title !== undefined) data.title = params.title;
    if (params.sortOrder !== undefined) data.sortOrder = params.sortOrder;
    if (params.isActive !== undefined) data.isActive = params.isActive;
    if (params.itemQuery !== undefined) data.itemQuery = params.itemQuery;
    const row = await this.writeWithPrecondition(
      "Section",
      () =>
        this.repo.updateSectionWithPrecondition({
          id,
          expectedUpdatedAt: new Date(params.expectedUpdatedAt),
          data,
          // TAM-109: undefined ⇒ untouched; provided (incl. []) ⇒ replace-set.
          translations: params.translations,
        }),
      () => this.repo.sectionExistsById(id),
      () => this.getSectionById(id)
    );
    log.info({ event: "aarti_admin_section_updated", id }, "section updated");
    return row;
  }

  /**
   * TAM-160: REPLACE a curated section's items in array order (`position` =
   * index). ONLY `curated` sections use `HomepageSectionItem` — a `PUT` against
   * a built-in type is a 400 (its items resolve server-side; silently accepting
   * the write would leave the editor believing they curated a section that
   * ignores them). Unknown `audioId` → 400, whole set rejected, NOTHING written.
   * Mirrors `WallpaperAdminService.setRowItems`.
   */
  async setSectionItems(
    sectionId: string,
    audioIds: string[]
  ): Promise<AdminHomepageSectionItemView[]> {
    const sectionType = await this.repo.findSectionTypeById(sectionId);
    if (sectionType === null) {
      throw new AppError("Section not found", 404, "NOT_FOUND");
    }
    if (sectionType !== "curated") {
      throw new ValidationError(
        `Item curation is only available for 'curated' sections; this section is '${sectionType}'`,
        "SECTION_NOT_CURATED"
      );
    }
    if (audioIds.length > 0) {
      const existing = new Set(await this.repo.findExistingAudioIds(audioIds));
      const unknown = audioIds.filter((id) => !existing.has(id));
      if (unknown.length > 0) {
        throw new ValidationError(
          `Unknown audio id(s): ${unknown.join(", ")}`,
          "UNKNOWN_AUDIO_ID"
        );
      }
    }
    const items = await this.repo.replaceSectionItems(sectionId, audioIds);
    log.info(
      {
        event: "aarti_admin_section_items_set",
        id: sectionId,
        count: items.length,
      },
      "section items replaced"
    );
    return items;
  }

  /** "Delete" = deactivate (`isActive = false`); hides it from `/aarti/main`. */
  async deactivateSection(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminHomepageSectionDetailView> {
    const row = await this.writeWithPrecondition(
      "Section",
      () =>
        this.repo.updateSectionWithPrecondition({
          id,
          expectedUpdatedAt: new Date(expectedUpdatedAt),
          data: { isActive: false },
        }),
      () => this.repo.sectionExistsById(id),
      () => this.getSectionById(id)
    );
    log.info(
      { event: "aarti_admin_section_deactivated", id },
      "section deactivated"
    );
    return row;
  }

  // =======================================================================
  // internals
  // =======================================================================

  /**
   * The single write that carries the optimistic-concurrency precondition, and
   * the single place 404 vs 409 is decided (ADR §C3) — shared by all three
   * entities. A 0-count from the `updateMany` is ambiguous (the row could be
   * GONE → 404, or the caller's `updatedAt` STALE → 409), so a follow-up
   * existence check disambiguates. On success it re-reads the fresh row.
   */
  private async writeWithPrecondition<T>(
    label: string,
    update: () => Promise<number>,
    exists: () => Promise<boolean>,
    reload: () => Promise<T>
  ): Promise<T> {
    const count = await update();
    if (count === 0) {
      if (!(await exists())) {
        throw new AppError(`${label} not found`, 404, "NOT_FOUND");
      }
      throw new AppError(
        `${label} was modified by someone else; reload and retry`,
        409,
        "STALE_WRITE"
      );
    }
    return reload();
  }

  private async ensureItemExists(id: string): Promise<void> {
    if (!(await this.repo.itemExistsById(id))) {
      throw new AppError("Audio item not found", 404, "NOT_FOUND");
    }
  }

  /**
   * Media-URL ownership validation (ADR §A4) — called BEFORE persisting ANY
   * media column. Reaches `IMediaApi.validateOwnedUrl` (TAM-84) ONLY via
   * `performServiceCall`; it throws `ValidationError` (→ 400) unless the URL was
   * minted by our presign flow for this exact `(module, entity, field)` and the
   * object exists with an allowlisted content-type. `entity` is the camelCase
   * model name — the frozen TAM-84 registry tokens (`aarti.audioItem.coverImageUrl`,
   * `aarti.audioItem.audioStreamUrl`, `aarti.audioCategory.imageUrl`).
   */
  private async validateMediaUrl(
    url: string,
    entity: "audioItem" | "audioCategory",
    field: string
  ): Promise<void> {
    await performServiceCall(
      "media",
      (m) => m.validateOwnedUrl({ url, module: "aarti", entity, field }),
      "aarti:admin:media",
      "media URL validation failed"
    );
  }

  /**
   * TAM-108: validate the item's SINGLE `deitySlug` through the deity facade
   * (`IDeityApi.getBySlug`). There is NO DB FK on `AudioItem.deitySlug` (TAM-57),
   * so the database cannot catch a typo — an invalid slug would silently vanish
   * from every deity filter. An unknown slug → 400. A DEACTIVATED deity is
   * accepted (the reference stays referentially meaningful).
   */
  private async validateDeitySlug(slug: string): Promise<void> {
    const deity = await performServiceCall(
      "deity",
      (d) => d.getBySlug(slug),
      "aarti:admin:deity",
      "failed to validate deity"
    );
    if (!deity) {
      throw new ValidationError(
        `Unknown deity slug "${slug}"`,
        "UNKNOWN_DEITY_SLUG"
      );
    }
  }
}

/** Parse an optional/nullable ISO-8601 string to a `Date | null`. */
function parseNullableDate(value: string | null | undefined): Date | null {
  return value === null || value === undefined ? null : new Date(value);
}

/**
 * TAM-109: normalize embedded category translations for the repo — `description`
 * is `.optional()` at the Zod boundary (`string | undefined`) but the column is
 * nullable (`string | null`), so an absent description becomes an explicit null.
 */
function toCategoryTranslationRows(
  translations: { locale: string; name: string; description?: string }[]
): { locale: string; name: string; description: string | null }[] {
  return translations.map((t) => ({
    locale: t.locale,
    name: t.name,
    description: t.description ?? null,
  }));
}
