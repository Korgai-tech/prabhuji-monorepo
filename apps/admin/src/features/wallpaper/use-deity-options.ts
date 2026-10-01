import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';

/**
 * The deity PICKER source for the wallpaper form (TAM-97 §(d)).
 *
 * A deity tag is chosen from the deity list — the editor NEVER types a slug
 * (there is no FK; a typo is only caught by the facade on save). Deactivated
 * deities still appear (they may be tagged already) and are MARKED so.
 *
 * It reads TAM-89's `/admin/taxonomy/deities` list through the ONE HTTP entry
 * point, keyed under the `deity` entity prefix so it shares the cache with the
 * taxonomy screen. One page of up to 100 covers the Phase-1 deity set (a small,
 * bounded taxonomy); pagination here is unnecessary.
 */

export interface DeityOption {
  slug: string;
  active: boolean;
}

const OPTIONS_QUERY = { page: 1, pageSize: 100, sort: 'slug', order: 'asc' } as const;

export function useDeityOptions() {
  return useQuery({
    queryKey: adminKeys.list('deity', OPTIONS_QUERY),
    queryFn: async (): Promise<DeityOption[]> => {
      const data = await unwrap(
        api.GET('/admin/taxonomy/deities', { params: { query: OPTIONS_QUERY } }),
        'Failed to load deities',
      );
      return data.items.map((deity) => ({ slug: deity.slug, active: deity.active }));
    },
    staleTime: 60_000,
  });
}
