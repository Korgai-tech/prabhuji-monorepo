import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * Home banner feature hooks. Follows the TAM-89 exemplar (`use-deities.ts`):
 * all server state through TanStack Query, all HTTP through `lib/api.ts`, types
 * DERIVED from the generated client, `unwrap()` for the envelope + `ApiError`,
 * mutations invalidate the ENTITY prefix, PATCH/DELETE carry `expectedUpdatedAt`.
 */

type BannersPath = paths['/admin/home/banners'];
type BannerByIdPath = paths['/admin/home/banners/{id}'];

export type HomeBanner =
  BannersPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

/** The full banner detail (list row + all translations). */
export type HomeBannerDetail =
  BannerByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type HomeBannerCreateBody =
  BannersPath['post']['requestBody']['content']['application/json'];

/** One localized `{ locale, title }` row as carried in the create/patch body. */
export type HomeBannerTranslation = HomeBannerCreateBody['translations'][number];

type HomeBannerPatchBody =
  BannerByIdPath['patch']['requestBody']['content']['application/json'];

/** The fields a PATCH may carry (never `mediaType` — it is create-only). */
export type HomeBannerPatchChanges = Partial<
  Pick<
    HomeBannerPatchBody,
    | 'mediaUrl'
    | 'thumbnailUrl'
    | 'title'
    | 'destinationType'
    | 'destinationValue'
    | 'isProFeatureDiscovery'
    | 'sortOrder'
    | 'isActive'
    | 'translations'
  >
>;

const ENTITY = 'home-banner';

export function useHomeBanners(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/home/banners', { params: { query: toListQuery(state) } }),
        'Failed to load banners',
      ),
  });
}

export function useHomeBanner(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/home/banners/{id}', { params: { path: { id: id as string } } }),
        'Failed to load banner',
      ),
  });
}

export function useCreateHomeBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: HomeBannerCreateBody) =>
      unwrap(api.POST('/admin/home/banners', { body }), 'Failed to create banner'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useUpdateHomeBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: HomeBannerPatchChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/home/banners/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save banner',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/** Deactivate = soft delete (row survives with `isActive = false`). */
export function useDeactivateHomeBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/home/banners/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate banner',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
