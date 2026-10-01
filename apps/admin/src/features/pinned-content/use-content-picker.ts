import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';

import type { PinSurface } from './pinned-content-schema';

/**
 * Content picker sources — `home_feed` rows for `home` pins, `status` rows for
 * the two `status_*` pins. These reuse the existing admin list endpoints
 * (`/admin/home/feed-items` and `/admin/status/items`) rather than adding new
 * routes.
 *
 * ── SEARCH RUNS ON THE SERVER (TAM-175) ─────────────────────────────────────
 * This file used to fetch ONE page of 100 rows on mount and let the picker
 * filter that array in the browser. Two things were wrong with it:
 *
 *  1. `pageSize: 100` is `ADMIN_MAX_PAGE_SIZE` — a hard ceiling, not a tunable.
 *     Every row past it was invisible to the picker, permanently.
 *  2. No `sort` was sent, so the API fell back to `orderBy: [{ id: "asc" }]`
 *     over a `@default(uuid())` PK — i.e. the 100 rows you got were an
 *     ARBITRARY slice of the catalogue, not the newest or the oldest. That is
 *     why items appeared to be missing with no discernible pattern.
 *
 * So: the search term is a query param (`q` — an insensitive `contains` over
 * `title` + `slug` on both endpoints), it lives in the react-query key, and the
 * picker renders exactly what came back. The browser never filters. Ordering is
 * pinned to `updatedAt desc` so the no-term browse list is "recently edited
 * first" rather than random.
 *
 * `q` matches title/slug only, so a term that is a UUID is resolved through the
 * by-id detail endpoint instead — the field's helper copy promises "title, slug
 * or ID" and pasting an id is a real editor workflow.
 *
 * The keys sit under a picker-scoped params object so the pinned-content
 * cache lives beside the home/status caches without stepping on their
 * list invalidations — and, for the by-id reads, so they cannot collide with
 * `useHomeFeedItem`'s `adminKeys.detail(...)` entry, which holds a different
 * (full-detail) payload fetched from the same endpoint.
 */

type HomeFeedItem =
  paths['/admin/home/feed-items']['get']['responses'][200]['content']['application/json']['data']['items'][number];

type HomeFeedDetail =
  paths['/admin/home/feed-items/{id}']['get']['responses'][200]['content']['application/json']['data'];

type StatusItem =
  paths['/admin/status/items']['get']['responses'][200]['content']['application/json']['data']['items'][number];

type StatusItemDetail =
  paths['/admin/status/items/{id}']['get']['responses'][200]['content']['application/json']['data'];

/**
 * Rows per picker request. Deliberately below `ADMIN_MAX_PAGE_SIZE` (100):
 * this is a browse-then-search field, not a table. A term narrows it; the
 * truncation hint tells the editor when there is more behind the page.
 */
export const PICKER_PAGE_SIZE = 50;

/** Strict UUID shape — anything else is a text term and goes down the `q` path. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The trimmed row every picker consumer needs — id + title + thumbnail. */
export interface ContentOption {
  id: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  /**
   * Status rows only, and only when resolved by id — the LIST view does not
   * carry it. Used to reject a cross-deity pick on `status_deity`.
   */
  deitySlug?: string | null;
}

/** One page of picker options plus the unpaginated row count behind it. */
export interface ContentPage {
  items: ContentOption[];
  total: number;
}

/** What `useContentOptionsForSurface` hands the picker. */
export interface ContentOptionsResult {
  data: ContentPage | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
}

// ── Home feed items ──────────────────────────────────────────────────────────

export function useHomeFeedOptions(search: string, enabled = true) {
  const term = search.trim();
  return useQuery({
    queryKey: adminKeys.list('home-feed-item', {
      picker: 'pinned-content',
      q: term,
    }),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ContentPage> => {
      if (UUID_RE.test(term)) {
        const one = await fetchHomeById(term);
        return one === null ? { items: [], total: 0 } : { items: [one], total: 1 };
      }
      const query: NonNullable<
        paths['/admin/home/feed-items']['get']['parameters']['query']
      > = {
        page: 1,
        pageSize: PICKER_PAGE_SIZE,
        sort: 'updatedAt',
        order: 'desc',
      };
      // An empty `q` would 400 (`min(1)`) — omit the param instead.
      if (term !== '') query.q = term;
      const data = await unwrap(
        api.GET('/admin/home/feed-items', { params: { query } }),
        'Failed to load home feed items',
      );
      return { items: data.items.map(toHomeOption), total: data.total };
    },
  });
}

function toHomeOption(item: HomeFeedItem | HomeFeedDetail): ContentOption {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    thumbnailUrl: item.heroImageUrl ?? null,
  };
}

// ── Status items ─────────────────────────────────────────────────────────────

/**
 * The status picker source. If `deitySlug` is given (status_deity surface),
 * the API filters server-side — the same filter the status items page uses
 * — so a picker item's deity never mismatches the pin's deity. The by-id path
 * re-checks the same thing by hand, because the detail endpoint does not.
 */
export function useStatusItemOptions(
  deitySlug: string | undefined,
  search: string,
  enabled = true,
) {
  const term = search.trim();
  return useQuery({
    queryKey: adminKeys.list('status-item', {
      picker: 'pinned-content',
      deitySlug: deitySlug ?? '',
      q: term,
    }),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ContentPage> => {
      if (UUID_RE.test(term)) {
        const one = await fetchStatusById(term);
        const usable =
          one !== null &&
          (deitySlug === undefined ||
            deitySlug === '' ||
            one.deitySlug === deitySlug);
        return usable && one !== null
          ? { items: [one], total: 1 }
          : { items: [], total: 0 };
      }
      const query: NonNullable<
        paths['/admin/status/items']['get']['parameters']['query']
      > = {
        page: 1,
        pageSize: PICKER_PAGE_SIZE,
        sort: 'updatedAt',
        order: 'desc',
      };
      if (deitySlug !== undefined && deitySlug !== '') query.deitySlug = deitySlug;
      if (term !== '') query.q = term;
      const data = await unwrap(
        api.GET('/admin/status/items', { params: { query } }),
        'Failed to load status items',
      );
      return { items: data.items.map(toStatusOption), total: data.total };
    },
  });
}

function toStatusOption(item: StatusItem | StatusItemDetail): ContentOption {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    thumbnailUrl: item.thumbnailUrl ?? null,
    // Present on the detail payload, absent on the list view.
    deitySlug: 'deitySlug' in item ? item.deitySlug ?? null : undefined,
  };
}

// ── By-id resolution ─────────────────────────────────────────────────────────

/**
 * One content row by id, or `null` when it does not exist.
 *
 * A 404 is a legitimate answer here, not a failure: the picker asks about an
 * id the editor pasted, and the list page asks about an id a pin points at
 * (whose content may since have been deleted). Both want an empty result, not
 * an error alert — so the 404 is swallowed and every other status still throws.
 */
async function fetchHomeById(id: string): Promise<ContentOption | null> {
  try {
    const data = await unwrap(
      api.GET('/admin/home/feed-items/{id}', { params: { path: { id } } }),
      'Failed to load the feed item',
    );
    return toHomeOption(data);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
}

async function fetchStatusById(id: string): Promise<ContentOption | null> {
  try {
    const data = await unwrap(
      api.GET('/admin/status/items/{id}', { params: { path: { id } } }),
      'Failed to load the status item',
    );
    return toStatusOption(data);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
}

/** The endpoint a surface's ids live behind. */
function fetchBySurface(
  surface: PinSurface,
  id: string,
): Promise<ContentOption | null> {
  return surface === 'home' ? fetchHomeById(id) : fetchStatusById(id);
}

/** Picker-scoped key for a by-id read — never `adminKeys.detail`, see the header. */
function byIdKey(surface: PinSurface, id: string) {
  return adminKeys.list(surface === 'home' ? 'home-feed-item' : 'status-item', {
    picker: 'pinned-content',
    byId: id,
  });
}

/**
 * The currently-selected pick, resolved by id so an edit opens showing its real
 * title even when that row is nowhere in the current result page.
 */
export function useContentOptionById(surface: PinSurface | '', id: string) {
  // One object so the "is there anything to resolve?" test narrows the surface
  // for the key AND for the (deferred) query function — a bare boolean flag
  // narrows the first and not the second.
  const target = surface === '' || id === '' ? null : { surface, contentId: id };
  return useQuery({
    queryKey:
      target === null
        ? adminKeys.list('pinned-content-by-id', { idle: true })
        : byIdKey(target.surface, target.contentId),
    enabled: target !== null,
    staleTime: 60_000,
    queryFn: () =>
      target === null ? null : fetchBySurface(target.surface, target.contentId),
  });
}

/**
 * Display data for the pins on the current LIST page, keyed `surface:contentId`.
 *
 * Resolving by id (one cached query per distinct pair, bounded by the list's
 * page size) replaced a pair of unconditional `pageSize=100` catalogue fetches
 * that the column indexed into — which silently missed for every pin whose
 * content sat outside those 100 arbitrary rows, rendering a bare UUID instead
 * of a title (TAM-175).
 */
export function useContentLookup(
  rows: readonly { surface: PinSurface; contentId: string }[],
): Map<string, ContentOption> {
  const pairs = dedupePairs(rows);
  const results = useQueries({
    queries: pairs.map((pair) => ({
      queryKey: byIdKey(pair.surface, pair.contentId),
      staleTime: 60_000,
      queryFn: () => fetchBySurface(pair.surface, pair.contentId),
    })),
  });

  const map = new Map<string, ContentOption>();
  results.forEach((result, index) => {
    const option = result.data;
    if (option === null || option === undefined) return;
    const pair = pairs[index];
    if (pair === undefined) return;
    map.set(lookupKey(pair.surface, pair.contentId), option);
  });
  return map;
}

/** The composite key — a `home` id and a `status` id must never collide. */
export function lookupKey(surface: PinSurface, contentId: string): string {
  return `${surface}:${contentId}`;
}

function dedupePairs(
  rows: readonly { surface: PinSurface; contentId: string }[],
): { surface: PinSurface; contentId: string }[] {
  const seen = new Set<string>();
  const out: { surface: PinSurface; contentId: string }[] = [];
  for (const row of rows) {
    if (row.contentId === '') continue;
    const key = lookupKey(row.surface, row.contentId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ surface: row.surface, contentId: row.contentId });
  }
  return out;
}

// ── Pick-the-right-source helper (used by the form's picker) ─────────────────

/**
 * The picker source for a given surface. `home` reads home_feed;
 * `status_all_gods` reads every status row; `status_deity` reads the deity's
 * status rows only. The query is disabled while the picker cannot resolve a
 * source yet (e.g. `status_deity` with no deity picked) — no request fires.
 */
export function useContentOptionsForSurface(
  surface: PinSurface | '',
  deitySlug: string,
  search: string,
): ContentOptionsResult {
  const wantsHome = surface === 'home';
  const wantsStatus = surface === 'status_all_gods' || surface === 'status_deity';
  const statusReady = surface === 'status_all_gods' || deitySlug !== '';

  // Both hooks always RUN (hooks must), but only the one the surface selects
  // is enabled — an unpicked surface must not fetch a catalogue nothing will
  // render, and `status_deity` must not fetch the unfiltered status list while
  // the deity is still empty.
  const home = useHomeFeedOptions(wantsHome ? search : '', wantsHome);
  const status = useStatusItemOptions(
    surface === 'status_deity' ? deitySlug : undefined,
    wantsStatus ? search : '',
    wantsStatus && statusReady,
  );

  if (wantsHome) return pick(home);
  if (wantsStatus && statusReady) return pick(status);
  return { data: undefined, isLoading: false, isFetching: false, isError: false, error: null };
}

function pick(query: {
  data: ContentPage | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
}): ContentOptionsResult {
  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  };
}
