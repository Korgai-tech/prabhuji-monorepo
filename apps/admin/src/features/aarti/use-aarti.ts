import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Aarti (audio catalogue) feature hooks — THREE entities + one tag PUT.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A verbatim copy of the TAM-89 taxonomy EXEMPLAR (`features/taxonomy/
 * use-deities.ts`), extended to three sibling resources
 * (`/admin/aarti/{categories,items,sections}`):
 *
 *  - ALL server state through TanStack Query — no `useEffect` + `fetch`;
 *  - ALL HTTP through `lib/api.ts` (the ONLY entry point), types DERIVED from
 *    the generated `@repo/api-client` `paths` — never hand-written (regenerate
 *    the client if a path/type is missing);
 *  - `unwrap()` pulls `data.data` out of the `{success,message,data}` envelope
 *    and throws an `ApiError` carrying status + `errorCode`, so `<EntityForm>`
 *    can recognise a 409 `STALE_WRITE` and a duplicate-slug `SLUG_CONFLICT`;
 *  - keys come from `adminKeys` (`['admin','aarti-item'|'aarti-category'|
 *    'aarti-section', …]`), so ONE entity-prefix invalidation covers every
 *    page/sort/filter of a list AND every detail row.
 *
 * All three lists paginate server-side (ADR C2): feed `toListQuery(state)` into
 * the querystring and key on `adminKeys.list(<entity>, state)`.
 */

// ── Path aliases (types are DERIVED from these; never hand-written) ──────────

type CategoriesPath = paths['/admin/aarti/categories'];
type CategoryByIdPath = paths['/admin/aarti/categories/{id}'];
type ItemsPath = paths['/admin/aarti/items'];
type ItemByIdPath = paths['/admin/aarti/items/{id}'];
type ItemCategoryTagsPath = paths['/admin/aarti/items/{id}/category-tags'];
type SectionsPath = paths['/admin/aarti/sections'];
type SectionByIdPath = paths['/admin/aarti/sections/{id}'];
type SectionItemsPath = paths['/admin/aarti/sections/{id}/items'];
type DeitiesPath = paths['/admin/taxonomy/deities'];

// ── Category types ───────────────────────────────────────────────────────────

export type CategoryListItem =
  CategoriesPath['get']['responses'][200]['content']['application/json']['data']['items'][number];
export type CategoryDetail =
  CategoryByIdPath['get']['responses'][200]['content']['application/json']['data'];
export type CategoryCreateBody =
  CategoriesPath['post']['requestBody']['content']['application/json'];
type CategoryPatchBody =
  CategoryByIdPath['patch']['requestBody']['content']['application/json'];

// ── Item types ───────────────────────────────────────────────────────────────

export type ItemListItem =
  ItemsPath['get']['responses'][200]['content']['application/json']['data']['items'][number];
export type ItemDetail =
  ItemByIdPath['get']['responses'][200]['content']['application/json']['data'];
export type ItemCreateBody =
  ItemsPath['post']['requestBody']['content']['application/json'];
type ItemPatchBody =
  ItemByIdPath['patch']['requestBody']['content']['application/json'];
type ItemCategoryTagsBody =
  ItemCategoryTagsPath['put']['requestBody']['content']['application/json'];
export type CategoryTag = ItemDetail['categoryTags'][number];

/** The 8 language codes accepted by the item create/patch body (TAM-108). */
export type LanguageCode = ItemCreateBody['languages'][number];

// ── Section types ────────────────────────────────────────────────────────────

export type SectionListItem =
  SectionsPath['get']['responses'][200]['content']['application/json']['data']['items'][number];
export type SectionDetail =
  SectionByIdPath['get']['responses'][200]['content']['application/json']['data'];
export type SectionCreateBody =
  SectionsPath['post']['requestBody']['content']['application/json'];
type SectionPatchBody =
  SectionByIdPath['patch']['requestBody']['content']['application/json'];

/** The known homepage section types (TAM-90 AC (g), + `curated` TAM-160). */
export type SectionType = SectionCreateBody['sectionType'];

/** One hand-picked item of a `curated` section, in `position` order (TAM-160). */
export type SectionItem = SectionDetail['items'][number];

type SectionItemsBody = SectionItemsPath['put']['requestBody']['content']['application/json'];

// ── Deity picker option ──────────────────────────────────────────────────────

export type DeityOption =
  DeitiesPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

// ── Invalidation prefixes ────────────────────────────────────────────────────

const CATEGORY = 'aarti-category';
const ITEM = 'aarti-item';
const SECTION = 'aarti-section';

// ════════════════════════════════════════════════════════════════════════════
//  Categories
// ════════════════════════════════════════════════════════════════════════════

export function useAartiCategories(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(CATEGORY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/aarti/categories', { params: { query: toListQuery(state) } }),
        'Failed to load categories',
      ),
  });
}

export function useAartiCategory(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(CATEGORY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/aarti/categories/{id}', { params: { path: { id: id as string } } }),
        'Failed to load category',
      ),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CategoryCreateBody) =>
      unwrap(api.POST('/admin/aarti/categories', { body }), 'Failed to create category'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(CATEGORY) }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: Omit<CategoryPatchBody, 'expectedUpdatedAt'>;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/aarti/categories/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save category',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(CATEGORY) }),
  });
}

export function useDeactivateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/aarti/categories/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate category',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(CATEGORY) }),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  Items
// ════════════════════════════════════════════════════════════════════════════

export function useAartiItems(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ITEM, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/aarti/items', { params: { query: toListQuery(state) } }),
        'Failed to load items',
      ),
  });
}

export function useAartiItem(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ITEM, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/aarti/items/{id}', { params: { path: { id: id as string } } }),
        'Failed to load item',
      ),
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ItemCreateBody) =>
      unwrap(api.POST('/admin/aarti/items', { body }), 'Failed to create item'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ITEM) }),
  });
}

/**
 * PATCH an item under the `updatedAt` precondition (ADR C3). Callers pass ONLY
 * the fields that CHANGED (see `item-form.tsx`): re-sending a seeded SoundHelix
 * `audioStreamUrl` or picsum `coverImageUrl` fails TAM-84's `validateOwnedUrl`
 * and would block an unrelated edit. `slug` and `playCount` are NEVER sent.
 */
export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: Omit<ItemPatchBody, 'expectedUpdatedAt'>;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/aarti/items/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save item',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ITEM) }),
  });
}

export function useDeactivateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/aarti/items/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate item',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ITEM) }),
  });
}

/**
 * Replace an item's category tags — `PUT` SET-SEMANTICS (send the WHOLE array;
 * TAM-90). A rejected set (unknown category id) is rolled back server-side, so
 * the caller REFETCHES rather than assuming its optimistic state; the detail +
 * list are invalidated on success.
 */
export function useSetItemCategoryTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, categoryIds }: { id: string; categoryIds: ItemCategoryTagsBody['categoryIds'] }) =>
      unwrap(
        api.PUT('/admin/aarti/items/{id}/category-tags', {
          params: { path: { id } },
          body: { categoryIds },
        }),
        'Failed to save category tags',
      ),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: adminKeys.detail(ITEM, id) });
      void qc.invalidateQueries({ queryKey: adminKeys.entity(ITEM) });
    },
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  Sections
// ════════════════════════════════════════════════════════════════════════════

export function useAartiSections(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(SECTION, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/aarti/sections', { params: { query: toListQuery(state) } }),
        'Failed to load sections',
      ),
  });
}

export function useAartiSection(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(SECTION, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/aarti/sections/{id}', { params: { path: { id: id as string } } }),
        'Failed to load section',
      ),
  });
}

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SectionCreateBody) =>
      unwrap(api.POST('/admin/aarti/sections', { body }), 'Failed to create section'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(SECTION) }),
  });
}

/** PATCH a section. `sectionType` is create-only and is NEVER sent. */
export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: Omit<SectionPatchBody, 'expectedUpdatedAt'>;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/aarti/sections/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save section',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(SECTION) }),
  });
}

export function useDeactivateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/aarti/sections/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate section',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(SECTION) }),
  });
}

/**
 * Replace a `curated` section's hand-picked items — PUT SET-SEMANTICS (TAM-160).
 * Sends the WHOLE `audioIds` array IN DISPLAY ORDER; the API writes each item's
 * `position` from the array index. There is deliberately NO `expectedUpdatedAt`
 * (a full-set replace that never touches the section row) — LAST SAVE WINS, and
 * the UI copy says so. A rejected set (unknown id) leaves the server order
 * untouched, so the editor drops its local order rather than keeping it.
 */
export function useSetSectionItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, audioIds }: { id: string; audioIds: SectionItemsBody['audioIds'] }) =>
      unwrap(
        api.PUT('/admin/aarti/sections/{id}/items', {
          params: { path: { id } },
          body: { audioIds },
        }),
        'Failed to save curated items',
      ),
    // The ENTITY prefix — one invalidation covers the detail the editor hydrates
    // from and every page of the section list.
    onSettled: () => qc.invalidateQueries({ queryKey: adminKeys.entity(SECTION) }),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  Deity options (for the single-deity picker + the deity filter)
// ════════════════════════════════════════════════════════════════════════════

/**
 * The full deity list for the item's deity picker (TAM-90 AC (f)/(e), TAM-88).
 * The ADMIN list is used (not the public `GET /deities`) because it INCLUDES
 * inactive deities: hiding a deactivated deity would make an existing tag on it
 * un-editable. A large `pageSize` fetches them all (the taxonomy is small).
 */
export function useDeityOptions() {
  return useQuery({
    queryKey: adminKeys.list('deity', { picker: true }),
    queryFn: () =>
      unwrap(
        api.GET('/admin/taxonomy/deities', {
          params: { query: { page: 1, pageSize: 100, sort: 'sortOrder', order: 'asc' } },
        }),
        'Failed to load deities',
      ),
  });
}

/**
 * All categories, for the item's category-tags editor and the category filter.
 * Same rationale as the deity picker — include inactive so an existing tag on a
 * deactivated category stays editable.
 */
export function useCategoryOptions() {
  return useQuery({
    queryKey: adminKeys.list(CATEGORY, { picker: true }),
    queryFn: () =>
      unwrap(
        api.GET('/admin/aarti/categories', {
          params: { query: { page: 1, pageSize: 100, sort: 'sortOrder', order: 'asc' } },
        }),
        'Failed to load categories',
      ),
  });
}
