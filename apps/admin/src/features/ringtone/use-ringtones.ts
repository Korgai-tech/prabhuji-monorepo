import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Ringtone feature hooks — a VERBATIM copy of the taxonomy exemplar
 *  (`features/taxonomy/use-deities.ts`), retargeted at `/admin/ringtones`.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Same rules as every `/admin/*` resource:
 *  - ALL server state through TanStack Query — no `useEffect` + `fetch`;
 *  - ALL HTTP through `lib/api.ts` (the ONLY entry point), typed from the
 *    generated `@repo/api-client` — types are DERIVED from `paths`, never
 *    hand-written (regenerate the client if a path/type is missing);
 *  - `unwrap()` pulls `data.data` out of the `{success,message,data}` envelope
 *    and throws an `ApiError` carrying status + `errorCode`, so `<EntityForm>`
 *    recognises a 409 `STALE_WRITE`;
 *  - keys come from `adminKeys` (`['admin','ringtone', …]`), so ONE prefix
 *    invalidates every page/sort/filter of the list AND every detail row.
 *
 * Ringtone is a gating-sensitive module: TWO media fields in two visibility
 * classes (`thumbnailImageUrl` FREE; `audioUrl` PRO). The hooks stay dumb about
 * that — the UI (`ringtone-form.tsx`) labels the classes; here we only ever send
 * the fields that CHANGED, so a seeded media URL that would fail
 * `validateOwnedUrl` is never re-sent on an unrelated edit.
 */

// ── Types, DERIVED from the generated client (never hand-written) ────────────

type RingtonesPath = paths['/admin/ringtones'];
type RingtoneByIdPath = paths['/admin/ringtones/{id}'];
type DeitiesPath = paths['/admin/taxonomy/deities'];

/** One row of the list response (`{items,total,page,pageSize}` → item). Also the
 *  detail shape — the API returns the full view for both. */
export type RingtoneListItem =
  RingtonesPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

export type RingtoneDetail =
  RingtoneByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type RingtoneCreateBody =
  RingtonesPath['post']['requestBody']['content']['application/json'];

type RingtonePatchBody =
  RingtoneByIdPath['patch']['requestBody']['content']['application/json'];

/** The eight client languages a ringtone can be tagged with (empty = all). */
export type RingtoneLanguage = RingtoneCreateBody['languages'][number];

/** One deity option for the single-select picker (§(d)). */
export type DeityOption =
  DeitiesPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

/** The subset of PATCH fields the edit form diffs and sends (§#EXPORT_CRITICAL:
 *  `slug` is create-only; `playCount`/`setCount` are never submitted). */
export type RingtonePatchChanges = Omit<RingtonePatchBody, 'expectedUpdatedAt'>;

/** The invalidation prefix — mutations invalidate THIS, not a specific key. */
const ENTITY = 'ringtone';

// ── Queries ──────────────────────────────────────────────────────────────────

/** One page of the ringtone list, keyed by its pagination/sort/filter state. */
export function useRingtones(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/ringtones', {
          params: { query: toListQuery(state) },
        }),
        'Failed to load ringtones',
      ),
  });
}

/** One ringtone — backs the edit form. */
export function useRingtone(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/ringtones/{id}', {
          params: { path: { id: id as string } },
        }),
        'Failed to load ringtone',
      ),
  });
}

/**
 * The deity list for the single-select picker (§(d)) — the ADMIN list, so
 * DEACTIVATED deities appear (marked) and an existing reference stays editable.
 * The editor never types a slug, so a typo (which has no FK to catch it) is
 * unreachable. One page of up to 100 is plenty for a taxonomy root.
 */
export function useDeityOptions() {
  return useQuery({
    queryKey: adminKeys.list('deity', { picker: 'ringtone' }),
    queryFn: () =>
      unwrap(
        api.GET('/admin/taxonomy/deities', {
          params: { query: { page: 1, pageSize: 100, sort: 'sortOrder', order: 'asc' } },
        }),
        'Failed to load deities',
      ),
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Create a ringtone. Duplicate slug → 409. */
export function useCreateRingtone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RingtoneCreateBody) =>
      unwrap(api.POST('/admin/ringtones', { body }), 'Failed to create ringtone'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * PATCH a ringtone under the `updatedAt` precondition (ADR C3). `slug` is NEVER
 * sent (immutable, the API 400s on it), and callers pass only the fields that
 * CHANGED (see `ringtone-form.tsx`) — this module has two media fields, surface
 * for the seeded-URL `validateOwnedUrl` bug.
 */
export function useUpdateRingtone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: RingtonePatchChanges;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/ringtones/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save ringtone',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * Deactivate = soft delete (the row survives with `isActive = false`). It is a
 * `DELETE` carrying the `updatedAt` precondition; there is NO hard delete
 * (#EXPORT_CRITICAL). Reactivation is `useUpdateRingtone({ isActive: true })`.
 */
export function useDeactivateRingtone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/ringtones/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate ringtone',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
