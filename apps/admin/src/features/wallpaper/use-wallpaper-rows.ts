import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Wallpaper homepage-row feature hooks (TAM-97) — same EXEMPLAR shape as
 *  `use-wallpapers.ts`, for the curated home rows + their ordered items.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  - `rowKey` and `rowType` are create-only (absent from PATCH; the API 400s);
 *  - ONLY `custom` rows accept curated items — the other four resolve
 *    server-side and TAM-96 400s the item write (§#EXPORT_CRITICAL);
 *  - the items PUT has SET SEMANTICS: it sends the WHOLE `{wallpaperIds}` array
 *    in display order (TAM-96 writes `position` from the array index).
 */

// ── Types, DERIVED from the generated client (never hand-written) ────────────

type RowsPath = paths['/admin/wallpapers/rows'];
type RowByIdPath = paths['/admin/wallpapers/rows/{id}'];
type RowItemsPath = paths['/admin/wallpapers/rows/{id}/items'];

export type WallpaperRowListItem =
  RowsPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

export type WallpaperRowDetail =
  RowByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type WallpaperRowItem = WallpaperRowDetail['items'][number];

export type WallpaperRowCreateBody =
  RowsPath['post']['requestBody']['content']['application/json'];

export type WallpaperRowPatchBody =
  RowByIdPath['patch']['requestBody']['content']['application/json'];

/** The five curated-row kinds. Only `custom` accepts items. */
export type WallpaperRowType = WallpaperRowCreateBody['rowType'];

type RowItemsBody = RowItemsPath['put']['requestBody']['content']['application/json'];

const ENTITY = 'wallpaper-row';

// ── Queries ──────────────────────────────────────────────────────────────────

/** One page of the homepage-row list. */
export function useWallpaperRows(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/wallpapers/rows', {
          params: { query: toListQuery(state) },
        }),
        'Failed to load homepage rows',
      ),
  });
}

/** One row, with its curated `items` (in `position` order) for the editor. */
export function useWallpaperRow(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/wallpapers/rows/{id}', {
          params: { path: { id: id as string } },
        }),
        'Failed to load homepage row',
      ),
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Create a homepage row. Duplicate `rowKey` → 409. */
export function useCreateWallpaperRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WallpaperRowCreateBody) =>
      unwrap(api.POST('/admin/wallpapers/rows', { body }), 'Failed to create homepage row'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * PATCH a row under the `updatedAt` precondition. `rowKey` and `rowType` are
 * NEVER sent (immutable — each changes what the row IS). Send only what changed.
 */
export function useUpdateWallpaperRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: Omit<WallpaperRowPatchBody, 'expectedUpdatedAt'>;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/wallpapers/rows/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save homepage row',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/** Deactivate a row (soft delete; `isActive = false`). Curated items untouched. */
export function useDeactivateWallpaperRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/wallpapers/rows/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate homepage row',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * Replace a `custom` row's curated items (SET SEMANTICS). Sends the WHOLE array
 * of `wallpaperIds` IN DISPLAY ORDER; TAM-96 writes each item's `position` from
 * the array index. A rejected set (unknown id) → the detail is invalidated and
 * refetched; the previous order is unchanged server-side (§(f)). Curating a
 * non-`custom` row is a 400 — the UI never offers it (§#EXPORT_CRITICAL).
 */
export function useSetWallpaperRowItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, wallpaperIds }: { id: string; wallpaperIds: RowItemsBody['wallpaperIds'] }) =>
      unwrap(
        api.PUT('/admin/wallpapers/rows/{id}/items', {
          params: { path: { id } },
          body: { wallpaperIds },
        }),
        'Failed to save curated items',
      ),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: adminKeys.detail(ENTITY, id) });
      void qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) });
    },
  });
}
