import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Deity (Taxonomy) feature hooks — THE EXEMPLAR the eight sibling module UIs
 *  copy. Read this before writing the next `use-<entity>.ts`.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * It is `src/features/users/use-users.ts`, promoted to a real server-paginated
 * `/admin/*` resource:
 *
 *  - ALL server state through TanStack Query — no `useEffect` + `fetch`;
 *  - ALL HTTP through `lib/api.ts` (the ONLY entry point), typed from the
 *    generated `@repo/api-client` — types are DERIVED from `paths`, never
 *    hand-written (if a path/type is missing, regenerate the client);
 *  - `unwrap()` pulls `data.data` out of the `{success,message,data}` envelope
 *    and throws an `ApiError` carrying the status + `errorCode` — that status is
 *    what lets `<EntityForm>` recognise a 409 `STALE_WRITE`, and what lets the
 *    duplicate-slug `SLUG_CONFLICT` be told apart from a concurrency conflict;
 *  - keys come from `adminKeys` (`['admin','deity', …]`), so ONE prefix
 *    invalidates every page/sort/filter of the list AND every detail row.
 *
 * The list endpoint DOES paginate server-side (ADR C2): feed `toListQuery(state)`
 * into the querystring and key on `adminKeys.list('deity', state)` — as does
 * `use-users.ts`, which no longer slices client-side.
 */

// ── Types, DERIVED from the generated client (never hand-written) ────────────

type DeitiesPath = paths['/admin/taxonomy/deities'];
type DeityByIdPath = paths['/admin/taxonomy/deities/{id}'];

/** One row of the list response (`{items,total,page,pageSize}` → item). */
export type DeityListItem =
  DeitiesPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

/** The full row, including its per-locale translations. */
export type DeityDetail =
  DeityByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type DeityTranslation = DeityDetail['translations'][number];

export type DeityCreateBody =
  DeitiesPath['post']['requestBody']['content']['application/json'];

/** The eight client locales + the `en` fallback (TAM-57). */
export type DeityLocale = DeityCreateBody['translations'][number]['locale'];

type DeityPatchBody =
  DeityByIdPath['patch']['requestBody']['content']['application/json'];

/** The invalidation prefix — mutations invalidate THIS, not a specific key. */
const ENTITY = 'deity';

// ── Queries ──────────────────────────────────────────────────────────────────

/** One page of the deity list, keyed by its pagination/sort/filter state. */
export function useDeities(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/taxonomy/deities', {
          params: { query: toListQuery(state) },
        }),
        'Failed to load deities',
      ),
  });
}

/** One deity, with its translations — backs the edit form + translations editor. */
export function useDeity(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/taxonomy/deities/{id}', {
          params: { path: { id: id as string } },
        }),
        'Failed to load deity',
      ),
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Create a deity (+ optional seeded translations). Duplicate slug → 409. */
export function useCreateDeity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeityCreateBody) =>
      unwrap(
        api.POST('/admin/taxonomy/deities', { body }),
        'Failed to create deity',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * PATCH a deity under the `updatedAt` precondition (ADR C3). `slug` is NEVER
 * sent — it is immutable and the API 400s on it. Callers pass only the fields
 * that CHANGED (see `deity-form.tsx`): re-sending a seeded picsum `iconUrl`
 * fails TAM-84's `validateOwnedUrl` and would block an unrelated edit.
 */
export function useUpdateDeity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: Pick<DeityPatchBody, 'iconUrl' | 'sortOrder' | 'active' | 'translations'>;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/taxonomy/deities/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save deity',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * Deactivate = soft delete (the row survives with `active = false`). It is a
 * `DELETE` carrying the `updatedAt` precondition; there is NO hard delete of a
 * deity (#EXPORT_CRITICAL). Reactivation is `useUpdateDeity({ active: true })`.
 */
export function useDeactivateDeity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/taxonomy/deities/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate deity',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
