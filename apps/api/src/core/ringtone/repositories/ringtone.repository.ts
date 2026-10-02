import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import { AppError } from "@api/shared/errors";
import type { CursorKey } from "@api/shared/pagination";
import type {
  AdminRingtoneCreateInput,
  AdminRingtonePage,
  AdminRingtoneUpdateInput,
  AdminRingtoneView,
  RingtoneSortField,
} from "@api/core/ringtone/types";

/**
 * Ringtone module repository — the ONLY place `@prisma/client` is reached for
 * this module (arch-boundaries.json enforces it; the service stays Prisma-free).
 *
 * Owns the grid query (keyset-paginated, optional deity filter), the search
 * query (partial ILIKE across title / deity slug / tags / searchKeywords —
 * GIN-backed, expressed in ONE parameterized raw statement so array elements can
 * be matched partially), item detail, the play-count rule's transactional
 * increment + per-session dedupe, and the set-count increment. It does NOT touch
 * engagement / deity / subscription tables — those are other modules, reached by
 * the SERVICE via `performServiceCall`.
 *
 * KEYSET PAGINATION: every listing orders by the stable `id` (there is no public
 * sort param — id-order is an effectively-random but STABLE shuffle) and
 * over-fetches `limit + 1` rows so the service can tell whether a next page
 * exists (`buildPage`). Grid + search ascend on `id`.
 */

/** Raw ringtone row — everything the service needs to gate + build cards/detail. */
export interface RingtoneRow {
  id: string;
  slug: string;
  title: string;
  deitySlug: string;
  thumbnailImageUrl: string;
  audioUrl: string;
  playCount: number;
  setCount: number;
  tags: string[];
  searchKeywords: string[];
  languages: string[];
  artistOrSource: string | null;
  deepLinkUrl: string | null;
  altText: string | null;
  shareTitle: string | null;
  shareDescription: string | null;
  isActive: boolean;
  createdAt: Date;
}

const RINGTONE_SELECT = {
  id: true,
  slug: true,
  title: true,
  deitySlug: true,
  thumbnailImageUrl: true,
  audioUrl: true,
  playCount: true,
  setCount: true,
  tags: true,
  searchKeywords: true,
  languages: true,
  artistOrSource: true,
  deepLinkUrl: true,
  altText: true,
  shareTitle: true,
  shareDescription: true,
  isActive: true,
  createdAt: true,
} as const;

/** Snake-case shape returned by the raw search query. */
interface RawSearchRow {
  id: string;
  slug: string;
  title: string;
  deity_slug: string;
  thumbnail_image_url: string;
  audio_url: string;
  play_count: number;
  set_count: number;
  tags: string[];
  search_keywords: string[];
  languages: string[];
  artist_or_source: string | null;
  deep_link_url: string | null;
  alt_text: string | null;
  share_title: string | null;
  share_description: string | null;
  is_active: boolean;
  created_at: Date;
}

function fromRawSearchRow(raw: RawSearchRow): RingtoneRow {
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    deitySlug: raw.deity_slug,
    thumbnailImageUrl: raw.thumbnail_image_url,
    audioUrl: raw.audio_url,
    playCount: raw.play_count,
    setCount: raw.set_count,
    tags: raw.tags,
    searchKeywords: raw.search_keywords,
    languages: raw.languages,
    artistOrSource: raw.artist_or_source,
    deepLinkUrl: raw.deep_link_url,
    altText: raw.alt_text,
    shareTitle: raw.share_title,
    shareDescription: raw.share_description,
    isActive: raw.is_active,
    createdAt: raw.created_at,
  };
}

/**
 * TAM-108 language-MEMBERSHIP filter: a row matches `locale` when its `languages`
 * set CONTAINS the code, OR the set is EMPTY (available in ALL languages). Shared
 * by the grid (Prisma) path; the search (raw SQL) path uses `languagePredicate`.
 */
function languageMembership(locale: string): Prisma.RingtoneWhereInput {
  return {
    OR: [{ languages: { has: locale } }, { languages: { isEmpty: true } }],
  };
}

export class RingtoneRepository {
  /**
   * The active ringtone catalogue (under the grid's deity/language filters) as
   * ROTATION candidates — the input for the 2-hourly re-order (TAM-150). No
   * `take`: rotation slides a window over the whole ring.
   *
   * `playCount + setCount` IS the action-click signal the spec resurfaces on
   * (both are server-authoritative local columns), so no engagement facade call
   * is needed here. Read once per refresh epoch per filter combination.
   *
   * ponytail: whole-catalogue read, and neither counter is indexed — fine
   * because we sort in memory, once per refresh. Push the hash into SQL
   * (`ORDER BY md5(id || :seed)`) if the catalogue ever gets big.
   */
  async listRotationCandidates(params: {
    deitySlug?: string;
    locale?: string;
  }): Promise<{ id: string; createdAtMs: number; score: number }[]> {
    const { deitySlug, locale } = params;
    const rows = await getPrisma().ringtone.findMany({
      where: {
        isActive: true,
        ...(deitySlug ? { deitySlug } : {}),
        ...(locale ? languageMembership(locale) : {}),
      },
      select: { id: true, createdAt: true, playCount: true, setCount: true },
    });
    return rows.map((r) => ({
      id: r.id,
      createdAtMs: r.createdAt.getTime(),
      score: r.playCount + r.setCount,
    }));
  }

  /**
   * Hydrate one slice of a rotation plan. Unordered by design — the plan owns
   * the order and the service restores it (`orderByPlan`). The `isActive` guard
   * stays so a ringtone deactivated mid-epoch drops out of the page.
   */
  async findByIds(ids: string[]): Promise<RingtoneRow[]> {
    if (ids.length === 0) return [];
    return getPrisma().ringtone.findMany({
      where: { isActive: true, id: { in: ids } },
      select: RINGTONE_SELECT,
    });
  }

  /**
   * One keyset page of active ringtones matching `q` (partial, case-insensitive)
   * across `title`, `deity_slug`, `tags`, and `search_keywords`, PLUS any rows
   * whose deity slug is in `deitySlugMatches` (a deity-NAME match resolved by the
   * service via the deity facade). Ordered by stable `id`; fetches
   * `limit + 1`. Expressed as ONE parameterized raw statement because partial
   * matching of ARRAY ELEMENTS (`unnest(...) ILIKE`) is not expressible via the
   * Prisma query API.
   */
  async searchPage(params: {
    q: string;
    deitySlugMatches: string[];
    locale?: string;
    limit: number;
    afterKey?: CursorKey;
  }): Promise<RingtoneRow[]> {
    const { q, deitySlugMatches, locale, limit, afterKey } = params;
    const like = `%${escapeLike(q)}%`;
    const rows = await getPrisma().$queryRaw<RawSearchRow[]>(Prisma.sql`
      SELECT id, slug, title, deity_slug, thumbnail_image_url,
             audio_url, play_count, set_count, tags,
             search_keywords, languages, artist_or_source,
             deep_link_url, alt_text, share_title, share_description,
             is_active, created_at
      FROM ringtones
      WHERE is_active = true
        AND ${searchPredicate(like, deitySlugMatches)}
        AND ${languagePredicate(locale)}
        AND ${keysetPredicate(afterKey)}
      ORDER BY id ASC
      LIMIT ${limit + 1}
    `);
    return rows.map(fromRawSearchRow);
  }

  /** Total count of active ringtones matching `q` (+ deity-name / locale filter). */
  async searchCount(params: {
    q: string;
    deitySlugMatches: string[];
    locale?: string;
  }): Promise<number> {
    const { q, deitySlugMatches, locale } = params;
    const like = `%${escapeLike(q)}%`;
    const rows = await getPrisma().$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM ringtones
      WHERE is_active = true
        AND ${searchPredicate(like, deitySlugMatches)}
        AND ${languagePredicate(locale)}
    `);
    return Number(rows[0]?.count ?? 0n);
  }

  /**
   * Total count of active ringtones (empty-query search / grid total), optionally
   * narrowed by deity slug and/or a `locale` (TAM-108 language membership).
   */
  async countActive(deitySlug?: string, locale?: string): Promise<number> {
    return getPrisma().ringtone.count({
      where: {
        isActive: true,
        ...(deitySlug ? { deitySlug } : {}),
        ...(locale ? languageMembership(locale) : {}),
      },
    });
  }

  /** One active ringtone by id (or `null`). */
  async findById(id: string): Promise<RingtoneRow | null> {
    return getPrisma().ringtone.findFirst({
      where: { id, isActive: true },
      select: RINGTONE_SELECT,
    });
  }

  /**
   * Existence probe for the write paths — the id of an active row, without
   * selecting the whole row. `null` when unknown/inactive.
   */
  async findGateById(id: string): Promise<{ id: string } | null> {
    return getPrisma().ringtone.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
  }

  /**
   * Idempotently count a play: insert the `(userId, ringtoneId, sessionToken)`
   * dedupe row and, ONLY when that insert is new, increment `playCount` — both in
   * ONE transaction. A replay with the same session token inserts nothing and
   * leaves `playCount` unchanged. Returns whether this call newly counted a play
   * and the resulting count.
   */
  async countPlay(params: {
    userId: string;
    ringtoneId: string;
    sessionToken: string;
  }): Promise<{ counted: boolean; playCount: number }> {
    const { userId, ringtoneId, sessionToken } = params;
    return getPrisma().$transaction(async (tx) => {
      const inserted = await tx.ringtonePlaySession.createMany({
        data: [{ userId, ringtoneId, sessionToken }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) {
        // Replay of an already-counted session token — do not double-count.
        const current = await tx.ringtone.findUniqueOrThrow({
          where: { id: ringtoneId },
          select: { playCount: true },
        });
        return { counted: false, playCount: current.playCount };
      }
      const updated = await tx.ringtone.update({
        where: { id: ringtoneId },
        data: { playCount: { increment: 1 } },
        select: { playCount: true },
      });
      return { counted: true, playCount: updated.playCount };
    });
  }

  /** Increment `setCount` on a successful set; returns the fresh count. */
  async incrementSetCount(id: string): Promise<{ setCount: number }> {
    return getPrisma().ringtone.update({
      where: { id },
      data: { setCount: { increment: 1 } },
      select: { setCount: true },
    });
  }

  // =========================================================================
  // ADMIN write surface (TAM-94). Prisma stays confined here; the admin service
  // is Prisma-free. These methods do NOT filter on `isActive` — an editor
  // manages both active and deactivated rows (`isActive` is a query FILTER) and
  // reactivates via `PATCH { isActive: true }`. The public methods above (which
  // all filter `isActive: true`) are untouched.
  // =========================================================================

  /**
   * One OFFSET page of ringtones + the unpaginated `total` (a second `COUNT` in
   * the same call — accepted, ADR §C2). `q` matches `title` OR `slug`
   * case-insensitively; `tag` matches an element of `tags` OR `searchKeywords`
   * by EXACT element (Prisma `has`, riding the GIN indexes — the admin filter is
   * exact-match, unlike the public search endpoint's partial ILIKE). `sort` is
   * the already-validated enum; absent → the natural `id` order.
   */
  async findAdminPage(params: {
    page: number;
    pageSize: number;
    sort?: RingtoneSortField;
    order: "asc" | "desc";
    q?: string;
    isActive?: boolean;
    deitySlug?: string;
    language?: string;
    tag?: string;
  }): Promise<Pick<AdminRingtonePage, "items" | "total">> {
    const and: Prisma.RingtoneWhereInput[] = [];
    if (params.q) {
      and.push({
        OR: [
          { title: { contains: params.q, mode: "insensitive" } },
          { slug: { contains: params.q, mode: "insensitive" } },
        ],
      });
    }
    if (params.tag) {
      and.push({
        OR: [{ tags: { has: params.tag } }, { searchKeywords: { has: params.tag } }],
      });
    }
    // TAM-108: filter by language MEMBERSHIP — rows tagged with the code OR
    // available in all languages (empty set).
    if (params.language) {
      and.push(languageMembership(params.language));
    }

    const where: Prisma.RingtoneWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.deitySlug ? { deitySlug: params.deitySlug } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };

    const [rows, total] = await Promise.all([
      getPrisma().ringtone.findMany({
        where,
        orderBy: buildAdminOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_RINGTONE_SELECT,
      }),
      getPrisma().ringtone.count({ where }),
    ]);

    return { items: rows.map(toAdminView), total };
  }

  /** Full row by id (active or not), or `null` if it does not exist. */
  async findAdminById(id: string): Promise<AdminRingtoneView | null> {
    const row = await getPrisma().ringtone.findUnique({
      where: { id },
      select: ADMIN_RINGTONE_SELECT,
    });
    return row ? toAdminView(row) : null;
  }

  /**
   * Existence probe that ignores `isActive` — backs the 404-vs-409
   * disambiguation (a deactivated row still exists). Distinct from the public
   * `findGateById`, which filters `isActive: true`.
   */
  async existsAnyById(id: string): Promise<boolean> {
    const row = await getPrisma().ringtone.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Create a ringtone. A duplicate `slug` surfaces as a **409 `SLUG_CONFLICT`**,
   * never a 500 — the unique constraint is caught here. `playCount`/`setCount`
   * are omitted (server-authoritative; default to 0 in the schema).
   */
  async createAdmin(input: AdminRingtoneCreateInput): Promise<AdminRingtoneView> {
    try {
      const row = await getPrisma().ringtone.create({
        data: {
          slug: input.slug,
          title: input.title,
          deitySlug: input.deitySlug,
          thumbnailImageUrl: input.thumbnailImageUrl,
          audioUrl: input.audioUrl,
          tags: input.tags,
          searchKeywords: input.searchKeywords,
          languages: input.languages,
          artistOrSource: input.artistOrSource,
          deepLinkUrl: input.deepLinkUrl,
          altText: input.altText,
          shareTitle: input.shareTitle,
          shareDescription: input.shareDescription,
          isActive: input.isActive,
        },
        select: ADMIN_RINGTONE_SELECT,
      });
      return toAdminView(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new AppError(
          `A ringtone with slug "${input.slug}" already exists`,
          409,
          "SLUG_CONFLICT"
        );
      }
      throw err;
    }
  }

  /**
   * Optimistic-concurrency write (ADR §C3): the client's last-known `updatedAt`
   * is in the `WHERE`, so a concurrent write makes this match 0 rows. Returns
   * the affected count; the SERVICE turns a 0 into 404-or-409 after an existence
   * check (a 0 is ambiguous between "stale" and "gone"). Deactivation is just
   * this method with `{ isActive: false }`.
   */
  async updateWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminRingtoneUpdateInput;
  }): Promise<number> {
    const res = await getPrisma().ringtone.updateMany({
      where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      data: params.data,
    });
    return res.count;
  }
}

/**
 * Escape LIKE/ILIKE wildcards in the user's query so `%`/`_`/`\` are matched
 * literally (the query is a search term, not a pattern).
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * The shared search predicate: partial ILIKE across `title` + `deity_slug`, a
 * partial match against any element of `tags` / `search_keywords` (via
 * `unnest`), plus an exact `deity_slug = ANY(deityNameMatches)` for deity-name
 * hits resolved upstream.
 */
function searchPredicate(like: string, deitySlugMatches: string[]): Prisma.Sql {
  const deityNameClause =
    deitySlugMatches.length > 0
      ? Prisma.sql`OR deity_slug = ANY(${deitySlugMatches})`
      : Prisma.empty;
  return Prisma.sql`(
    title ILIKE ${like}
    OR deity_slug ILIKE ${like}
    OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE ${like})
    OR EXISTS (SELECT 1 FROM unnest(search_keywords) k WHERE k ILIKE ${like})
    ${deityNameClause}
  )`;
}

/**
 * TAM-108 language-MEMBERSHIP predicate for the raw search statement: a row
 * matches `locale` when the code is in its `languages` array OR the array is
 * EMPTY (available in ALL languages). Absent `locale` → TRUE (no filtering).
 * The Prisma grid path uses `languageMembership` for the same semantics.
 */
function languagePredicate(locale?: string): Prisma.Sql {
  if (!locale) return Prisma.sql`TRUE`;
  return Prisma.sql`(${locale} = ANY(languages) OR cardinality(languages) = 0)`;
}

/** The keyset comparator `id > afterId`, or TRUE. */
function keysetPredicate(afterKey?: CursorKey): Prisma.Sql {
  if (!afterKey) return Prisma.sql`TRUE`;
  return Prisma.sql`id > ${afterKey.id}::uuid`;
}

// ---------------------------------------------------------------------------
// admin select + row mapper + orderBy (TAM-94; kept out of the class body)
// ---------------------------------------------------------------------------

/**
 * The admin projection — EVERY column, including the Pro-gated `audioUrl` in
 * full (admin is not gated) and `updatedAt` (the concurrency precondition + the
 * response field). Distinct from the public `RINGTONE_SELECT`, which has no
 * `updatedAt`.
 */
const ADMIN_RINGTONE_SELECT = {
  id: true,
  slug: true,
  title: true,
  deitySlug: true,
  thumbnailImageUrl: true,
  audioUrl: true,
  playCount: true,
  setCount: true,
  tags: true,
  searchKeywords: true,
  languages: true,
  artistOrSource: true,
  deepLinkUrl: true,
  altText: true,
  shareTitle: true,
  shareDescription: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface AdminRawRow {
  id: string;
  slug: string;
  title: string;
  deitySlug: string;
  thumbnailImageUrl: string;
  audioUrl: string;
  playCount: number;
  setCount: number;
  tags: string[];
  searchKeywords: string[];
  languages: string[];
  artistOrSource: string | null;
  deepLinkUrl: string | null;
  altText: string | null;
  shareTitle: string | null;
  shareDescription: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminView(row: AdminRawRow): AdminRingtoneView {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    deitySlug: row.deitySlug,
    thumbnailImageUrl: row.thumbnailImageUrl,
    audioUrl: row.audioUrl,
    playCount: row.playCount,
    setCount: row.setCount,
    tags: row.tags,
    searchKeywords: row.searchKeywords,
    languages: row.languages,
    artistOrSource: row.artistOrSource,
    deepLinkUrl: row.deepLinkUrl,
    altText: row.altText,
    shareTitle: row.shareTitle,
    shareDescription: row.shareDescription,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildAdminOrderBy(
  sort: RingtoneSortField | undefined,
  order: "asc" | "desc"
): Prisma.RingtoneOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      // Natural admin order = the public grid order (stable id).
      return [{ id: "asc" }];
    case "title":
      return [{ title: order }, { id: "asc" }];
    case "playCount":
      return [{ playCount: order }, { id: "asc" }];
    case "setCount":
      return [{ setCount: order }, { id: "asc" }];
    case "isActive":
      return [{ isActive: order }, { id: "asc" }];
    case "createdAt":
      return [{ createdAt: order }, { id: "asc" }];
    case "updatedAt":
      return [{ updatedAt: order }, { id: "asc" }];
  }
}
