import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { AppError, ValidationError } from "@api/shared/errors";
import type { MantrasRepository } from "@api/core/mantras/repositories";
import type {
  AdminMantraCategoryDetailView,
  AdminMantraCategoryPage,
  AdminMantraCategoryTranslationView,
  AdminMantraCategoryUpdateInput,
  AdminMantraItemDetailView,
  AdminMantraItemPage,
  AdminMantraItemUpdateInput,
  AdminMantraSectionDetailView,
  AdminMantraSectionItemView,
  AdminMantraSectionPage,
  AdminMantraSectionTranslationView,
  AdminMantraSectionUpdateInput,
  MantraCategorySortField,
  MantraItemSortField,
  MantraItemType,
  MantraLayoutType,
  MantraSectionSortField,
  MantraSectionType,
} from "@api/core/mantras/types";

const log = createModuleLogger("mantras:admin:service");

/** The media module (`entity`) token for each mantras media field (TAM-84 registry). */
const CATEGORY_ENTITY = "mantraCategory";
const ITEM_ENTITY = "mantraAudioItem";

// ---- list params -----------------------------------------------------------

export interface AdminMantraCategoryListParams {
  page: number;
  pageSize: number;
  sort?: MantraCategorySortField;
  order: "asc" | "desc";
  q?: string;
  isActive?: boolean;
}

export interface AdminMantraItemListParams {
  page: number;
  pageSize: number;
  sort?: MantraItemSortField;
  order: "asc" | "desc";
  q?: string;
  isActive?: boolean;
  type?: MantraItemType;
  categoryId?: string;
  deitySlug?: string;
  /** TAM-108: LANGUAGE MEMBERSHIP filter (locale ∈ languages, OR empty = all). */
  language?: string;
  isFeatured?: boolean;
}

export interface AdminMantraSectionListParams {
  page: number;
  pageSize: number;
  sort?: MantraSectionSortField;
  order: "asc" | "desc";
  q?: string;
  isActive?: boolean;
}

// ---- create / patch params (as parsed at the route boundary) ---------------

export interface AdminMantraCategoryCreateParams {
  slug: string;
  displayName: string;
  imageUrl: string | null;
  backgroundColorToken: string | null;
  sortOrder: number;
  isActive: boolean;
  /** TAM-110: per-locale `displayName` overrides seeded with the row. */
  translations: AdminMantraCategoryTranslationView[];
}

export interface AdminMantraCategoryUpdateParams {
  expectedUpdatedAt: string;
  displayName?: string;
  imageUrl?: string | null;
  backgroundColorToken?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  /** TAM-110: undefined ⇒ untouched; provided (incl. `[]`) ⇒ REPLACE the set. */
  translations?: AdminMantraCategoryTranslationView[];
}

export interface AdminMantraItemCreateParams {
  slug: string;
  title: string;
  type: MantraItemType;
  artworkUrl: string;
  audioUrl: string;
  singerName: string | null;
  composerName: string | null;
  mantraText: string;
  transliterationText: string | null;
  /** TAM-108: single deity slug (validated via the deity facade; `null` = none). */
  deitySlug: string | null;
  /** TAM-108: availability language set (validated vs the 8 codes; `[]` = all). */
  languages: string[];
  description: string | null;
  deepLinkUrl: string | null;
  /** ISO-8601 on the wire; converted to a `Date` before the repo write. */
  publishedAt: string | null;
  isFeatured: boolean;
  isActive: boolean;
}

export interface AdminMantraItemUpdateParams {
  expectedUpdatedAt: string;
  title?: string;
  type?: MantraItemType;
  artworkUrl?: string;
  audioUrl?: string;
  singerName?: string | null;
  composerName?: string | null;
  mantraText?: string;
  transliterationText?: string | null;
  /** TAM-108: single deity slug (validated via the facade; `null` clears it). */
  deitySlug?: string | null;
  /** TAM-108: availability language set (validated vs the 8 codes; `[]` = all). */
  languages?: string[];
  description?: string | null;
  deepLinkUrl?: string | null;
  publishedAt?: string | null;
  isFeatured?: boolean;
  isActive?: boolean;
}

export interface AdminMantraSectionCreateParams {
  sectionType: MantraSectionType;
  title: string;
  layoutType: MantraLayoutType;
  showAllEnabled: boolean;
  sortOrder: number;
  isActive: boolean;
  /** TAM-110: per-locale `title` overrides seeded with the row. */
  translations: AdminMantraSectionTranslationView[];
}

export interface AdminMantraSectionUpdateParams {
  expectedUpdatedAt: string;
  title?: string;
  layoutType?: MantraLayoutType;
  showAllEnabled?: boolean;
  sortOrder?: number;
  isActive?: boolean;
  /** TAM-110: undefined ⇒ untouched; provided (incl. `[]`) ⇒ REPLACE the set. */
  translations?: AdminMantraSectionTranslationView[];
}

/**
 * Admin write-side service for the Mantras & Stutis module (TAM-92) —
 * **Prisma-free** (all DB access delegated to `MantrasRepository`). Deliberately
 * the same shape as the deity exemplar (TAM-88):
 *   - `validateMediaUrl` — the single media call site (`validateOwnedUrl` before
 *     every media write); `deepLinkUrl` is NOT routed through it (it is an app
 *     deep link, not uploadable media);
 *   - `write*WithPrecondition` centralizing the 404-vs-409 disambiguation;
 *   - `DELETE` = deactivate (`isActive = false`), NEVER a hard delete;
 *   - #EXPORT_CRITICAL: this service **never calls the subscription facade** —
 *     admin reads return `audioUrl` in full, and the public service's
 *     fail-closed gate stays unconditional and untouched.
 */
export class MantrasAdminService {
  constructor(private readonly repo: MantrasRepository) {}

  // =========================================================================
  // categories
  // =========================================================================

  async listCategories(
    params: AdminMantraCategoryListParams
  ): Promise<AdminMantraCategoryPage> {
    const { items, total } = await this.repo.findAdminCategoryPage(params);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async getCategoryById(id: string): Promise<AdminMantraCategoryDetailView> {
    const row = await this.repo.findAdminCategoryById(id);
    if (!row) throw new AppError("Category not found", 404, "NOT_FOUND");
    return row;
  }

  async createCategory(
    params: AdminMantraCategoryCreateParams
  ): Promise<AdminMantraCategoryDetailView> {
    if (params.imageUrl !== null) {
      await this.validateMediaUrl(params.imageUrl, CATEGORY_ENTITY, "imageUrl");
    }
    const row = await this.repo.createAdminCategory({
      slug: params.slug,
      displayName: params.displayName,
      imageUrl: params.imageUrl,
      backgroundColorToken: params.backgroundColorToken,
      sortOrder: params.sortOrder,
      isActive: params.isActive,
      translations: params.translations,
    });
    log.info({ event: "mantra_category_created", id: row.id, slug: row.slug }, "category created");
    return row;
  }

  async updateCategory(
    id: string,
    params: AdminMantraCategoryUpdateParams
  ): Promise<AdminMantraCategoryDetailView> {
    if (params.imageUrl !== undefined && params.imageUrl !== null) {
      await this.validateMediaUrl(params.imageUrl, CATEGORY_ENTITY, "imageUrl");
    }
    const data: AdminMantraCategoryUpdateInput = {};
    if (params.displayName !== undefined) data.displayName = params.displayName;
    if (params.imageUrl !== undefined) data.imageUrl = params.imageUrl;
    if (params.backgroundColorToken !== undefined)
      data.backgroundColorToken = params.backgroundColorToken;
    if (params.sortOrder !== undefined) data.sortOrder = params.sortOrder;
    if (params.isActive !== undefined) data.isActive = params.isActive;
    await this.writeCategoryWithPrecondition(
      id,
      params.expectedUpdatedAt,
      data,
      params.translations
    );
    log.info({ event: "mantra_category_updated", id }, "category updated");
    return this.getCategoryById(id);
  }

  async deactivateCategory(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminMantraCategoryDetailView> {
    await this.writeCategoryWithPrecondition(id, expectedUpdatedAt, {
      isActive: false,
    });
    log.info({ event: "mantra_category_deactivated", id }, "category deactivated");
    return this.getCategoryById(id);
  }

  // =========================================================================
  // audio items
  // =========================================================================

  async listItems(
    params: AdminMantraItemListParams
  ): Promise<AdminMantraItemPage> {
    const { items, total } = await this.repo.findAdminItemPage(params);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async getItemById(id: string): Promise<AdminMantraItemDetailView> {
    const row = await this.repo.findAdminItemById(id);
    if (!row) throw new AppError("Mantra item not found", 404, "NOT_FOUND");
    return row;
  }

  async createItem(
    params: AdminMantraItemCreateParams
  ): Promise<AdminMantraItemDetailView> {
    // TAM-108: validate the single deity slug through the facade BEFORE the
    // write (unknown → 400, no row written); a deactivated deity is permitted.
    if (params.deitySlug !== null) {
      await this.validateDeitySlug(params.deitySlug);
    }
    // Media validation BEFORE the write — a failure is a 400 and no row is written.
    await this.validateMediaUrl(params.artworkUrl, ITEM_ENTITY, "artworkUrl");
    await this.validateMediaUrl(params.audioUrl, ITEM_ENTITY, "audioUrl");
    const row = await this.repo.createAdminItem({
      slug: params.slug,
      title: params.title,
      type: params.type,
      artworkUrl: params.artworkUrl,
      audioUrl: params.audioUrl,
      singerName: params.singerName,
      composerName: params.composerName,
      mantraText: params.mantraText,
      transliterationText: params.transliterationText,
      deitySlug: params.deitySlug,
      languages: params.languages,
      description: params.description,
      deepLinkUrl: params.deepLinkUrl,
      publishedAt: params.publishedAt ? new Date(params.publishedAt) : null,
      isFeatured: params.isFeatured,
      isActive: params.isActive,
    });
    log.info({ event: "mantra_item_created", id: row.id, slug: row.slug }, "item created");
    await this.syncHomeFeed(row);
    return row;
  }

  /**
   * Auto-feed: mirror this mantra item into the Home feed (best-effort).
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
  private async syncHomeFeed(row: AdminMantraItemDetailView): Promise<void> {
    try {
      await performServiceCall(
        "home",
        (home) =>
          home.upsertContentFeedCard({
            contentType: "mantra",
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
            heroImageUrl: row.artworkUrl,
            audioPreviewUrl: row.audioUrl,
          }),
        "mantras:home-feed",
        "home feed sync failed"
      );
    } catch (err) {
      log.warn({ err, id: row.id }, "home feed auto-card failed (non-fatal)");
    }
  }

  async updateItem(
    id: string,
    params: AdminMantraItemUpdateParams
  ): Promise<AdminMantraItemDetailView> {
    // TAM-108: re-validate the deity slug through the facade when it is being
    // SET to a non-null value (unknown → 400, no write). `null` clears it.
    if (params.deitySlug !== undefined && params.deitySlug !== null) {
      await this.validateDeitySlug(params.deitySlug);
    }
    if (params.artworkUrl !== undefined) {
      await this.validateMediaUrl(params.artworkUrl, ITEM_ENTITY, "artworkUrl");
    }
    if (params.audioUrl !== undefined) {
      await this.validateMediaUrl(params.audioUrl, ITEM_ENTITY, "audioUrl");
    }
    const data: AdminMantraItemUpdateInput = {};
    if (params.title !== undefined) data.title = params.title;
    if (params.type !== undefined) data.type = params.type;
    if (params.artworkUrl !== undefined) data.artworkUrl = params.artworkUrl;
    if (params.audioUrl !== undefined) data.audioUrl = params.audioUrl;
    if (params.singerName !== undefined) data.singerName = params.singerName;
    if (params.composerName !== undefined)
      data.composerName = params.composerName;
    if (params.mantraText !== undefined) data.mantraText = params.mantraText;
    if (params.transliterationText !== undefined)
      data.transliterationText = params.transliterationText;
    if (params.deitySlug !== undefined) data.deitySlug = params.deitySlug;
    if (params.languages !== undefined) data.languages = params.languages;
    if (params.description !== undefined) data.description = params.description;
    if (params.deepLinkUrl !== undefined) data.deepLinkUrl = params.deepLinkUrl;
    if (params.publishedAt !== undefined)
      data.publishedAt = params.publishedAt ? new Date(params.publishedAt) : null;
    if (params.isFeatured !== undefined) data.isFeatured = params.isFeatured;
    if (params.isActive !== undefined) data.isActive = params.isActive;
    await this.writeItemWithPrecondition(id, params.expectedUpdatedAt, data);
    log.info({ event: "mantra_item_updated", id }, "item updated");
    // Re-read rather than reuse the patch: `syncHomeFeed` needs the row as it
    // stands AFTER the write, and this method's params are a partial patch.
    const updated = await this.getItemById(id);
    await this.syncHomeFeed(updated);
    return updated;
  }

  async deactivateItem(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminMantraItemDetailView> {
    await this.writeItemWithPrecondition(id, expectedUpdatedAt, {
      isActive: false,
    });
    log.info({ event: "mantra_item_deactivated", id }, "item deactivated");
    const deactivated = await this.getItemById(id);
    await this.syncHomeFeed(deactivated);
    return deactivated;
  }

  /**
   * Replace the item's category-tag set (set-semantics). Unknown `categoryId` →
   * 400 and the WHOLE set is rejected (no partial application). `MantraCategoryTag`
   * has a real FK, so the replacement is a genuine delete + re-create.
   */
  async setCategoryTags(
    id: string,
    categoryIds: string[]
  ): Promise<AdminMantraItemDetailView> {
    await this.ensureItemExists(id);
    const unique = [...new Set(categoryIds)];
    const existing = await this.repo.findExistingCategoryIds(unique);
    if (existing.length !== unique.length) {
      const missing = unique.filter((cid) => !existing.includes(cid));
      throw new ValidationError(
        `Unknown category id(s): ${missing.join(", ")}`
      );
    }
    await this.repo.setItemCategoryTags(id, unique);
    log.info({ event: "mantra_item_category_tags_set", id, count: unique.length }, "category tags set");
    return this.getItemById(id);
  }

  // =========================================================================
  // homepage sections
  // =========================================================================

  async listSections(
    params: AdminMantraSectionListParams
  ): Promise<AdminMantraSectionPage> {
    const { items, total } = await this.repo.findAdminSectionPage(params);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async getSectionById(id: string): Promise<AdminMantraSectionDetailView> {
    const row = await this.repo.findAdminSectionById(id);
    if (!row) throw new AppError("Section not found", 404, "NOT_FOUND");
    return row;
  }

  async createSection(
    params: AdminMantraSectionCreateParams
  ): Promise<AdminMantraSectionDetailView> {
    const row = await this.repo.createAdminSection({
      sectionType: params.sectionType,
      title: params.title,
      layoutType: params.layoutType,
      showAllEnabled: params.showAllEnabled,
      sortOrder: params.sortOrder,
      isActive: params.isActive,
      translations: params.translations,
    });
    log.info({ event: "mantra_section_created", id: row.id, sectionType: row.sectionType }, "section created");
    return row;
  }

  async updateSection(
    id: string,
    params: AdminMantraSectionUpdateParams
  ): Promise<AdminMantraSectionDetailView> {
    const data: AdminMantraSectionUpdateInput = {};
    if (params.title !== undefined) data.title = params.title;
    if (params.layoutType !== undefined) data.layoutType = params.layoutType;
    if (params.showAllEnabled !== undefined)
      data.showAllEnabled = params.showAllEnabled;
    if (params.sortOrder !== undefined) data.sortOrder = params.sortOrder;
    if (params.isActive !== undefined) data.isActive = params.isActive;
    await this.writeSectionWithPrecondition(
      id,
      params.expectedUpdatedAt,
      data,
      params.translations
    );
    log.info({ event: "mantra_section_updated", id }, "section updated");
    return this.getSectionById(id);
  }

  async deactivateSection(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminMantraSectionDetailView> {
    await this.writeSectionWithPrecondition(id, expectedUpdatedAt, {
      isActive: false,
    });
    log.info({ event: "mantra_section_deactivated", id }, "section deactivated");
    return this.getSectionById(id);
  }

  /**
   * TAM-160: REPLACE a curated section's membership in array order (`position` =
   * index). ONLY `curated` sections use `MantraHomepageSectionItem` — a `PUT`
   * against a built-in type is a 400 (its items resolve server-side; silently
   * accepting the write would leave the editor believing they curated a section
   * that ignores them). Unknown `itemId` → 400 with the WHOLE set rejected
   * (nothing is written). Mirrors `WallpaperAdminService.setRowItems`.
   */
  async setSectionItems(
    sectionId: string,
    itemIds: string[]
  ): Promise<AdminMantraSectionItemView[]> {
    const sectionType = await this.repo.findSectionTypeById(sectionId);
    if (sectionType === null) {
      throw new AppError("Section not found", 404, "NOT_FOUND");
    }
    if (sectionType !== "curated") {
      // Same errorCode as the aarti mirror (`aarti.admin.service.ts`): the two
      // modules present ONE contract to the CMS, so a client branching on
      // errorCode must not get a code for aarti and a bare 400 for mantras.
      throw new ValidationError(
        `Item curation is only available for 'curated' sections; this section is '${sectionType}'`,
        "SECTION_NOT_CURATED"
      );
    }
    if (itemIds.length > 0) {
      const existing = new Set(await this.repo.findExistingItemIds(itemIds));
      const unknown = itemIds.filter((id) => !existing.has(id));
      if (unknown.length > 0) {
        throw new ValidationError(
          `Unknown item id(s): ${unknown.join(", ")}`,
          "UNKNOWN_ITEM_ID"
        );
      }
    }
    const items = await this.repo.replaceSectionItems(sectionId, itemIds);
    log.info(
      { event: "mantra_section_items_set", sectionId, count: items.length },
      "section items set"
    );
    return items;
  }

  // =========================================================================
  // internals
  // =========================================================================

  private async writeCategoryWithPrecondition(
    id: string,
    expectedUpdatedAt: string,
    data: AdminMantraCategoryUpdateInput,
    translations?: AdminMantraCategoryTranslationView[]
  ): Promise<void> {
    const count = await this.repo.updateCategoryWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data,
      translations,
    });
    if (count === 0) {
      if (!(await this.repo.categoryExistsById(id))) {
        throw new AppError("Category not found", 404, "NOT_FOUND");
      }
      throw new AppError(
        "Category was modified by someone else; reload and retry",
        409,
        "STALE_WRITE"
      );
    }
  }

  private async writeItemWithPrecondition(
    id: string,
    expectedUpdatedAt: string,
    data: AdminMantraItemUpdateInput
  ): Promise<void> {
    const count = await this.repo.updateItemWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data,
    });
    if (count === 0) {
      if (!(await this.repo.itemExistsById(id))) {
        throw new AppError("Mantra item not found", 404, "NOT_FOUND");
      }
      throw new AppError(
        "Mantra item was modified by someone else; reload and retry",
        409,
        "STALE_WRITE"
      );
    }
  }

  private async writeSectionWithPrecondition(
    id: string,
    expectedUpdatedAt: string,
    data: AdminMantraSectionUpdateInput,
    translations?: AdminMantraSectionTranslationView[]
  ): Promise<void> {
    const count = await this.repo.updateSectionWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data,
      translations,
    });
    if (count === 0) {
      if (!(await this.repo.sectionExistsById(id))) {
        throw new AppError("Section not found", 404, "NOT_FOUND");
      }
      throw new AppError(
        "Section was modified by someone else; reload and retry",
        409,
        "STALE_WRITE"
      );
    }
  }

  private async ensureItemExists(id: string): Promise<void> {
    if (!(await this.repo.itemExistsById(id))) {
      throw new AppError("Mantra item not found", 404, "NOT_FOUND");
    }
  }

  /**
   * TAM-108: validate a single deity slug through the deity facade (logical
   * reference, NO DB FK). Called BEFORE any create/patch that SETS a non-null
   * `deitySlug`. Unknown slug → `ValidationError` (400) and no row is written;
   * pointing at a DEACTIVATED deity is permitted (the slug only has to exist).
   */
  private async validateDeitySlug(slug: string): Promise<void> {
    const deity = await performServiceCall(
      "deity",
      (d) => d.getBySlug(slug),
      "mantras:admin:validateDeitySlug",
      "deity validation is unavailable"
    );
    if (!deity) {
      throw new ValidationError(`Unknown deity slug: ${slug}`);
    }
  }

  /**
   * Media-URL ownership validation (ADR §A4) — called BEFORE persisting any media
   * column. Confirms the URL was minted by our own presign flow (prefix +
   * `<module>/<entity>/<uuid>.<ext>` key shape) and HEADs the object; a failure
   * throws `ValidationError` (→ 400) and no row is written. #EXPORT_CRITICAL.
   *
   * `deepLinkUrl` is deliberately NOT routed here — it is an app deep link, not
   * uploadable media (validated as a plain URL string at the Zod boundary).
   */
  private async validateMediaUrl(
    url: string,
    entity: string,
    field: string
  ): Promise<void> {
    await performServiceCall(
      "media",
      (m) => m.validateOwnedUrl({ url, module: "mantras", entity, field }),
      "mantras:admin:validateOwnedUrl",
      "media URL validation is unavailable"
    );
  }
}
