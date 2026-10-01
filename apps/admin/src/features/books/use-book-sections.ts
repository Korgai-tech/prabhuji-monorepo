import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * Book SECTION hooks — the app's home-screen sections. `key` is one of a known
 * set (`carousel | categories | newly_added | all_books`), create-only. Like
 * content, a section is SOFT-deleted (`isActive = false`), never hard-deleted.
 */

type SectionsPath = paths['/admin/books/sections'];
type SectionByIdPath = paths['/admin/books/sections/{id}'];

export type BookSection =
  SectionsPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

/** The full section detail (list row + all translations). */
export type BookSectionDetail =
  SectionByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type BookSectionCreateBody =
  SectionsPath['post']['requestBody']['content']['application/json'];

export type BookSectionKey = BookSectionCreateBody['key'];

/** One localized `{ locale, title }` row as carried in the create/patch body. */
export type BookSectionTranslation = BookSectionCreateBody['translations'][number];

type SectionPatchBody =
  SectionByIdPath['patch']['requestBody']['content']['application/json'];

export type SectionChanges = Omit<SectionPatchBody, 'expectedUpdatedAt'>;

const ENTITY = 'book-section';

export function useBookSections(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/books/sections', {
          params: { query: toListQuery(state) },
        }),
        'Failed to load sections',
      ),
  });
}

/** One section with its translations — backs the edit form. */
export function useBookSection(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/books/sections/{id}', {
          params: { path: { id: id as string } },
        }),
        'Failed to load section',
      ),
  });
}

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BookSectionCreateBody) =>
      unwrap(api.POST('/admin/books/sections', { body }), 'Failed to create section'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: SectionChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/books/sections/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save section',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useDeactivateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/books/sections/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate section',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
