import { createModuleLogger } from "@api/shared/logs";
import { performServiceCall } from "@api/shared/workspace";
import { buildPage, decodeCursor } from "@api/shared/pagination";
import type { DeityRepository, DeityRow } from "@api/core/deity/repositories";
import {
  DEFAULT_DEITY_LOCALE,
  type DeityPage,
  type DeitySummary,
  type LocalizedDeity,
} from "@api/core/deity/types";

const log = createModuleLogger("deity:service");

/**
 * Business-logic layer for the deity module (TAM-57) — Prisma-free.
 *
 * Responsibilities:
 *   1. Localize each deity's `displayName` for a requested locale, falling back
 *      to `en`, then to the slug (documented rule — a deity always renders).
 *   2. Paginate the active taxonomy with the shared cursor helper (`GET
 *      /deities`); a bad cursor throws `ValidationError` → 400 (from
 *      `decodeCursor`), never a 500.
 *   3. Expose the full active list + a by-slug lookup for the facade so module
 *      services validate a deity tag without a cross-module HTTP hop.
 *
 * Active-filter + `(sortOrder, id)` ordering are the repository's DB query;
 * this layer never re-sorts.
 */
export class DeityService {
  constructor(private readonly repo: DeityRepository) {}

  /** Full active taxonomy, localized. Backs the facade's `getActiveDeities`. */
  async getActiveDeities(params: { locale: string }): Promise<LocalizedDeity[]> {
    const rows = await this.repo.findAllActive(params.locale);
    return rows.map((row) => this.toLocalized(row, params.locale));
  }

  /**
   * One cursor page of active deities, localized. `cursor` is opaque; an absent
   * cursor starts from the first row. `limit` is already clamped (Zod boundary).
   */
  async listDeities(params: {
    locale: string;
    cursor?: string;
    limit: number;
    /**
     * TAM-175 — when supplied, the caller's two preferred gods lead the FIRST
     * page. Omitted ⇒ the pre-TAM-175 CMS order, unchanged.
     */
    userId?: string;
  }): Promise<DeityPage> {
    const afterKey = params.cursor ? decodeCursor(params.cursor) : undefined;
    const rows = await this.repo.findActivePage({
      locale: params.locale,
      limit: params.limit,
      afterKey,
    });
    const page = buildPage(rows, params.limit, (row) => ({
      sortOrder: row.sortOrder,
      id: row.id,
    }));

    // TAM-175 — the chip row leads with the user's gods (spec §4):
    //   position 0  "All Gods"  — client-rendered, never a row here
    //   position 1  primary
    //   position 2  secondary
    //   position 3+ CMS order, with those two removed
    //
    // The KEYSET IS UNTOUCHED: the hoisted rows are prepended to page 1 only,
    // and removed from every page, so `nextCursor` still points into the plain
    // `(sortOrder, id)` sequence. Reordering the query instead would make the
    // cursor meaningless the moment a preference changed mid-scroll.
    const preferred = params.userId === undefined
      ? []
      : await this.resolvePreferredSlugs(params.userId);
    const preferredSet = new Set(preferred);
    const remaining = page.items.filter((row) => !preferredSet.has(row.slug));
    const lead = afterKey === undefined && preferred.length > 0
      ? await this.repo.findActiveBySlugs(preferred, params.locale)
      : [];
    // Back into preference order — the repository returns CMS order, but
    // primary must precede secondary.
    const leadOrdered = preferred
      .map((slug) => lead.find((row) => row.slug === slug))
      .filter((row): row is (typeof lead)[number] => row !== undefined);

    log.info(
      {
        event: "deity_list_page",
        locale: params.locale,
        returned: leadOrdered.length + remaining.length,
        has_next: page.nextCursor !== null,
        hoisted: leadOrdered.length,
      },
      "deity page served"
    );
    return {
      items: [...leadOrdered, ...remaining].map((row) =>
        this.toLocalized(row, params.locale)
      ),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * The user's gods as an ordered, de-duplicated slug list (primary first).
   *
   * Never throws: an unreachable users module means no hoist, which is the
   * plain CMS order — a worse chip row, never a broken one.
   */
  private async resolvePreferredSlugs(userId: string): Promise<string[]> {
    try {
      const pref = await performServiceCall(
        "users",
        (api) => api.getDeityPreference(userId),
        "deity:preference",
        "failed to load deity preference"
      );
      if (pref === null) return [];
      // Deduped: the warehouse can name the same god twice, and a chip that
      // appeared in both positions would be rendered twice and removed from the
      // tail once.
      return [...new Set([pref.primaryDeitySlug, pref.secondaryDeitySlug])].filter(
        (slug): slug is string => slug !== null
      );
    } catch (err) {
      log.warn(
        { err, event: "deity_preference_failed", user_id: userId },
        "deity preference unavailable — serving the plain CMS order"
      );
      return [];
    }
  }

  /** Locale-independent by-slug lookup for the facade (deity-tag validation). */
  async getBySlug(slug: string): Promise<DeitySummary | null> {
    return this.repo.findBySlug(slug);
  }

  /**
   * Documented fallback rule: requested locale → `en` → slug. A deity always
   * has a renderable name even if a translation is missing.
   */
  private toLocalized(row: DeityRow, locale: string): LocalizedDeity {
    const requested = row.translations.find((t) => t.locale === locale);
    const fallback = row.translations.find(
      (t) => t.locale === DEFAULT_DEITY_LOCALE
    );
    const displayName =
      requested?.displayName ?? fallback?.displayName ?? row.slug;
    return {
      slug: row.slug,
      displayName,
      iconUrl: row.iconUrl,
      sortOrder: row.sortOrder,
    };
  }
}
