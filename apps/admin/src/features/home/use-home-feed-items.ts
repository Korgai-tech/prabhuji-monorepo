import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/** Home feed item hooks — TAM-89 exemplar shape (see `use-home-banners.ts`). */

type FeedItemsPath = paths['/admin/home/feed-items'];
type FeedItemByIdPath = paths['/admin/home/feed-items/{id}'];

export type HomeFeedItem =
  FeedItemsPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

/** The full feed-item detail (list row + all translations). */
export type HomeFeedItemDetail =
  FeedItemByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type HomeFeedItemCreateBody =
  FeedItemsPath['post']['requestBody']['content']['application/json'];

/** One localized `{ locale, title, subtitle?, label?, ctaLabel, badgeLabel? }` row. */
export type HomeFeedItemTranslation = HomeFeedItemCreateBody['translations'][number];

type HomeFeedItemPatchBody =
  FeedItemByIdPath['patch']['requestBody']['content']['application/json'];

/** PATCH may carry any editable field (never `slug` — it is create-only). */
export type HomeFeedItemPatchChanges = Partial<
  Omit<HomeFeedItemPatchBody, 'expectedUpdatedAt'>
>;

const ENTITY = 'home-feed-item';

export function useHomeFeedItems(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/home/feed-items', { params: { query: toListQuery(state) } }),
        'Failed to load feed items',
      ),
  });
}

export function useHomeFeedItem(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/home/feed-items/{id}', { params: { path: { id: id as string } } }),
        'Failed to load feed item',
      ),
  });
}

export function useCreateHomeFeedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: HomeFeedItemCreateBody) =>
      unwrap(api.POST('/admin/home/feed-items', { body }), 'Failed to create feed item'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useUpdateHomeFeedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: HomeFeedItemPatchChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/home/feed-items/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save feed item',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useDeactivateHomeFeedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/home/feed-items/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate feed item',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
