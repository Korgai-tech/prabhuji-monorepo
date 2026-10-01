import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { AppError, ValidationError } from "@api/shared/errors";
import type { StatusRepository } from "@api/core/status/repositories";
import type {
  AdminStatusItemDetailView,
  AdminStatusItemPage,
  AdminStatusItemUpdateInput,
  OverlaySafeArea,
  StatusItemSortField,
  StatusMediaType,
} from "@api/core/status/types";

const log = createModuleLogger("status:admin:service");

// ---------------------------------------------------------------------------
// parsed-input param shapes (Zod defaults already applied at the boundary)
// ---------------------------------------------------------------------------

export interface AdminStatusItemListParams {
  page: number;
  pageSize: number;
  sort?: StatusItemSortField;
  order: "asc" | "desc";
  q?: string;
  isActive?: boolean;
  mediaType?: StatusMediaType;
  deitySlug?: string;
  language?: string;
}

export interface AdminStatusItemCreateParams {
  slug: string;
  title: string;
  mediaType: StatusMediaType;
  deitySlug: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbnailUrl: string;
  overlaySafeArea: OverlaySafeArea;
  languages: string[];
  shareCaption?: string | null;
  isActive: boolean;
}

export interface AdminStatusItemUpdateParams {
  expectedUpdatedAt: string;
  title?: string;
  deitySlug?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string;
  overlaySafeArea?: OverlaySafeArea;
  languages?: string[];
  shareCaption?: string | null;
  isActive?: boolean;
}




/**
 * Admin write-side service for the Status Sharing module (TAM-98) —
 * **Prisma-free** (all DB access is delegated to `StatusRepository`). Mirrors
 * the TAM-88 deity / TAM-90 aarti / TAM-96 wallpaper exemplars.
 *
 * Status has NO Pro-gating (everything is free; the only Pro action is the
 * client-side Share render, TAM-72). So — like wallpaper and UNLIKE aarti — this
 * service NEVER calls the subscription facade and adds no gate: there is simply
 * no gated field to un-gate, and the public `StatusService` has no entitlement
 * path to modify.
 *
 * Two write-path validations run BEFORE any DB write (both via
 * `performServiceCall`, never by importing another module's internals):
 *   - every media column (`imageUrl`, `videoUrl`, `thumbnailUrl`) is
 *     ownership-checked by `media.validateOwnedUrl` (ADR §A4) → 400 on failure;
 *   - every `deitySlug` tag is checked through `deity.getBySlug` (there is NO
 *     DB FK; TAM-57) → 400 on an unknown slug.
 *
 * #EXPORT_CRITICAL — `UserStatusProfile` (user-authored PII) is never touched.
 */
export class StatusAdminService {
  constructor(private readonly repo: StatusRepository) {}

  // =======================================================================
  // StatusItem
  // =======================================================================

  async listItems(
    params: AdminStatusItemListParams
  ): Promise<AdminStatusItemPage> {
    return this.repo.findAdminItemPage(params);
  }

  async getItemById(id: string): Promise<AdminStatusItemDetailView> {
    const row = await this.repo.findAdminItemById(id);
    if (!row) throw new AppError("Status item not found", 404, "NOT_FOUND");
    return row;
  }

  /**
   * Create a status item. The `mediaType`-discriminated field applicability is
   * enforced at the Zod boundary; here we ownership-validate each media URL that
   * is actually set (three distinct TAM-84 triples) BEFORE the write, so a bad
   * URL is a 400 with NO row written. A duplicate `slug` → 409 (in the repo).
   */
  async createItem(
    params: AdminStatusItemCreateParams
  ): Promise<AdminStatusItemDetailView> {
    await this.validateDeitySlug(params.deitySlug);
    await this.validateMediaUrl(params.thumbnailUrl, "thumbnailUrl");
    const imageUrl = params.imageUrl ?? null;
    if (imageUrl !== null) await this.validateMediaUrl(imageUrl, "imageUrl");
    const videoUrl = params.videoUrl ?? null;
    if (videoUrl !== null) await this.validateMediaUrl(videoUrl, "videoUrl");

    const row = await this.repo.createAdminItem({
      slug: params.slug,
      title: params.title,
      mediaType: params.mediaType,
      deitySlug: params.deitySlug,
      imageUrl,
      videoUrl,
      thumbnailUrl: params.thumbnailUrl,
      overlaySafeArea: params.overlaySafeArea,
      languages: params.languages,
      shareCaption: params.shareCaption ?? null,
      isActive: params.isActive,
    });
    log.info(
      { event: "status_admin_item_created", id: row.id, slug: row.slug },
      "status item created"
    );
    await this.syncHomeFeed(row);
    return row;
  }

  /**
   * Auto-feed: mirror this status item into the Home feed (best-effort).
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
  private async syncHomeFeed(row: AdminStatusItemDetailView): Promise<void> {
    try {
      await performServiceCall(
        "home",
        (home) =>
          home.upsertContentFeedCard({
            contentType: "status",
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
        "status:home-feed",
        "home feed sync failed"
      );
    } catch (err) {
      log.warn({ err, id: row.id }, "home feed auto-card failed (non-fatal)");
    }
  }

  async updateItem(
    id: string,
    params: AdminStatusItemUpdateParams
  ): Promise<AdminStatusItemDetailView> {
    if (params.deitySlug !== undefined) {
      await this.validateDeitySlug(params.deitySlug);
    }
    if (params.thumbnailUrl !== undefined) {
      await this.validateMediaUrl(params.thumbnailUrl, "thumbnailUrl");
    }
    if (params.imageUrl !== undefined && params.imageUrl !== null) {
      await this.validateMediaUrl(params.imageUrl, "imageUrl");
    }
    if (params.videoUrl !== undefined && params.videoUrl !== null) {
      await this.validateMediaUrl(params.videoUrl, "videoUrl");
    }
    const data: AdminStatusItemUpdateInput = {};
    if (params.title !== undefined) data.title = params.title;
    if (params.deitySlug !== undefined) data.deitySlug = params.deitySlug;
    if (params.imageUrl !== undefined) data.imageUrl = params.imageUrl;
    if (params.videoUrl !== undefined) data.videoUrl = params.videoUrl;
    if (params.thumbnailUrl !== undefined) data.thumbnailUrl = params.thumbnailUrl;
    if (params.overlaySafeArea !== undefined) {
      data.overlaySafeArea = params.overlaySafeArea;
    }
    if (params.languages !== undefined) data.languages = params.languages;
    if (params.shareCaption !== undefined) data.shareCaption = params.shareCaption;
    if (params.isActive !== undefined) data.isActive = params.isActive;

    const row = await this.writeWithPrecondition(
      "Status item",
      () =>
        this.repo.updateItemWithPrecondition({
          id,
          expectedUpdatedAt: new Date(params.expectedUpdatedAt),
          data,
        }),
      () => this.repo.itemExistsById(id),
      () => this.getItemById(id)
    );
    log.info({ event: "status_admin_item_updated", id }, "status item updated");
    await this.syncHomeFeed(row);
    return row;
  }

  /** "Delete" = deactivate (`isActive = false`); the row survives (ADR §C4). */
  async deactivateItem(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminStatusItemDetailView> {
    const row = await this.writeWithPrecondition(
      "Status item",
      () =>
        this.repo.updateItemWithPrecondition({
          id,
          expectedUpdatedAt: new Date(expectedUpdatedAt),
          data: { isActive: false },
        }),
      () => this.repo.itemExistsById(id),
      () => this.getItemById(id)
    );
    log.info(
      { event: "status_admin_item_deactivated", id },
      "status item deactivated"
    );
    await this.syncHomeFeed(row);
    return row;
  }


  // =======================================================================
  // internals
  // =======================================================================

  /**
   * The single write that carries the optimistic-concurrency precondition, and
   * the single place 404 vs 409 is decided (ADR §C3) — shared by both entities.
   * A 0-count from the `updateMany` is ambiguous (the row could be GONE → 404,
   * or the caller's `updatedAt` STALE → 409), so a follow-up existence check
   * disambiguates. On success it re-reads the fresh row.
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

  /**
   * Media-URL ownership validation (ADR §A4) — called BEFORE persisting ANY
   * media column. Reaches `IMediaApi.validateOwnedUrl` (TAM-84) ONLY via
   * `performServiceCall`; it throws `ValidationError` (→ 400) unless the URL was
   * minted by our presign flow for this exact `(module, entity, field)` and the
   * object exists with an allowlisted content-type. `entity` is the camelCase
   * model name — the frozen TAM-84 registry triples:
   * `status.statusItem.{imageUrl,thumbnailUrl,videoUrl}` (images 10 MB;
   * `videoUrl` is `video/mp4` @ 200 MB).
   */
  private async validateMediaUrl(
    url: string,
    field: "imageUrl" | "thumbnailUrl" | "videoUrl"
  ): Promise<void> {
    await performServiceCall(
      "media",
      (m) =>
        m.validateOwnedUrl({
          url,
          module: "status",
          entity: "statusItem",
          field,
        }),
      "status:admin:media",
      "media URL validation failed"
    );
  }

  /**
   * Validate the item's SINGLE deity slug through the deity facade
   * (`IDeityApi.getBySlug`; TAM-108 single-deity model). There is NO DB FK on
   * `StatusItem.deitySlug` (TAM-57), so the database cannot catch a typo — an
   * invalid slug would silently disappear from every filter. Called on create and
   * on any update that sets `deitySlug`. An unknown slug → 400 (no row written); a
   * DEACTIVATED deity is accepted (the reference stays meaningful).
   */
  private async validateDeitySlug(slug: string): Promise<void> {
    const deity = await performServiceCall(
      "deity",
      (d) => d.getBySlug(slug),
      "status:admin:deity",
      "failed to validate deity tag"
    );
    if (!deity) {
      throw new ValidationError(`Unknown deity slug "${slug}"`, "UNKNOWN_DEITY_SLUG");
    }
  }
}
