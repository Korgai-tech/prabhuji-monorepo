import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * Media-asset feature hooks — the result-screen background video + static
 * fallback. `assetKey` is the immutable business key. TAM-100 exposes NO DELETE
 * (deleting an asset breaks the result screen with no fallback), so this file
 * offers create + patch only — editors update, they do not delete (spec §(f)/(h)).
 */

type MediaListPath = paths['/admin/horoscope/media-assets'];
type MediaByIdPath = paths['/admin/horoscope/media-assets/{id}'];

export type MediaAsset =
  MediaListPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

export type MediaAssetCreateBody =
  MediaListPath['post']['requestBody']['content']['application/json'];

type MediaAssetPatchBody =
  MediaByIdPath['patch']['requestBody']['content']['application/json'];

export type MediaAssetChanges = Partial<
  Pick<
    MediaAssetPatchBody,
    'resultBackgroundVideoUrl' | 'resultBackgroundStaticFallbackUrl' | 'assetVersion'
  >
>;

const ENTITY = 'horoscope-media-asset';

export function useMediaAssets(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/horoscope/media-assets', { params: { query: toListQuery(state) } }),
        'Failed to load media assets',
      ),
  });
}

export function useMediaAsset(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/horoscope/media-assets/{id}', { params: { path: { id: id as string } } }),
        'Failed to load media asset',
      ),
  });
}

export function useCreateMediaAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MediaAssetCreateBody) =>
      unwrap(api.POST('/admin/horoscope/media-assets', { body }), 'Failed to create media asset'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useUpdateMediaAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: MediaAssetChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/horoscope/media-assets/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save media asset',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
