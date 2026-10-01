import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * Mantra category feature hooks — a straight copy of the taxonomy EXEMPLAR
 * (`features/taxonomy/use-deities.ts`): all server state through TanStack Query,
 * all HTTP through `lib/api.ts`, types DERIVED from the generated `paths`,
 * `unwrap()` for the envelope + `ApiError` (status/`errorCode`), and one
 * `adminKeys.entity` invalidation prefix per mutation.
 */

type CategoriesPath = paths['/admin/mantras/categories'];
type CategoryByIdPath = paths['/admin/mantras/categories/{id}'];

/** One row of the category list. */
export type MantraCategory =
  CategoriesPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

/** The full category detail (list row + all translations). */
export type MantraCategoryDetail =
  CategoryByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type MantraCategoryCreateBody =
  CategoriesPath['post']['requestBody']['content']['application/json'];

type MantraCategoryPatchBody =
  CategoryByIdPath['patch']['requestBody']['content']['application/json'];

/** The fields a category PATCH may carry (never `slug` — it is immutable). */
export type MantraCategoryChanges = Pick<
  MantraCategoryPatchBody,
  'displayName' | 'imageUrl' | 'backgroundColorToken' | 'sortOrder' | 'isActive' | 'translations'
>;

const ENTITY = 'mantra-category';

// ── Queries ──────────────────────────────────────────────────────────────────

export function useMantraCategories(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/mantras/categories', {
          params: { query: toListQuery(state) },
        }),
        'Failed to load mantra categories',
      ),
  });
}

export function useMantraCategory(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/mantras/categories/{id}', {
          params: { path: { id: id as string } },
        }),
        'Failed to load mantra category',
      ),
  });
}

/**
 * All categories (one large page) for the item form's category multiselect and
 * the item list's category filter — the picker source, not a paginated table.
 * Inactive categories are included so an item already tagged with one stays
 * editable; the caller marks them.
 */
export function useMantraCategoryOptions() {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, { picker: true, pageSize: 100 }),
    queryFn: () =>
      unwrap(
        api.GET('/admin/mantras/categories', {
          params: { query: { page: 1, pageSize: 100, sort: 'sortOrder', order: 'asc' } },
        }),
        'Failed to load categories',
      ),
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Create a category. Duplicate slug → 409 `SLUG_CONFLICT`. */
export function useCreateMantraCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MantraCategoryCreateBody) =>
      unwrap(
        api.POST('/admin/mantras/categories', { body }),
        'Failed to create category',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/** PATCH a category under the `updatedAt` precondition (ADR C3). Send only the
 *  fields that CHANGED — a re-sent seeded `imageUrl` fails `validateOwnedUrl`. */
export function useUpdateMantraCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: MantraCategoryChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/mantras/categories/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save category',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/** Deactivate = soft delete (the row survives with `isActive = false`). */
export function useDeactivateMantraCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/mantras/categories/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate category',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
