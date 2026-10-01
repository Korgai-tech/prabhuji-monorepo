import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * StatusItem feature hooks (TAM-99) — a verbatim copy of the TAM-89 deity exemplar
 * (`src/features/taxonomy/use-deities.ts`) promoted to the `/admin/status/items`
 * resource:
 *
 *  - ALL server state through TanStack Query — no `useEffect` + `fetch`;
 *  - ALL HTTP through `lib/api.ts`, typed from the generated `@repo/api-client`
 *    (types DERIVED from `paths`, never hand-written — regenerate if missing);
 *  - `unwrap()` pulls `data.data` from the `{success,message,data}` envelope and
 *    throws an `ApiError` carrying the status + `errorCode` (what lets
 *    `<EntityForm>` detect a 409 `STALE_WRITE` and a create-time slug 409);
 *  - keys come from `adminKeys` (`['admin','status-item', …]`), so ONE prefix
 *    invalidates every page/sort/filter of the list AND every detail row.
 */

type ItemsPath = paths['/admin/status/items'];
type ItemByIdPath = paths['/admin/status/items/{id}'];

/** One row of the list response (list view — carries no `deitySlug`, see items-page). */
export type StatusItemListRow =
  ItemsPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

/** The full row, including its single `deitySlug` (detail view only). */
export type StatusItemDetail =
  ItemByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type StatusItemCreateBody =
  ItemsPath['post']['requestBody']['content']['application/json'];

export type StatusItemPatchBody =
  ItemByIdPath['patch']['requestBody']['content']['application/json'];

/** The invalidation prefix — mutations invalidate THIS, not a specific key. */
const ENTITY = 'status-item';

// ── Queries ──────────────────────────────────────────────────────────────────

/** One page of the status-item list, keyed by its pagination/sort/filter state. */
export function useStatusItems(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/status/items', {
          params: { query: toListQuery(state) },
        }),
        'Failed to load status items',
      ),
  });
}

/** One status item, with its deity slug — backs the edit form. */
export function useStatusItem(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/status/items/{id}', {
          params: { path: { id: id as string } },
        }),
        'Failed to load status item',
      ),
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Create a status item. Duplicate slug → 409. */
export function useCreateStatusItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StatusItemCreateBody) =>
      unwrap(api.POST('/admin/status/items', { body }), 'Failed to create status item'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * PATCH a status item under the `updatedAt` precondition (ADR C3). `slug` and
 * `mediaType` are NEVER sent (immutable — the API rejects them). Callers pass only
 * the fields that CHANGED (see `item-form.tsx`): re-sending a seeded media URL fails
 * TAM-84's `validateOwnedUrl` and would block an unrelated edit.
 */
export function useUpdateStatusItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: Omit<StatusItemPatchBody, 'expectedUpdatedAt'>;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/status/items/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save status item',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * Deactivate = soft delete (the row survives with `isActive = false`). It is a
 * `DELETE` carrying the `updatedAt` precondition; there is NO hard delete. Reactivate
 * is `useUpdateStatusItem({ isActive: true })`.
 */
export function useDeactivateStatusItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/status/items/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate status item',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
