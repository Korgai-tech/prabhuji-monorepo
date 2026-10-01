import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Wallpaper feature hooks (TAM-97) — copied from the taxonomy EXEMPLAR
 *  (`features/taxonomy/use-deities.ts`, TAM-89).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Same rules, verbatim:
 *  - ALL server state through TanStack Query — no `useEffect` + `fetch`;
 *  - ALL HTTP through `lib/api.ts`, typed from the generated `@repo/api-client`
 *    (types DERIVED from `paths`, never hand-written — regenerate if missing);
 *  - `unwrap()` pulls `data.data` out of the `{success,message,data}` envelope
 *    and throws an `ApiError` carrying status + `errorCode`, so `<EntityForm>`
 *    can recognise a 409 `STALE_WRITE`;
 *  - keys come from `adminKeys` (`['admin','wallpaper', …]`) — mutations
 *    invalidate the ENTITY PREFIX, not a specific list key.
 *
 * WALLPAPER SPECIFICS (§#EXPORT_CRITICAL):
 *  - `slug` and `mediaType` are create-only (absent from PATCH; the API 400s);
 *  - `setCount` is server-authoritative and NEVER submitted;
 *  - the six media fields each carry their own registry triple; send only the
 *    fields that CHANGED (seeded URLs fail `validateOwnedUrl`).
 */

// ── Types, DERIVED from the generated client (never hand-written) ────────────

type WallpapersPath = paths['/admin/wallpapers'];
type WallpaperByIdPath = paths['/admin/wallpapers/{id}'];

/** One row of the list response (`{items,total,page,pageSize}` → item). */
export type WallpaperListItem =
  WallpapersPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

/** The full row (every media field + metadata). */
export type WallpaperDetail =
  WallpaperByIdPath['get']['responses'][200]['content']['application/json']['data'];

export type WallpaperCreateBody =
  WallpapersPath['post']['requestBody']['content']['application/json'];

export type WallpaperPatchBody =
  WallpaperByIdPath['patch']['requestBody']['content']['application/json'];

/** The `static | live` discriminant. */
export type WallpaperMediaType = WallpaperCreateBody['mediaType'];

/** The invalidation prefix — mutations invalidate THIS, not a specific key. */
const ENTITY = 'wallpaper';

// ── Queries ──────────────────────────────────────────────────────────────────

/** One page of the wallpaper list, keyed by its pagination/sort/filter state. */
export function useWallpapers(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list(ENTITY, state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/wallpapers', {
          params: { query: toListQuery(state) },
        }),
        'Failed to load wallpapers',
      ),
  });
}

/** One wallpaper — backs the edit form (all six media fields + metadata). */
export function useWallpaper(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, id ?? ''),
    enabled: id !== undefined,
    queryFn: () =>
      unwrap(
        api.GET('/admin/wallpapers/{id}', {
          params: { path: { id: id as string } },
        }),
        'Failed to load wallpaper',
      ),
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Create a wallpaper. Duplicate slug → 409 `SLUG_CONFLICT`. */
export function useCreateWallpaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WallpaperCreateBody) =>
      unwrap(api.POST('/admin/wallpapers', { body }), 'Failed to create wallpaper'),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * PATCH a wallpaper under the `updatedAt` precondition (ADR C3). `slug`,
 * `mediaType` and `setCount` are NEVER sent — the API 400s on them. Callers pass
 * only the fields that CHANGED (see `wallpaper-form.tsx`): re-sending a seeded
 * media URL fails TAM-84's `validateOwnedUrl`.
 */
export function useUpdateWallpaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changes,
      expectedUpdatedAt,
    }: {
      id: string;
      changes: Omit<WallpaperPatchBody, 'expectedUpdatedAt'>;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/wallpapers/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt, ...changes },
        }),
        'Failed to save wallpaper',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}

/**
 * Deactivate = soft delete (the row survives with `isActive = false`). A `DELETE`
 * carrying the `updatedAt` precondition; there is NO hard delete of a wallpaper
 * (§#EXPORT_CRITICAL). Reactivation is `useUpdateWallpaper({ isActive: true })`.
 */
export function useDeactivateWallpaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      unwrap(
        api.DELETE('/admin/wallpapers/{id}', {
          params: { path: { id } },
          body: { expectedUpdatedAt },
        }),
        'Failed to deactivate wallpaper',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
