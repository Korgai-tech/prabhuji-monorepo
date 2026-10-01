import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';

/**
 * Home settings — the SINGLETON (TAM-105 §(f)). GET + PATCH only; no list, no
 * create, no delete. TAM-104 guarantees `GET` returns a row (or a documented
 * default), never a 404 on a fresh DB — if it 404s that is TAM-104's bug and it
 * surfaces here rather than being papered over.
 */

type SettingsPath = paths['/admin/home/settings'];

export type HomeSettings =
  SettingsPath['get']['responses'][200]['content']['application/json']['data'];

const ENTITY = 'home-settings';

export function useHomeSettings() {
  return useQuery({
    queryKey: adminKeys.detail(ENTITY, 'singleton'),
    queryFn: () => unwrap(api.GET('/admin/home/settings'), 'Failed to load home settings'),
  });
}

/**
 * Flip `feedTrendingFirst`. The HIGHEST-blast-radius single field in the epic —
 * it reorders every user's home feed instantly (TAM-104 AC (g)). The caller
 * gates the write behind an explicit confirmation. Carries `expectedUpdatedAt`;
 * a 409 → conflict toast.
 */
export function useUpdateHomeSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      feedTrendingFirst,
      shortcutGridGradientEnabled,
      expectedUpdatedAt,
    }: {
      feedTrendingFirst: boolean;
      /**
       * TAM-174 — starts/stops the shortcut-grid gradient experiment for
       * everyone at once. NOT the traffic split (that lives in the A/B console,
       * or in the API's in-process map when the console is unwired) — this is
       * the kill switch, deliberately separate so stopping never depends on the
       * abtest service being reachable.
       */
      shortcutGridGradientEnabled: boolean;
      expectedUpdatedAt: string;
    }) =>
      unwrap(
        api.PATCH('/admin/home/settings', {
          body: { expectedUpdatedAt, feedTrendingFirst, shortcutGridGradientEnabled },
        }),
        'Failed to save home settings',
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity(ENTITY) }),
  });
}
