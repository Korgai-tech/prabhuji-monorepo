import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { AppError, ValidationError } from "@api/shared/errors";
import type { WallpaperRepository } from "@api/core/wallpaper/repositories";
import type {
  AdminWallpaperDetailView,
  AdminWallpaperPage,
  AdminWallpaperRowDetailView,
  AdminWallpaperRowItemView,
  AdminWallpaperRowPage,
  AdminWallpaperRowTranslationView,
  AdminWallpaperRowUpdateInput,
  AdminWallpaperUpdateInput,
  FocalPoint,
  SafeAreaMetadata,
  WallpaperMediaType,
  WallpaperRowSortField,
  WallpaperRowType,
  WallpaperSortField,
} from "@api/core/wallpaper/types";

const log = createModuleLogger("wallpaper:admin:service");

/** The wallpaper `(module, entity)` half of every media triple (TAM-84 registry). */
const MEDIA_MODULE = "wallpaper";
const MEDIA_ENTITY = "wallpaper";

/** The five media fields, each with its own registry triple (AC (e)). */
type WallpaperMediaField =
  | "thumbnailUrl"
  | "previewImageUrl"
  | "fallbackStaticThumbnailUrl"
  | "previewVideoUrl"
  | "liveWallpaperAssetUrl";

/** List params — the parsed admin query (offset + allowlisted sort + filters). */
export interface AdminWallpaperListParams {
  page: number;
  pageSize: number;
  sort?: WallpaperSortField;
  order: "asc" | "desc";
  q?: string;
  isActive?: boolean;
  mediaType?: WallpaperMediaType;
  deitySlug?: string;
}

/** Create params — a fully-parsed create body (Zod defaults already applied). */
export interface AdminWallpaperCreateParams {
  slug: string;
  title: string;
  mediaType: WallpaperMediaType;
  deitySlug: string | null;
  languages: string[];
  thumbnailUrl: string;
  previewImageUrl: string;
  previewVideoUrl?: string;
  liveWallpaperAssetUrl?: string;
  liveWallpaperPackage?: string;
  fallbackStaticThumbnailUrl?: string;
  altText?: string;
  dominantColor?: string;
  supportedAndroidVersions: string[];
  focalPoint?: FocalPoint;
  safeAreaMetadata?: SafeAreaMetadata;
  isActive: boolean;
}

/** Patch params — the partial update input + the concurrency precondition. */
export type AdminWallpaperUpdateParams = AdminWallpaperUpdateInput & {
  expectedUpdatedAt: string;
};

/** Row list params — the parsed row admin query. */
export interface AdminWallpaperRowListParams {
  page: number;
  pageSize: number;
  sort?: WallpaperRowSortField;
  order: "asc" | "desc";
  q?: string;
  rowType?: WallpaperRowType;
  isActive?: boolean;
}

/** Row create params — a fully-parsed row create body. */
export interface AdminWallpaperRowCreateParams {
  rowKey: string;
  title: string;
  rowType: WallpaperRowType;
  iconKey?: string;
  mediaTypeFilter?: WallpaperMediaType;
  deityTagFilter?: string;
  maxItems: number;
  displayOrder: number;
  isActive: boolean;
  // TAM-111: per-locale `title` overrides seeded with the row (default `[]`).
  translations: AdminWallpaperRowTranslationView[];
}

/**
 * Row patch params — the partial row update input + the precondition. TAM-111:
 * `translations` is separate from the scalar column update — `undefined` leaves
 * the set untouched; a provided array (incl. `[]`) REPLACES the whole set.
 */
export type AdminWallpaperRowUpdateParams = AdminWallpaperRowUpdateInput & {
  expectedUpdatedAt: string;
  translations?: AdminWallpaperRowTranslationView[];
};

/**
 * Admin write-side service for the Wallpaper module (TAM-96) — **Prisma-free**
 * (all DB access delegated to `WallpaperRepository`). Mirrors the deity exemplar
 * (TAM-88): a single media call site, `writeWithPrecondition` centralizing the
 * 404-vs-409 disambiguation, `DELETE` = deactivate (`isActive = false`).
 *
 * WALLPAPER SPECIFICS (#EXPORT_CRITICAL):
 *   - NO entitlement gate — this service NEVER calls the subscription facade
 *     (discovery is free; the Pro Set action is client-side, TAM-70).
 *   - FIVE media fields, each `validateOwnedUrl`-checked with its own triple
 *     BEFORE the write; a failure → 400, no row written. `liveWallpaperPackage`
 *     (a package name) and `iconKey` (a bundled-asset key) are NEVER validated
 *     as URLs.
 *   - `deitySlug`s are validated through the deity facade (no DB FK exists);
 *     a deactivated deity is permitted; an unknown slug → 400, whole set
 *     rejected.
 *   - Item curation is `custom`-rows-only — a `PUT …/items` against any other
 *     row type is a 400 (silently ignoring it is the worst CMS outcome).
 */
export class WallpaperAdminService {
  constructor(private readonly repo: WallpaperRepository) {}

  // ---- wallpapers ---------------------------------------------------------

  async list(params: AdminWallpaperListParams): Promise<AdminWallpaperPage> {
    const { items, total } = await this.repo.findAdminWallpaperPage(params);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async getById(id: string): Promise<AdminWallpaperDetailView> {
    const row = await this.repo.findAdminWallpaperById(id);
    if (!row) throw new AppError("Wallpaper not found", 404, "NOT_FOUND");
    return row;
  }

  async create(
    params: AdminWallpaperCreateParams
  ): Promise<AdminWallpaperDetailView> {
    // TAM-108: validate the single deity slug (if any) through the facade before
    // any row is written — no DB FK exists, so an unknown slug would orphan.
    if (params.deitySlug !== null) await this.validateDeitySlug(params.deitySlug);
    await this.validateMediaFields([
      ["thumbnailUrl", params.thumbnailUrl],
      ["previewImageUrl", params.previewImageUrl],
      ["fallbackStaticThumbnailUrl", params.fallbackStaticThumbnailUrl],
      ["previewVideoUrl", params.previewVideoUrl],
      ["liveWallpaperAssetUrl", params.liveWallpaperAssetUrl],
    ]);
    const row = await this.repo.createWallpaper(params);
    log.info(
      { event: "wallpaper_admin_created", id: row.id, slug: row.slug },
      "wallpaper created"
    );
    await this.syncHomeFeed(row);
    return row;
  }

  /**
   * Auto-feed: mirror this wallpaper into the Home feed (best-effort).
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
  private async syncHomeFeed(row: AdminWallpaperDetailView): Promise<void> {
    try {
      await performServiceCall(
        "home",
        (home) =>
          home.upsertContentFeedCard({
            contentType: "wallpaper",
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
            heroImageUrl: row.thumbnailUrl,
            audioPreviewUrl: null,
          }),
        "wallpaper:home-feed",
        "home feed sync failed"
      );
    } catch (err) {
      log.warn({ err, id: row.id }, "home feed auto-card failed (non-fatal)");
    }
  }

  async update(
    id: string,
    params: AdminWallpaperUpdateParams
  ): Promise<AdminWallpaperDetailView> {
    const { expectedUpdatedAt, ...data } = params;
    // TAM-108: validate `deitySlug` only when it is being SET to a slug (a
    // `null` clears it, `undefined` leaves it — neither needs a facade check).
    if (typeof data.deitySlug === "string") {
      await this.validateDeitySlug(data.deitySlug);
    }
    // Validate ONLY newly-set media URLs (a `null` clears the field, a
    // `undefined` leaves it — neither needs an ownership check).
    await this.validateMediaFields([
      ["thumbnailUrl", data.thumbnailUrl],
      ["previewImageUrl", data.previewImageUrl],
      ["fallbackStaticThumbnailUrl", data.fallbackStaticThumbnailUrl],
      ["previewVideoUrl", data.previewVideoUrl],
      ["liveWallpaperAssetUrl", data.liveWallpaperAssetUrl],
    ]);
    const row = await this.writeWallpaperWithPrecondition(id, expectedUpdatedAt, data);
    log.info({ event: "wallpaper_admin_updated", id }, "wallpaper updated");
    await this.syncHomeFeed(row);
    return row;
  }

  async deactivate(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminWallpaperDetailView> {
    const row = await this.writeWallpaperWithPrecondition(id, expectedUpdatedAt, {
      isActive: false,
    });
    log.info({ event: "wallpaper_admin_deactivated", id }, "wallpaper deactivated");
    await this.syncHomeFeed(row);
    return row;
  }

  // ---- homepage rows ------------------------------------------------------

  async listRows(
    params: AdminWallpaperRowListParams
  ): Promise<AdminWallpaperRowPage> {
    const { items, total } = await this.repo.findAdminRowPage(params);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async getRowById(id: string): Promise<AdminWallpaperRowDetailView> {
    const row = await this.repo.findAdminRowById(id);
    if (!row) throw new AppError("Homepage row not found", 404, "NOT_FOUND");
    return row;
  }

  async createRow(
    params: AdminWallpaperRowCreateParams
  ): Promise<AdminWallpaperRowDetailView> {
    if (params.deityTagFilter !== undefined) {
      await this.validateDeitySlug(params.deityTagFilter);
    }
    const row = await this.repo.createRow(params);
    log.info(
      { event: "wallpaper_admin_row_created", id: row.id, rowKey: row.rowKey },
      "wallpaper row created"
    );
    return row;
  }

  async updateRow(
    id: string,
    params: AdminWallpaperRowUpdateParams
  ): Promise<AdminWallpaperRowDetailView> {
    const { expectedUpdatedAt, translations, ...data } = params;
    if (typeof data.deityTagFilter === "string") {
      await this.validateDeitySlug(data.deityTagFilter);
    }
    // TAM-111: the scalar precondition write and the translation replace-set
    // run in ONE repo transaction; `translations === undefined` leaves the set.
    const count = await this.repo.updateRowWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data,
      translations,
    });
    if (count === 0) await this.disambiguateRow(id);
    log.info({ event: "wallpaper_admin_row_updated", id }, "wallpaper row updated");
    return this.getRowById(id);
  }

  async deactivateRow(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminWallpaperRowDetailView> {
    const count = await this.repo.updateRowWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data: { isActive: false },
    });
    if (count === 0) await this.disambiguateRow(id);
    log.info({ event: "wallpaper_admin_row_deactivated", id }, "wallpaper row deactivated");
    return this.getRowById(id);
  }

  /**
   * REPLACE a custom row's curated items in array order (`position` = index).
   * ONLY `custom` rows use `WallpaperRowItem` — a `PUT` against any other row
   * type is a 400 (its items resolve server-side; silently accepting the write
   * would leave the editor believing they curated a row that ignores them).
   * Unknown `wallpaperId` → 400, whole set rejected.
   */
  async setRowItems(
    rowId: string,
    wallpaperIds: string[]
  ): Promise<AdminWallpaperRowItemView[]> {
    const rowType = await this.repo.findRowTypeById(rowId);
    if (rowType === null) {
      throw new AppError("Homepage row not found", 404, "NOT_FOUND");
    }
    if (rowType !== "custom") {
      throw new ValidationError(
        `Item curation is only available for 'custom' rows; this row is '${rowType}'`
      );
    }
    if (wallpaperIds.length > 0) {
      const existing = new Set(await this.repo.findExistingWallpaperIds(wallpaperIds));
      const unknown = wallpaperIds.filter((wid) => !existing.has(wid));
      if (unknown.length > 0) {
        throw new ValidationError(
          `Unknown wallpaper id(s): ${unknown.join(", ")}`
        );
      }
    }
    const items = await this.repo.replaceRowItems(rowId, wallpaperIds);
    log.info(
      { event: "wallpaper_admin_row_items_set", rowId, count: items.length },
      "wallpaper row items set"
    );
    return items;
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private async writeWallpaperWithPrecondition(
    id: string,
    expectedUpdatedAt: string,
    data: AdminWallpaperUpdateInput
  ): Promise<AdminWallpaperDetailView> {
    const count = await this.repo.updateWallpaperWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data,
    });
    if (count === 0) {
      const exists = await this.repo.wallpaperExistsById(id);
      if (!exists) throw new AppError("Wallpaper not found", 404, "NOT_FOUND");
      throw new AppError(
        "Wallpaper was modified by someone else; reload and retry",
        409,
        "STALE_WRITE"
      );
    }
    return this.getById(id);
  }

  /** 404-vs-409 disambiguation for a 0-count homepage-row precondition write. */
  private async disambiguateRow(id: string): Promise<never> {
    const exists = await this.repo.rowExistsById(id);
    if (!exists) throw new AppError("Homepage row not found", 404, "NOT_FOUND");
    throw new AppError(
      "Homepage row was modified by someone else; reload and retry",
      409,
      "STALE_WRITE"
    );
  }

  /**
   * Validate a batch of `(field, url)` pairs through the media facade (ADR §A4).
   * Skips `undefined`/`null` (absent or being-cleared). A failure throws
   * `ValidationError` (→ 400) before any row is written. #EXPORT_CRITICAL.
   */
  private async validateMediaFields(
    fields: readonly [WallpaperMediaField, string | null | undefined][]
  ): Promise<void> {
    for (const [field, url] of fields) {
      if (typeof url === "string") await this.validateMediaUrl(url, field);
    }
  }

  private async validateMediaUrl(
    url: string,
    field: WallpaperMediaField
  ): Promise<void> {
    await performServiceCall(
      "media",
      (m) =>
        m.validateOwnedUrl({
          url,
          module: MEDIA_MODULE,
          entity: MEDIA_ENTITY,
          field,
        }),
      "wallpaper:admin:validateOwnedUrl",
      "media URL validation is unavailable"
    );
  }

  /**
   * Validate a single deity slug through the deity facade (no DB FK). An unknown
   * slug → 400; a DEACTIVATED deity is permitted (existence, not active-state, is
   * the rule). Used for the wallpaper's own `deitySlug` (TAM-108) and a row's
   * `deityTagFilter`.
   */
  private async validateDeitySlug(slug: string): Promise<void> {
    const deity = await performServiceCall(
      "deity",
      (d) => d.getBySlug(slug),
      "wallpaper:admin:validateDeitySlug",
      "deity tag validation is unavailable"
    );
    if (!deity) throw new ValidationError(`Unknown deity slug "${slug}"`);
  }
}
