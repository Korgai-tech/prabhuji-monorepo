import { useQuery } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';

/**
 * The deity picker's data source (TAM-93 §(e)). The item's `deitySlug` is a
 * LOGICAL reference to `deities.slug` with NO FK — a typed slug that doesn't
 * exist becomes a tag that silently vanishes from every filter. So the editor
 * NEVER types a slug: they pick from this list.
 *
 * It fetches ALL deities (both active and inactive, one large page) off the
 * taxonomy list endpoint (TAM-89). Deactivated deities are INCLUDED so an item
 * already tagged with one stays editable — the picker marks them `(inactive)`.
 */

type DeitiesPath = paths['/admin/taxonomy/deities'];
type DeityRow =
  DeitiesPath['get']['responses'][200]['content']['application/json']['data']['items'][number];

export interface DeityOption {
  slug: string;
  label: string;
  active: boolean;
}

export function useDeityOptions() {
  return useQuery<DeityOption[]>({
    // A distinct key from the taxonomy list view — this is the "all deities for a
    // picker" read, not a paginated table.
    queryKey: adminKeys.list('deity', { picker: 'mantras', pageSize: 100 }),
    queryFn: async () => {
      const rows = await unwrap(
        api.GET('/admin/taxonomy/deities', {
          params: { query: { page: 1, pageSize: 100, sort: 'slug', order: 'asc' } },
        }),
        'Failed to load deities',
      );
      return rows.items.map(
        (deity: DeityRow): DeityOption => ({
          slug: deity.slug,
          label: deity.active ? deity.slug : `${deity.slug} (inactive)`,
          active: deity.active,
        }),
      );
    },
  });
}
