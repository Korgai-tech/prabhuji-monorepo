import { useQuery } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';

import { api } from '@/lib/api';
import { unwrap } from '@/lib/api-result';
import { adminKeys } from '@/lib/query-keys';
import type { DataTableState } from '@/components/data-table/use-data-table-state';
import { toListQuery } from '@/components/data-table/use-data-table-state';

/**
 * Status performance feature hooks (TAM-256) — read-only, so queries only: no
 * mutations, no invalidation, no optimistic anything.
 *
 * Shapes are DERIVED from the generated client, never hand-written. If a type
 * below fails to resolve, regenerate: `pnpm nx run api:openapi` then
 * `pnpm nx run api-client:generate`.
 */

type ItemsPath = paths['/admin/status/performance/items'];
type DeitiesPath = paths['/admin/status/performance/deities'];

type ItemsData = ItemsPath['get']['responses'][200]['content']['application/json']['data'];
type DeitiesData = DeitiesPath['get']['responses'][200]['content']['application/json']['data'];

export type StatusPerformanceItemRow = ItemsData['items'][number];
export type StatusPerformanceDeityRow = DeitiesData['items'][number];

/**
 * The flags that keep a blank table honest. Both lists carry them, so the page
 * renders the same banners from either tab.
 */
export interface PerformanceMeta {
  warehouseAvailable: boolean;
  partialAttribution: boolean;
  metricsSuspect: boolean;
  metricsAvailableFrom: string;
}

export function useStatusPerformanceItems(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list('status-performance-items', state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/status/performance/items', {
          params: { query: toListQuery(state) },
        }),
        'Failed to load status performance',
      ),
    placeholderData: (prev) => prev,
  });
}

export function useStatusPerformanceDeities(state: DataTableState) {
  return useQuery({
    queryKey: adminKeys.list('status-performance-deities', state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/status/performance/deities', {
          params: { query: toListQuery(state) },
        }),
        'Failed to load deity performance',
      ),
    placeholderData: (prev) => prev,
  });
}

/**
 * Trigger a CSV download for the current filters.
 *
 * Goes through `fetch` + a blob rather than a plain `<a href>` because the
 * route needs the bearer token. A 503 here is the deliberate refusal to export
 * a file full of blank metric columns while the warehouse is degraded — a
 * downloaded file carries no banner, so it must not exist at all.
 */
export async function downloadPerformanceCsv(
  tab: 'items' | 'deities',
  state: DataTableState,
  token: string | null,
): Promise<void> {
  const query = toListQuery(state);
  delete query.page;
  delete query.pageSize;
  const qs = new URLSearchParams(
    Object.entries(query).map(([k, v]) => [k, String(v)]),
  ).toString();

  // `import.meta.env` is typed loosely, so narrow rather than let an `any`
  // flow into a request URL.
  const rawBase: unknown = import.meta.env['VITE_API_URL'];
  const base = typeof rawBase === 'string' ? rawBase : '';
  const res = await fetch(`${base}/admin/status/performance/${tab}.csv?${qs}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String(body.message)
        : `Export failed (${res.status})`;
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download =
    res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ??
    `status-performance-${tab}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
