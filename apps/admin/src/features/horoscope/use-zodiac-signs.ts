import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * Zodiac-sign feature hooks — copies the TAM-89 deity EXEMPLAR shape:
 * TanStack Query only, all HTTP through `lib/api.ts`, `unwrap()` for the
 * `{success,message,data}` envelope + `ApiError` (409 detection), keys via
 * `adminKeys` on the `'zodiac-sign'` entity prefix.
 *
 * DIVERGENCES from deity (TAM-73 / TAM-100 — MATCH, do not "fix"):
 *  - the liveness flag is `enabled`, NOT `active`/`isActive`;
 *  - the business key is `zodiacId` (the fixed twelve), immutable in PATCH;
 *  - `localizedDisplayName` is a `{locale:text}` Json map, not a translation table.
 * DELETE = deactivate (`enabled=false`), reversible; there is NO hard delete.
 */

type ZodiacListPath = paths['/admin/horoscope/zodiac-signs'];
type ZodiacByIdPath = paths['/admin/horoscope/zodiac-signs/{id}'];

export type ZodiacSign =
  ZodiacListPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

export type ZodiacCreateBody =
  ZodiacListPath['post']['requestBody']['content']['application/json'];

type ZodiacPatchBody =
  ZodiacByIdPath['patch']['requestBody']['content']['application/json'];

/** The subset a PATCH may change (`zodiacId` is immutable and never sent). */
export type ZodiacChanges = Partial<
  Pick<
    ZodiacPatchBody,
    'displayName' | 'localizedDisplayName' | 'iconAssetUrl' | 'sortOrder' | 'enabled'
  >
>;

const ENTITY = 'zodiac-sign';

export function useZodiacSigns(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/horoscope/zodiac-signs', {
          params: { query: toListQuery(state) },
        }),
        'Failed to load zodiac signs',
      ),
  });
}

export function useZodiacSign(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/horoscope/zodiac-signs/{id}', {
          params: { path: { id: id as string } },
        }),
        'Failed to load zodiac sign',
      ),
  });
}

export function useCreateZodiacSign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ZodiacCreateBody) =>
      unwrap(api.POST('/admin/horoscope/zodiac-signs', { body }), 'Failed to create zodiac sign'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useUpdateZodiacSign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: ZodiacChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/horoscope/zodiac-signs/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save zodiac sign',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/** Deactivate = soft delete (`enabled=false`); reversible via a PATCH. */
export function useDeactivateZodiacSign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/horoscope/zodiac-signs/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate zodiac sign',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
