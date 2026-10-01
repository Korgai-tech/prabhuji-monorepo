import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * Book CONTENT hooks — modelled verbatim on `features/taxonomy/use-deities.ts`
 * (the exemplar): all server state through TanStack Query, all HTTP through
 * `lib/api.ts`, types DERIVED from the generated client, `unwrap()` for the
 * envelope + `ApiError`, and mutations invalidate the ENTITY prefix.
 *
 * `BookContent` is the discriminated root of the module's two hierarchies
 * (`major_book` | `direct_scripture`, TAM-102). It is SOFT-deleted
 * (`isActive = false`), never hard-deleted — like a deity.
 */

type ContentPath = paths['/admin/books/content'];
type ContentByIdPath = paths['/admin/books/content/{id}'];

/** One row of the paginated list (also the shape of the detail view). */
export type BookContentListItem =
  ContentPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

/** The full content row (same view shape as the list item). */
export type BookContentDetail =
  ContentByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type BookContentType = BookContentListItem['contentType'];
export type BookCategory = NonNullable<BookContentListItem['category']>;
export type BookLanguage = BookContentListItem['languages'][number];

export type BookContentCreateBody =
  ContentPath['post']['requestBody']['content']['application/json'];

type BookContentPatchBody =
  ContentByIdPath['patch']['requestBody']['content']['application/json'];

/** Only-changed fields sent on PATCH (never `slug`/`contentType` — immutable). */
export type BookContentChanges = Omit<BookContentPatchBody, 'expectedUpdatedAt'>;

const ENTITY = 'book-content';

// ── Queries ──────────────────────────────────────────────────────────────────

export function useBookContentList(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/books/content', {
          params: { query: toListQuery(state) },
        }),
        'Failed to load books',
      ),
  });
}

export function useBookContent(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/books/content/{id}', {
          params: { path: { id: id as string } },
        }),
        'Failed to load book',
      ),
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useCreateBookContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BookContentCreateBody) =>
      unwrap(api.POST('/admin/books/content', { body }), 'Failed to create book'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * PATCH only the fields that changed (§#EXPORT_CRITICAL). `slug`/`contentType`
 * are NEVER sent (immutable — flipping `contentType` orphans the child
 * structure), and a seeded/untouched `coverImageUrl` must not be re-sent
 * (`validateOwnedUrl`). `expectedUpdatedAt` is the ADR C3 precondition.
 */
export function useUpdateBookContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: BookContentChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/books/content/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save book',
      ),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: adminKeys.detail(ENTITY, id) });
      void qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) });
    },
  });
}

/** Deactivate = soft delete (`isActive = false`). Reactivate is a plain PATCH. */
export function useDeactivateBookContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/books/content/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate book',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
