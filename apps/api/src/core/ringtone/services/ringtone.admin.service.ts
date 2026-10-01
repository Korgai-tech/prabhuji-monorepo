import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { AppError, ValidationError } from "@api/shared/errors";
import type { RingtoneRepository } from "@api/core/ringtone/repositories";
import type {
  AdminRingtoneCreateInput,
  AdminRingtonePage,
  AdminRingtoneUpdateInput,
  AdminRingtoneView,
  RingtoneSortField,
} from "@api/core/ringtone/types";

const log = createModuleLogger("ringtone:admin:service");

/** The (module, entity) prefix for this module's media allowlist triples. */
const MEDIA_MODULE = "ringtone";
const MEDIA_ENTITY = "ringtone";

/** List params — the parsed admin query (offset + allowlisted sort + filters). */
export interface AdminRingtoneListParams {
  page: number;
  pageSize: number;
  sort?: RingtoneSortField;
  order: "asc" | "desc";
  q?: string;
  isActive?: boolean;
  deitySlug?: string;
  language?: string;
  tag?: string;
}

/** Create params — a fully-parsed create body (Zod defaults already applied). */
export interface AdminRingtoneCreateParams {
  slug: string;
  title: string;
  deitySlug: string;
  thumbnailImageUrl: string;
  audioUrl: string;
  tags: string[];
  searchKeywords: string[];
  /** TAM-108 multi-language availability set (validated codes); `[]` = all. */
  languages: string[];
  artistOrSource: string | null;
  deepLinkUrl: string | null;
  altText: string | null;
  shareTitle: string | null;
  shareDescription: string | null;
  isActive: boolean;
}

/** Patch params — partial fields + the concurrency precondition (ISO string). */
export interface AdminRingtoneUpdateParams {
  expectedUpdatedAt: string;
  title?: string;
  deitySlug?: string;
  thumbnailImageUrl?: string;
  audioUrl?: string;
  tags?: string[];
  searchKeywords?: string[];
  /** TAM-108 multi-language: whole-array set semantics; `[]` = all languages. */
  languages?: string[];
  artistOrSource?: string | null;
  deepLinkUrl?: string | null;
  altText?: string | null;
  shareTitle?: string | null;
  shareDescription?: string | null;
  isActive?: boolean;
}

/**
 * Admin write-side service for the ringtone catalogue (TAM-94) — **Prisma-free**
 * (all DB access is delegated to `RingtoneRepository`).
 *
 * Mirrors the TAM-88 deity exemplar: a single media call site pattern, a
 * `writeWithPrecondition` centralizing the 404-vs-409 disambiguation, and
 * `DELETE` = deactivate.
 *
 * #EXPORT_CRITICAL — this service does the strictest media gating in the
 * platform:
 *   - TWO media fields, TWO registry triples, TWO gating classes.
 *     `thumbnailImageUrl` is FREE; `audioUrl` is PRO. Both are validated through
 *     `validateOwnedUrl` with their DISTINCT `(ringtone, ringtone, <field>)`
 *     triples before any write — a failure is a 400 with no row written.
 *   - `deitySlug` is a logical reference with NO DB FK; it is validated through
 *     the deity facade on every create and every update that sets it. An unknown
 *     slug is a 400; a DEACTIVATED deity is permitted.
 *   - This service **NEVER calls the subscription facade** — admin reads are not
 *     Pro-gated, and the public `RingtoneService`'s fail-closed gate (which nulls
 *     `audioUrl` for free callers) stays unconditional and untouched.
 */
export class RingtoneAdminService {
  constructor(private readonly repo: RingtoneRepository) {}

  /** Offset page of ringtones + total (ADR §C2). Not Pro-gated. */
  async list(params: AdminRingtoneListParams): Promise<AdminRingtonePage> {
    const { items, total } = await this.repo.findAdminPage(params);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  /** Full row (incl. the Pro-gated fields in full), or 404. */
  async getById(id: string): Promise<AdminRingtoneView> {
    const row = await this.repo.findAdminById(id);
    if (!row) throw new AppError("Ringtone not found", 404, "NOT_FOUND");
    return row;
  }

  /**
   * Create a ringtone. Validates the deity slug through the facade and both
   * media URLs against their distinct allowlist triples BEFORE the write; a bad
   * slug or URL is a 400 and no row is written. Duplicate slug → 409 (in repo).
   */
  async create(params: AdminRingtoneCreateParams): Promise<AdminRingtoneView> {
    await this.validateDeitySlug(params.deitySlug);
    await this.validateMediaUrl(params.thumbnailImageUrl, "thumbnailImageUrl");
    await this.validateMediaUrl(params.audioUrl, "audioUrl");

    const row = await this.repo.createAdmin({
      ...params,
      tags: normalizeTags(params.tags),
      searchKeywords: normalizeTags(params.searchKeywords),
      // TAM-108: de-dup the language set before the write (empty = all languages).
      languages: normalizeTags(params.languages),
    } satisfies AdminRingtoneCreateInput);
    log.info(
      { event: "ringtone_admin_created", id: row.id, slug: row.slug },
      "ringtone created"
    );
    await this.syncHomeFeed(row);
    return row;
  }

  /**
   * Auto-feed: mirror this ringtone into the Home feed (best-effort).
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
  private async syncHomeFeed(row: AdminRingtoneView): Promise<void> {
    try {
      await performServiceCall(
        "home",
        (home) =>
          home.upsertContentFeedCard({
            contentType: "ringtone",
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
            heroImageUrl: row.thumbnailImageUrl,
            audioPreviewUrl: row.audioUrl,
          }),
        "ringtone:home-feed",
        "home feed sync failed"
      );
    } catch (err) {
      log.warn({ err, id: row.id }, "home feed auto-card failed (non-fatal)");
    }
  }

  /**
   * Partial update under the `updatedAt` precondition. `slug`/`playCount`/
   * `setCount` are NOT accepted (rejected at the Zod boundary). A `deitySlug`
   * change is re-validated through the facade; any media field written is
   * re-validated against its allowlist triple. Reactivation is `{ isActive: true }`
   * through this same path.
   */
  async update(
    id: string,
    params: AdminRingtoneUpdateParams
  ): Promise<AdminRingtoneView> {
    if (params.deitySlug !== undefined) {
      await this.validateDeitySlug(params.deitySlug);
    }
    if (params.thumbnailImageUrl !== undefined) {
      await this.validateMediaUrl(params.thumbnailImageUrl, "thumbnailImageUrl");
    }
    if (params.audioUrl !== undefined) {
      await this.validateMediaUrl(params.audioUrl, "audioUrl");
    }

    const data: AdminRingtoneUpdateInput = {};
    if (params.title !== undefined) data.title = params.title;
    if (params.deitySlug !== undefined) data.deitySlug = params.deitySlug;
    if (params.thumbnailImageUrl !== undefined) {
      data.thumbnailImageUrl = params.thumbnailImageUrl;
    }
    if (params.audioUrl !== undefined) data.audioUrl = params.audioUrl;
    if (params.tags !== undefined) data.tags = normalizeTags(params.tags);
    if (params.searchKeywords !== undefined) {
      data.searchKeywords = normalizeTags(params.searchKeywords);
    }
    // TAM-108: whole-array set update, de-duplicated (empty = all languages).
    if (params.languages !== undefined) {
      data.languages = normalizeTags(params.languages);
    }
    if (params.artistOrSource !== undefined) {
      data.artistOrSource = params.artistOrSource;
    }
    if (params.deepLinkUrl !== undefined) data.deepLinkUrl = params.deepLinkUrl;
    if (params.altText !== undefined) data.altText = params.altText;
    if (params.shareTitle !== undefined) data.shareTitle = params.shareTitle;
    if (params.shareDescription !== undefined) {
      data.shareDescription = params.shareDescription;
    }
    if (params.isActive !== undefined) data.isActive = params.isActive;

    const row = await this.writeWithPrecondition(
      id,
      params.expectedUpdatedAt,
      data
    );
    log.info({ event: "ringtone_admin_updated", id }, "ringtone updated");
    await this.syncHomeFeed(row);
    return row;
  }

  /**
   * "Delete" = **deactivate** (`isActive = false`), never a hard delete. Fully
   * reversible via `PATCH { isActive: true }`.
   */
  async deactivate(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminRingtoneView> {
    const row = await this.writeWithPrecondition(id, expectedUpdatedAt, {
      isActive: false,
    });
    log.info({ event: "ringtone_admin_deactivated", id }, "ringtone deactivated");
    await this.syncHomeFeed(row);
    return row;
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  /**
   * The single write that carries the optimistic-concurrency precondition, and
   * the single place 404 vs 409 is decided (ADR §C3). A 0-count from the
   * `updateMany` is ambiguous — the row could be **gone** (404) or the caller's
   * `updatedAt` could be **stale** (409) — so a follow-up existence check
   * disambiguates. On success it re-reads the fresh row (new `updatedAt`).
   */
  private async writeWithPrecondition(
    id: string,
    expectedUpdatedAt: string,
    data: AdminRingtoneUpdateInput
  ): Promise<AdminRingtoneView> {
    const count = await this.repo.updateWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data,
    });
    if (count === 0) {
      const exists = await this.repo.existsAnyById(id);
      if (!exists) throw new AppError("Ringtone not found", 404, "NOT_FOUND");
      throw new AppError(
        "Ringtone was modified by someone else; reload and retry",
        409,
        "STALE_WRITE"
      );
    }
    return this.getById(id);
  }

  /**
   * Validate a deity slug through the deity facade (TAM-57; NO DB FK, so the
   * database cannot catch a typo and a bad slug makes the ringtone unreachable
   * from the deity filter). Unknown slug → 400, no row written. Pointing at a
   * DEACTIVATED deity is permitted — the reference stays meaningful.
   */
  private async validateDeitySlug(slug: string): Promise<void> {
    const deity = await performServiceCall(
      "deity",
      (api) => api.getBySlug(slug),
      "ringtone:admin:deity",
      "failed to validate deity tag"
    );
    if (!deity) {
      throw new ValidationError(`Unknown deity slug "${slug}"`);
    }
  }

  /**
   * Media-URL ownership validation (ADR §A4) — called BEFORE every media write,
   * once per field, with that field's DISTINCT allowlist triple
   * (`ringtone.ringtone.<field>`). The two fields are two distinct registry
   * entries with distinct allowlists (thumbnail: images; audio: `audio/mpeg`),
   * so an editor cannot drop an MP3 into a thumbnail slot. A URL that fails
   * validation throws `ValidationError` (→ 400) and no row is written
   * (#EXPORT_CRITICAL). Write-path only — seeded URLs are not validated on read.
   */
  private async validateMediaUrl(url: string, field: string): Promise<void> {
    await performServiceCall(
      "media",
      (m) =>
        m.validateOwnedUrl({
          url,
          module: MEDIA_MODULE,
          entity: MEDIA_ENTITY,
          field,
        }),
      "ringtone:admin:media",
      "media URL validation failed"
    );
  }
}

/**
 * Trim + de-duplicate array elements, preserving first-seen order (AC (g)). The
 * Zod boundary already trims each element and bounds the array; this is the
 * server-side de-dup that keeps search quality high (a duplicate tag is noise).
 */
function normalizeTags(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
