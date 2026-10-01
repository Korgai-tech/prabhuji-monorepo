import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * Mantra audio-item feature hooks — copy of the taxonomy EXEMPLAR shape. The
 * item is the module's richest row: two media URLs (`artworkUrl`, `audioUrl`),
 * the Devanagari `mantraText`, a SINGLE nullable `deitySlug` (TAM-108, no FK),
 * and a MULTI `languages[]` (empty = all). `playCount` is a server counter —
 * read-only text, NEVER submitted.
 */

type ItemsPath = paths['/admin/mantras/items'];
type ItemByIdPath = paths['/admin/mantras/items/{id}'];
type CategoryTagsPath = paths['/admin/mantras/items/{id}/category-tags'];

/** One row of the list response (no `mantraText`/tags — those are on the detail). */
export type MantraItemListRow =
  ItemsPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

/** The full item, including `mantraText`, `categoryIds` and `deitySlug`. */
export type MantraItemDetail =
  ItemByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type MantraItemCreateBody =
  ItemsPath['post']['requestBody']['content']['application/json'];

type MantraItemPatchBody = ItemByIdPath['patch']['requestBody']['content']['application/json'];

/** The mutable subset of a PATCH (never `slug` — immutable business key). */
export type MantraItemChanges = Omit<MantraItemPatchBody, 'expectedUpdatedAt'>;

/** The eight client languages (TAM-108). Derived from the write body, never typed. */
export type LanguageCode = MantraItemCreateBody['languages'][number];

type CategoryTagsBody = CategoryTagsPath['put']['requestBody']['content']['application/json'];

const ENTITY = 'mantra-item';

// ── Queries ──────────────────────────────────────────────────────────────────

export function useMantraItems(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/mantras/items', { params: { query: toListQuery(state) } }),
        'Failed to load mantra items',
      ),
  });
}

export function useMantraItem(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/mantras/items/{id}', { params: { path: { id: id as string } } }),
        'Failed to load mantra item',
      ),
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Create an item. Duplicate slug → 409 `SLUG_CONFLICT`. */
export function useCreateMantraItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MantraItemCreateBody) =>
      unwrap(api.POST('/admin/mantras/items', { body }), 'Failed to create item'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/** PATCH under the `updatedAt` precondition; caller sends only changed fields —
 *  a re-sent seeded `audioUrl` fails TAM-84's `validateOwnedUrl` (§#EXPORT_CRITICAL). */
export function useUpdateMantraItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: MantraItemChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/mantras/items/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save item',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/** Deactivate = soft delete (row survives with `isActive = false`). */
export function useDeactivateMantraItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/mantras/items/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate item',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * Set an item's category tags — TAM-92's `PUT` SET-SEMANTICS (the whole array
 * replaces the prior set). A rejected write leaves the server unchanged; the
 * caller refetches (no optimistic retention).
 */
export function useSetMantraCategoryTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, categoryIds }: { id: string; categoryIds: CategoryTagsBody['categoryIds'] }) =>
      unwrap(
        api.PUT('/admin/mantras/items/{id}/category-tags', {
          params: { path: { id } },
          body: { categoryIds },
        }),
        'Failed to save category tags',
      ),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: adminKeys.detail(ENTITY, id) });
      void qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) });
    },
  });
}
