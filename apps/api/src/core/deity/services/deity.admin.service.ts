import { createModuleLogger } from "@api/shared/logs";
import { AppError } from "@api/shared/errors";
import { performServiceCall } from "@api/shared/workspace";
import type { DeityRepository } from "@api/core/deity/repositories";
import type {
  AdminDeityDetailView,
  AdminDeityPage,
  AdminDeityUpdateInput,
  DeitySortField,
} from "@api/core/deity/types";

const log = createModuleLogger("deity:admin:service");

/** List params — the parsed admin query (offset + allowlisted sort + filters). */
export interface AdminDeityListParams {
  page: number;
  pageSize: number;
  sort?: DeitySortField;
  order: "asc" | "desc";
  q?: string;
  active?: boolean;
}

/** Create params — a fully-parsed create body (Zod defaults already applied). */
export interface AdminDeityCreateParams {
  slug: string;
  iconUrl: string;
  sortOrder: number;
  active: boolean;
  translations: { locale: string; displayName: string }[];
}

/** Patch params — partial fields + the concurrency precondition (ISO string). */
export interface AdminDeityUpdateParams {
  expectedUpdatedAt: string;
  iconUrl?: string;
  sortOrder?: number;
  active?: boolean;
  /** Omitted ⇒ translations untouched; provided (incl. `[]`) ⇒ replace the set. */
  translations?: { locale: string; displayName: string }[];
}

/**
 * Admin write-side service for the deity taxonomy (TAM-88) — **Prisma-free**
 * (all DB access is delegated to `DeityRepository`).
 *
 * **EXEMPLAR — the shape the eight sibling module API tickets copy:**
 *   - a single `validateIconUrl` media call site (below);
 *   - `writeWithPrecondition` centralizing the 404-vs-409 disambiguation so
 *     every mutating write behaves identically;
 *   - `DELETE` = deactivate (`active = false`), NEVER a hard delete;
 *   - admin reads are NOT Pro-gated and this service **never calls the
 *     subscription facade** — the public service's fail-closed gate stays
 *     untouched (Deity has no Pro fields, but the rule binds the siblings).
 */
export class DeityAdminService {
  constructor(private readonly repo: DeityRepository) {}

  /** Offset page of deities + total (ADR §C2). Not Pro-gated, not localized. */
  async list(params: AdminDeityListParams): Promise<AdminDeityPage> {
    const { items, total } = await this.repo.findAdminPage(params);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  /** Full row + all translations, or 404. */
  async getById(id: string): Promise<AdminDeityDetailView> {
    const row = await this.repo.findAdminById(id);
    if (!row) throw new AppError("Deity not found", 404, "NOT_FOUND");
    return row;
  }

  /** Create a deity (+ optional translations). Duplicate slug → 409 (in repo). */
  async create(params: AdminDeityCreateParams): Promise<AdminDeityDetailView> {
    await this.validateIconUrl(params.iconUrl);
    const row = await this.repo.createAdmin({
      slug: params.slug,
      iconUrl: params.iconUrl,
      sortOrder: params.sortOrder,
      active: params.active,
      translations: params.translations,
    });
    log.info({ event: "deity_admin_created", id: row.id, slug: row.slug }, "deity created");
    return row;
  }

  /**
   * Partial update under the `updatedAt` precondition. `slug` is NOT accepted
   * (immutable business key — rejected at the Zod boundary). Reactivation is
   * `{ active: true }` through this same path.
   */
  async update(
    id: string,
    params: AdminDeityUpdateParams
  ): Promise<AdminDeityDetailView> {
    if (params.iconUrl !== undefined) await this.validateIconUrl(params.iconUrl);
    const data: AdminDeityUpdateInput = {};
    if (params.iconUrl !== undefined) data.iconUrl = params.iconUrl;
    if (params.sortOrder !== undefined) data.sortOrder = params.sortOrder;
    if (params.active !== undefined) data.active = params.active;
    const row = await this.writeWithPrecondition(
      id,
      params.expectedUpdatedAt,
      data,
      params.translations
    );
    log.info({ event: "deity_admin_updated", id }, "deity updated");
    return row;
  }

  /**
   * "Delete" = **deactivate** (`active = false`). Deity is the cross-module
   * taxonomy root, referenced by slug with NO FK from five modules' tag tables,
   * so a hard delete would leave dangling tags the DB cannot catch (#EXPORT_
   * CRITICAL). This is fully reversible via `PATCH { active: true }`.
   */
  async deactivate(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminDeityDetailView> {
    const row = await this.writeWithPrecondition(id, expectedUpdatedAt, {
      active: false,
    });
    log.info({ event: "deity_admin_deactivated", id }, "deity deactivated");
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
    data: AdminDeityUpdateInput,
    translations?: { locale: string; displayName: string }[]
  ): Promise<AdminDeityDetailView> {
    const count = await this.repo.updateWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      data,
      translations,
    });
    if (count === 0) {
      const exists = await this.repo.existsById(id);
      if (!exists) throw new AppError("Deity not found", 404, "NOT_FOUND");
      throw new AppError(
        "Deity was modified by someone else; reload and retry",
        409,
        "STALE_WRITE"
      );
    }
    return this.getById(id);
  }

  /**
   * Media-URL ownership validation (ADR §A4) — the ONE call site the eight
   * sibling tickets copy for every media field. #EXPORT_CRITICAL.
   *
   * ADR §A4: before persisting a media column we confirm the URL was minted by
   * our own presign flow (prefix + `<module>/<entity>/<uuid>.<ext>` key shape)
   * and HEAD the object, via `IMediaApi.validateOwnedUrl` (`core/media`, TAM-84).
   * WIRED (TAM-108, gap found by the TAM-106 E2E): the deity write path was the
   * one module left on the pre-media no-op, so a deity POST with an external
   * `iconUrl` (e.g. `https://evil.example/x.png`) was accepted (201). It now
   * reaches `validateOwnedUrl` and 400s unless the URL was minted for
   * `deity.deity.iconUrl`. Admin-write-path only; seeded/read URLs are unaffected.
   */
  private async validateIconUrl(url: string): Promise<void> {
    await performServiceCall(
      "media",
      (m) =>
        m.validateOwnedUrl({
          url,
          module: "deity",
          entity: "deity",
          field: "iconUrl",
        }),
      "deity:admin:media",
      "media URL validation failed"
    );
  }
}
