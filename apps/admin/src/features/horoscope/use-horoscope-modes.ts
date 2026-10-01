import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * Horoscope-mode feature hooks — TAM-89 exemplar shape. `modeId` is the
 * immutable business key; the liveness flag is `enabled`; DELETE = deactivate.
 */

type ModeListPath = paths['/admin/horoscope/modes'];
type ModeByIdPath = paths['/admin/horoscope/modes/{id}'];

export type HoroscopeMode =
  ModeListPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

export type ModeCreateBody =
  ModeListPath['post']['requestBody']['content']['application/json'];

type ModePatchBody = ModeByIdPath['patch']['requestBody']['content']['application/json'];

export type ModeChanges = Partial<Pick<ModePatchBody, 'modeName' | 'phase' | 'enabled'>>;

const ENTITY = 'horoscope-mode';

export function useHoroscopeModes(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/horoscope/modes', { params: { query: toListQuery(state) } }),
        'Failed to load modes',
      ),
  });
}

/**
 * Every mode (unpaginated view for the selects the result + step forms need).
 * A large `pageSize` is fine — modes are a tiny config table.
 */
export function useAllHoroscopeModes() {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, { all: true }),
    queryFn: () =>
      unwrap(
        api.GET('/admin/horoscope/modes', { params: { query: { page: 1, pageSize: 100 } } }),
        'Failed to load modes',
      ),
  });
}

export function useCreateHoroscopeMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ModeCreateBody) =>
      unwrap(api.POST('/admin/horoscope/modes', { body }), 'Failed to create mode'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useUpdateHoroscopeMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: ModeChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/horoscope/modes/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save mode',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useDeactivateHoroscopeMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/horoscope/modes/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate mode',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
