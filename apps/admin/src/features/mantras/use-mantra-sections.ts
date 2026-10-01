import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * Mantra homepage-section feature hooks — copy of the taxonomy EXEMPLAR. A
 * section is create-only in `sectionType` (unique per type — duplicate → 409
 * `SECTION_TYPE_CONFLICT`) and edits `title`/`layoutType`/`showAllEnabled`/…
 */

type SectionsPath = paths['/admin/mantras/sections'];
type SectionByIdPath = paths['/admin/mantras/sections/{id}'];
type SectionItemsPath = paths['/admin/mantras/sections/{id}/items'];

export type MantraSection =
  SectionsPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

/** The full section detail (list row + all translations). */
export type MantraSectionDetail =
  SectionByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type MantraSectionCreateBody =
  SectionsPath['post']['requestBody']['content']['application/json'];

type MantraSectionPatchBody = SectionByIdPath['patch']['requestBody']['content']['application/json'];

/** One hand-picked item of a `curated` section, in `position` order (TAM-160). */
export type MantraSectionItem = MantraSectionDetail['items'][number];

type SectionItemsBody = SectionItemsPath['put']['requestBody']['content']['application/json'];

/** The mutable subset of a PATCH (never `sectionType` — create-only). */
export type MantraSectionChanges = Pick<
  MantraSectionPatchBody,
  'title' | 'layoutType' | 'showAllEnabled' | 'sortOrder' | 'isActive' | 'translations'
>;

const ENTITY = 'mantra-section';

// ── Queries ──────────────────────────────────────────────────────────────────

export function useMantraSections(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/mantras/sections', { params: { query: toListQuery(state) } }),
        'Failed to load mantra sections',
      ),
  });
}

export function useMantraSection(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/mantras/sections/{id}', { params: { path: { id: id as string } } }),
        'Failed to load mantra section',
      ),
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Create a section. Duplicate `sectionType` → 409 `SECTION_TYPE_CONFLICT`. */
export function useCreateMantraSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MantraSectionCreateBody) =>
      unwrap(api.POST('/admin/mantras/sections', { body }), 'Failed to create section'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/** PATCH under the `updatedAt` precondition; caller sends only changed fields. */
export function useUpdateMantraSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: MantraSectionChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/mantras/sections/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save section',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * Replace a `curated` section's hand-picked items — PUT SET-SEMANTICS (TAM-160).
 * Sends the WHOLE `itemIds` array IN DISPLAY ORDER; the API writes each item's
 * `position` from the array index. There is deliberately NO `expectedUpdatedAt`
 * (a full-set replace that never touches the section row) — LAST SAVE WINS, and
 * the UI copy says so. A rejected set (unknown id) leaves the server order
 * untouched, so the editor drops its local order rather than keeping it.
 */
export function useSetMantraSectionItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemIds }: { id: string; itemIds: SectionItemsBody['itemIds'] }) =>
      unwrap(
        api.PUT('/admin/mantras/sections/{id}/items', {
          params: { path: { id } },
          body: { itemIds },
        }),
        'Failed to save curated items',
      ),
    // The ENTITY prefix — one invalidation covers the detail the editor hydrates
    // from and every page of the section list.
    onSettled: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/** Deactivate = soft delete (row survives with `isActive = false`). */
export function useDeactivateMantraSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/mantras/sections/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate section',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
