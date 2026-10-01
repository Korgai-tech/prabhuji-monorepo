import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';

/**
 * Book CHAPTER hooks. A chapter belongs to a `major_book` and OPTIONALLY to one
 * of its sub-books (`subBookId`). Its parent is FIXED by where it was added in
 * the tree (§#EXPORT_CRITICAL) — this UI never offers a cross-book parent picker.
 *
 * A chapter carries `bodyText` (Devanagari scripture — NEVER trimmed/normalised)
 * and an OPTIONAL `audioUrl` (audio/mpeg). Like a sub-book, it is a GENUINE
 * delete, not a deactivate.
 */

type ChaptersPath = paths['/admin/books/chapters'];
type ChapterByIdPath = paths['/admin/books/chapters/{id}'];

export type BookChapter =
  ChaptersPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

type ChapterCreateBody =
  ChaptersPath['post']['requestBody']['content']['application/json'];

type ChapterPatchBody =
  ChapterByIdPath['patch']['requestBody']['content']['application/json'];

export type ChapterChanges = Omit<ChapterPatchBody, 'expectedUpdatedAt'>;

const ENTITY = 'book-chapter';

/** Every chapter of one book (across all sub-books + the direct ones). */
export function useBookChapters(contentId: string | undefined) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, { contentId }),
    enabled: contentId !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/books/chapters', {
          params: { query: { contentId: contentId as string, pageSize: 100, sort: 'order', order: 'asc' } },
        }),
        'Failed to load chapters',
      ),
  });
}

export function useCreateChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ChapterCreateBody) =>
      unwrap(api.POST('/admin/books/chapters', { body }), 'Failed to create chapter'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useUpdateChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: ChapterChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/books/chapters/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save chapter',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useDeleteChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/books/chapters/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to delete chapter',
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) });
      void qc.invalidateQueries({ queryKey: adminKeys.entity('book-content') });
    },
  });
}
