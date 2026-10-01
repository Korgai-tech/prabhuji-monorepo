import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * Horoscope step-config feature hooks — the DATA-DRIVEN ordered-step catalogue
 * (TAM-100). Add (`POST`), remove (`DELETE` = deactivate), reorder / rename /
 * enable-disable (`PATCH`) are all row edits, no code change. `stepId` + `modeId`
 * are immutable business keys; the liveness flag is `enabled`.
 *
 * `useHoroscopeStepsForMode(modeId)` backs the result form's `stepId` select and
 * its title/contentType/order prefill (spec §(c)).
 */

type StepListPath = paths['/admin/horoscope/steps'];
type StepByIdPath = paths['/admin/horoscope/steps/{id}'];

export type HoroscopeStep =
  StepListPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

export type StepCreateBody =
  StepListPath['post']['requestBody']['content']['application/json'];

type StepPatchBody = StepByIdPath['patch']['requestBody']['content']['application/json'];

export type StepChanges = Partial<
  Pick<
    StepPatchBody,
    | 'title'
    | 'localizedTitle'
    | 'order'
    | 'contentType'
    | 'providerMapping'
    | 'safetyCategory'
    | 'ttsEnabled'
    | 'enabled'
  >
>;

const ENTITY = 'horoscope-step';

export function useHoroscopeSteps(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/horoscope/steps', { params: { query: toListQuery(state) } }),
        'Failed to load step config',
      ),
  });
}

/**
 * The steps configured for one mode — the source of truth for the result form's
 * `stepId` select + prefill. `enabled: false` is left in so the editor can see a
 * disabled step, but the form filters to enabled for new selections.
 */
export function useHoroscopeStepsForMode(modeId: string | undefined) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, { modeId }),
    enabled: modeId !== undefined && modeId !== '',
    queryFn: () =>
      unwrap(
        api.GET('/admin/horoscope/steps', {
          params: { query: { page: 1, pageSize: 100, modeId, sort: 'order', order: 'asc' } },
        }),
        'Failed to load steps for this mode',
      ),
  });
}

export function useCreateHoroscopeStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StepCreateBody) =>
      unwrap(api.POST('/admin/horoscope/steps', { body }), 'Failed to create step'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useUpdateHoroscopeStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: StepChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/horoscope/steps/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save step',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useDeactivateHoroscopeStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/horoscope/steps/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate step',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
