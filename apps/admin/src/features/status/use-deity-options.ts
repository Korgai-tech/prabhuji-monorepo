import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';

/**
 * The deity picker source (TAM-99 §(f)) — a status item's single `deitySlug` is
 * chosen from the taxonomy deity list, NEVER free text (there is no FK, so a typo
 * would silently orphan the tag). Deactivated deities are INCLUDED and marked in the
 * select, so an editor can still see (and keep) an existing tag on a now-inactive
 * deity.
 *
 * Read-only reuse of the TAM-88 `/admin/taxonomy/deities` endpoint. Keyed under the
 * shared `['admin','deity',…]` prefix so a deity mutation elsewhere invalidates this
 * picker too. `pageSize` is capped at the ADR C2 max (100) — the Phase-1 taxonomy is
 * far smaller, so a single page suffices (no picker pagination this phase).
 */
export interface DeityOption {
  slug: string;
  active: boolean;
}

export function useDeityOptions() {
  return useQuery({
    queryKey: adminKeys.list('deity', { picker: 'status' }),
    staleTime: 60_000,
    queryFn: async (): Promise<DeityOption[]> => {
      const data = await unwrap(
        api.GET('/admin/taxonomy/deities', {
          params: { query: { page: 1, pageSize: 100, sort: 'slug', order: 'asc' } },
        }),
        'Failed to load deities',
      );
      return data.items.map((d) => ({ slug: d.slug, active: d.active }));
    },
  });
}
