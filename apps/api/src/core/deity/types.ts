/**
 * Deity module public types (TAM-57).
 *
 * The deity taxonomy is the shared "which god" filter every content module
 * tags its rows with. This module owns the canonical list + localized display
 * names; module tickets (TAM-61…76) consume it ONLY through `IDeityApi` (via
 * `performServiceCall("deity", …)`), never by importing these files.
 */

/** Fallback locale used when a requested locale has no translation row. */
export const DEFAULT_DEITY_LOCALE = "en";

/**
 * Wire-facing localized deity — the `items[]` element of `GET /deities`.
 * `slug` is the stable content tag consumers store; `displayName` is resolved
 * for the requested locale (falling back to `en`, then the slug). No uuid on
 * the wire — `slug` is the contract.
 */
export interface LocalizedDeity {
  slug: string;
  displayName: string;
  iconUrl: string;
  sortOrder: number;
}

/**
 * Locale-independent deity summary returned by the facade's `getBySlug` — the
 * shape a module service needs to VALIDATE a deity tag (does it exist? is it
 * active?) without a translation lookup.
 */
export interface DeitySummary {
  id: string;
  slug: string;
  iconUrl: string;
  sortOrder: number;
  active: boolean;
}

/** A page of localized deities (cursor pagination). */
export interface DeityPage {
  items: LocalizedDeity[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Admin write surface (TAM-88) — DTOs the admin service returns to the
// controller. Plain, wire-ready shapes (timestamps already `.toISOString()`d)
// so the service stays Prisma-free and the Zod response schemas validate them
// unchanged. Distinct from `LocalizedDeity`: admin reads are NOT localized and
// NOT Pro-gated — an editor sees the raw row plus every translation.
// ---------------------------------------------------------------------------

/** One `(deityId, locale)` display-name row, as returned to the admin client. */
export interface AdminDeityTranslationView {
  locale: string;
  displayName: string;
}

/** An admin list row — the full deity row without translations. */
export interface AdminDeityListItemView {
  id: string;
  slug: string;
  iconUrl: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** An admin detail row — the list row plus ALL of the deity's translations. */
export interface AdminDeityDetailView extends AdminDeityListItemView {
  translations: AdminDeityTranslationView[];
}

/** One offset page of admin deity rows + the unpaginated total (ADR §C2). */
export interface AdminDeityPage {
  items: AdminDeityListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The admin-list `sort` allowlist (ADR §C2) — the deity's indexed columns plus
 * the timestamps. Lives HERE (not in `routes/`) because the repository builds
 * `orderBy` from it and `repositories/` is forbidden from importing `routes/`
 * (arch-boundaries.json). The Zod enum in `deity.admin.schemas.ts` is built from
 * this same tuple, so the boundary allowlist and the DB sort can never drift.
 */
export const DEITY_SORT_FIELDS = [
  "slug",
  "sortOrder",
  "active",
  "createdAt",
  "updatedAt",
] as const;
export type DeitySortField = (typeof DEITY_SORT_FIELDS)[number];

/** Partial deity mutation the admin repository applies under a precondition. */
export interface AdminDeityUpdateInput {
  iconUrl?: string;
  sortOrder?: number;
  active?: boolean;
}
