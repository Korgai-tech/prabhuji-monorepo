import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/** Home shortcut hooks — TAM-89 exemplar shape (see `use-home-banners.ts`). */

type ShortcutsPath = paths['/admin/home/shortcuts'];
type ShortcutByIdPath = paths['/admin/home/shortcuts/{id}'];

/** The full shortcut detail (list row + all translations). */
export type HomeShortcutDetail =
  ShortcutByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type HomeShortcut =
  ShortcutsPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

/** One localized `{ locale, label }` row as carried in the create/patch body. */
export type HomeShortcutTranslation = HomeShortcutCreateBody['translations'][number];

export type HomeShortcutCreateBody =
  ShortcutsPath['post']['requestBody']['content']['application/json'];

type HomeShortcutPatchBody =
  ShortcutByIdPath['patch']['requestBody']['content']['application/json'];

/** PATCH may carry any editable field (never `key` — it is create-only). */
export type HomeShortcutPatchChanges = Partial<
  Omit<HomeShortcutPatchBody, 'expectedUpdatedAt'>
>;

const ENTITY = 'home-shortcut';

export function useHomeShortcuts(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/home/shortcuts', { params: { query: toListQuery(state) } }),
        'Failed to load shortcuts',
      ),
  });
}

export function useHomeShortcut(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/home/shortcuts/{id}', { params: { path: { id: id as string } } }),
        'Failed to load shortcut',
      ),
  });
}

export function useCreateHomeShortcut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: HomeShortcutCreateBody) =>
      unwrap(api.POST('/admin/home/shortcuts', { body }), 'Failed to create shortcut'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useUpdateHomeShortcut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: HomeShortcutPatchChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/home/shortcuts/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save shortcut',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useDeactivateHomeShortcut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/home/shortcuts/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate shortcut',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
