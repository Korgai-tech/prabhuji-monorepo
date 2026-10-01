import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { toApiError } from '@/lib/api-error';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * Daily-horoscope-result feature hooks — the PRIMARY surface (spec §(b)). A row
 * is `(zodiacId, modeId, dateIst, languageCode)` + ordered `steps`; the four key
 * fields are the determinism key (immutable in PATCH, duplicate → 409).
 *
 * DIVERGENCE from every sibling: DELETE is a GENUINE HARD delete (TAM-100's one
 * justified soft-delete exception — dated leaf content, no liveness flag,
 * nothing references it). `contentSafetyStatus` is SERVER-COMPUTED and read-only;
 * it is never in a write body, and a prohibited claim in a step is a 400.
 */

type ResultListPath = paths['/admin/horoscope/results'];
type ResultByIdPath = paths['/admin/horoscope/results/{id}'];

export type HoroscopeResult =
  ResultListPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

export type ResultCreateBody =
  ResultListPath['post']['requestBody']['content']['application/json'];

/** One authored step (`{stepId,title,displayText,ttsText,order,contentType}`). */
export type ResultStep = ResultCreateBody['steps'][number];

type ResultPatchBody = ResultByIdPath['patch']['requestBody']['content']['application/json'];

export type ResultChanges = Partial<
  Pick<ResultPatchBody, 'steps' | 'providerName' | 'generatedAt'>
>;

/** The list/coverage filter params TAM-100 exposes. */
export type ResultListFilters = NonNullable<ResultListPath['get']['parameters']['query']>;

const ENTITY = 'horoscope-result';

export function useHoroscopeResults(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/horoscope/results', { params: { query: toListQuery(state) } }),
        'Failed to load daily results',
      ),
  });
}

/**
 * The rows for ONE date + mode across all signs/languages — the client-side
 * source for the coverage indicator (spec §(b): "12×N rows is a trivial page";
 * TAM-100 exposes no coverage endpoint). Empty `modeId` disables the query.
 */
export function useResultCoverage(params: { dateIst: string; modeId: string }) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, { coverage: params }),
    enabled: params.modeId !== '' && params.dateIst !== '',
    queryFn: () =>
      unwrap(
        api.GET('/admin/horoscope/results', {
          params: {
            query: {
              page: 1,
              pageSize: 200,
              modeId: params.modeId,
              dateFrom: params.dateIst,
              dateTo: params.dateIst,
            },
          },
        }),
        'Failed to load coverage',
      ),
  });
}

export function useHoroscopeResult(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/horoscope/results/{id}', { params: { path: { id: id as string } } }),
        'Failed to load daily result',
      ),
  });
}

/**
 * Create a result. A prohibited claim in a step → 400
 * (`CONTENT_SAFETY_VIOLATION`); a duplicate determinism key → 409. Both are
 * surfaced by the caller (`result-form.tsx`).
 */
export function useCreateHoroscopeResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ResultCreateBody) =>
      unwrap(api.POST('/admin/horoscope/results', { body }), 'Failed to create daily result'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useUpdateHoroscopeResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: ResultChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/horoscope/results/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save daily result',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * HARD delete (TAM-100's justified exception — the ONE genuine delete in the
 * epic). The response is `data: null`, which openapi-fetch drops, so `unwrap`
 * cannot type it; assert success inline and reuse `toApiError` so a failure
 * still throws the same `ApiError` (status + `errorCode`) as everything else.
 */
export function useDeleteHoroscopeResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) => {
      const { data, error, response } = await api.DELETE('/admin/horoscope/results/{id}', {
        params: { path: { id } },
        body: { expectedUpdatedAt },
      });
      if (error || !data?.success) {
        throw toApiError(error ?? data, response, 'Failed to delete daily result');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
