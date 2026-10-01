import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { toApiError } from '@/lib/api-error';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';

import type { PinStatusFilter, PinSurface } from './pinned-content-schema';

/**
 * PinnedContent feature hooks (TAM-173). Mirrors the taxonomy exemplar
 * (`use-deities.ts`) on the six admin routes the backend module exposes:
 *
 *   GET    /admin/pinned-content            — list (filters + pagination)
 *   POST   /admin/pinned-content            — create
 *   GET    /admin/pinned-content/{id}       — hydrate the edit form
 *   PATCH  /admin/pinned-content/{id}       — update (needs updatedAt)
 *   DELETE /admin/pinned-content/{id}       — soft delete (needs updatedAt)
 *   POST   /admin/pinned-content/{id}/restore — un-soft-delete (needs updatedAt)
 *   GET    /admin/pinned-content/{id}/audit — append log
 *
 * As everywhere in this SPA:
 *   - ALL server state through TanStack Query — no `useEffect` fetching;
 *   - ALL HTTP through `lib/api.ts`, typed from the generated `@repo/api-client`;
 *   - `unwrap()` pulls `data.data` from the `{success,message,data}` envelope
 *     and throws an `ApiError` carrying status + `errorCode` — that is what
 *     lets `<EntityForm>` show the server's `pin_position_taken` message on 409;
 *   - keys come from `adminKeys` under the `pinned-content` entity, so ONE
 *     prefix invalidates every page / sort / filter AND every detail row.
 */

type ListPath = paths['/admin/pinned-content'];
type ByIdPath = paths['/admin/pinned-content/{id}'];
type RestorePath = paths['/admin/pinned-content/{id}/restore'];
type AuditPath = paths['/admin/pinned-content/{id}/audit'];

export type PinnedContentRow =
  ListPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

export type PinnedContentDetail =
  ByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type PinnedContentAuditRow =
  AuditPath['get']['responses'][200]['content']['application/json']['data'][number];

export type PinCreateBody = ListPath['post']['requestBody']['content']['application/json'];
export type PinPatchBody = ByIdPath['patch']['requestBody']['content']['application/json'];

/** The invalidation prefix — mutations invalidate THIS, not a specific key. */
const ENTITY = 'pinned-content';

// ── The list-page query state ────────────────────────────────────────────────

/**
 * URL-persisted filter+pagination state for the pinned-content list. Kept as
 * a plain object (not `DataTableState`) because the DataTable's own sort is
 * unused here — the API returns rows in `pin_position ASC` order and the list
 * page never offers a header sort.
 */
export interface PinnedContentListState {
  page: number;
  pageSize: number;
  surface: PinSurface | '';
  deitySlug: string;
  active: PinStatusFilter;
}

export const DEFAULT_LIST_STATE: PinnedContentListState = {
  page: 1,
  pageSize: 25,
  surface: '',
  deitySlug: '',
  active: 'any',
};

/** The querystring the API expects — undefined-valued keys omitted. */
function toListQuery(state: PinnedContentListState) {
  const query: NonNullable<ListPath['get']['parameters']['query']> = {
    page: state.page,
    pageSize: state.pageSize,
    active: state.active,
  };
  if (state.surface !== '') query.surface = state.surface;
  if (state.deitySlug !== '') query.deitySlug = state.deitySlug;
  return query;
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function usePinnedContentList(state: PinnedContentListState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/pinned-content', { params: { query: toListQuery(state) } }),
        'Failed to load pinned content',
      ),
  });
}

export function usePinnedContent(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/pinned-content/{id}', {
          params: { path: { id: id as string } },
        }),
        'Failed to load pin',
      ),
  });
}

export function usePinnedContentAudit(id: string | undefined) {
  return useQuery({
    queryKey: [...adminKeys.detail(ENTITY, id ?? ''), 'audit'] as const,
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/pinned-content/{id}/audit', {
          params: { path: { id: id as string } },
        }),
        'Failed to load audit log',
      ),
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useCreatePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PinCreateBody) =>
      unwrap(api.POST('/admin/pinned-content', { body }), 'Failed to create pin'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * PATCH under the `updatedAt` precondition (ADR C3). `surface` is NEVER sent
 * (the API rejects it — it is the invariant that keys the partial-unique
 * index). Callers pass only the fields that CHANGED.
 */
export function useUpdatePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: Omit<PinPatchBody, 'expectedUpdatedAt'>;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/pinned-content/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save pin',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * Soft delete — sets `deleted_at = now()` (never a hard delete; the
 * partial-unique index depends on soft delete). Row survives with a
 * `deletedAt` timestamp and can be restored.
 */
export function useSoftDeletePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/pinned-content/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to delete pin',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

export function useRestorePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      expectedUpdatedAt,
    }: {
      id: string;
      expectedUpdatedAt: string;
    }) => {
      // openapi-fetch types the response envelope inline; use the same
      // manual-envelope shape the delete-with-null-body hooks use elsewhere
      // (`use-utm-overrides.ts` → `useDeleteUtmOverride`).
      const body: RestorePath['post']['requestBody']['content']['application/json'] = {
        expectedUpdatedAt,
      };
      const { data, error, response } = await api.POST(
        '/admin/pinned-content/{id}/restore',
        {
          params: { path: { id } },
          body,
        },
      );
      if (error || !data?.success) {
        throw toApiError(error ?? data, response, 'Failed to restore pin');
      }
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
