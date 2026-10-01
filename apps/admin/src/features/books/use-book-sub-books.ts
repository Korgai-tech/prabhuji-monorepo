import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';

/**
 * Book SUB-BOOK (kanda) hooks. Sub-books live UNDER a `major_book` and are
 * edited inside the book's structure tree — never as a top-level list. They are
 * scoped to one `contentId`.
 *
 * Unlike content, a sub-book is a GENUINE delete (TAM-102's justified exception:
 * no liveness flag, real cascade FKs). Deleting one CASCADES to its chapters and
 * the response returns `deletedChapterCount` — the UI warns with the count it
 * already holds (`chapterCount`) BEFORE the delete.
 */

type SubBooksPath = paths['/admin/books/sub-books'];
type SubBookByIdPath = paths['/admin/books/sub-books/{id}'];

export type BookSubBook =
  SubBooksPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

type SubBookCreateBody =
  SubBooksPath['post']['requestBody']['content']['application/json'];

type SubBookPatchBody =
  SubBookByIdPath['patch']['requestBody']['content']['application/json'];

export type SubBookChanges = Omit<SubBookPatchBody, 'expectedUpdatedAt'>;

const ENTITY = 'book-sub-book';

/** Every sub-book of one book, ordered client-side by `order`. */
export function useBookSubBooks(contentId: string | undefined) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, { contentId }),
    enabled: contentId !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/books/sub-books', {
          params: { query: { contentId: contentId as string, pageSize: 100, sort: 'order', order: 'asc' } },
        }),
        'Failed to load sub-books',
      ),
  });
}

export function useCreateSubBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SubBookCreateBody) =>
      unwrap(api.POST('/admin/books/sub-books', { body }), 'Failed to create sub-book'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useUpdateSubBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: SubBookChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/books/sub-books/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save sub-book',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * HARD delete — cascades to every chapter. Also invalidates the chapter entity
 * so the tree drops the destroyed chapters. Returns `{ id, deletedChapterCount }`.
 */
export function useDeleteSubBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/books/sub-books/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to delete sub-book',
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) });
      void qc.invalidateQueries({ queryKey: adminKeys.entity('book-chapter') });
      void qc.invalidateQueries({ queryKey: adminKeys.entity('book-content') });
    },
  });
}
