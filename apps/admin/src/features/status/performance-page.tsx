import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { DataTable } from '@/components/data-table/data-table';
import type { DataTableColumn } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { CardThumb } from '@/components/data-table/card-thumb';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  downloadPerformanceCsv,
  useStatusPerformanceDeities,
  useStatusPerformanceItems,
  type PerformanceMeta,
  type StatusPerformanceDeityRow,
  type StatusPerformanceItemRow,
} from './use-status-performance';

/**
 * Status performance report (TAM-256) — read-only, two tabs.
 *
 * The presentation rules here are not cosmetic; each one exists because the
 * alternative misleads an editor who is about to retire content:
 *
 *  - a BLANK cell means "no denominator" (nobody saw it, no intents recorded);
 *  - an "n/a" cell means "we could not read the numbers" — a different fact,
 *    which is why the degraded state never renders as blank;
 *  - percentages can exceed 100% legitimately (see `pct`).
 */

const NO_DEITY = '(no-deity)';

/**
 * The column reference — a static page shipped with the CMS
 * (`public/docs/status-performance-columns.html`), so it deploys with the app
 * and needs no external account or share step.
 *
 * Linked rather than inlined because the explanations that matter here are long
 * — blank-vs-zero, why the two tabs do not add up, why completion can exceed
 * 100% — and a tooltip cannot carry them.
 *
 * Built from `import.meta.env.BASE_URL` rather than a literal `/cms/…`: the
 * base path is configurable (`VITE_BASE_PATH`) and a hardcoded prefix would
 * 404 anywhere it is served from a different root.
 */
const COLUMN_GUIDE_URL = `${import.meta.env.BASE_URL}docs/status-performance-columns.html`;

/** A blank cell. Deliberately empty — see the component docblock. */
function Blank() {
  return <span className="text-muted-foreground">—</span>;
}

/**
 * A ratio as a percentage.
 *
 * NOT clamped to 100%. Completion divides shares by recorded share intents, and
 * those come from different funnel populations — a retry re-fires the result
 * event, and a Home-originated share need not pass the Status module's CTA. A
 * value over 100% is real data, not a bug, so clamping it would hide the very
 * thing worth investigating.
 */
function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return <Blank />;
  return <span>{(value * 100).toFixed(1)}%</span>;
}

function num(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) return <Blank />;
  return <span>{value.toFixed(digits)}</span>;
}

function int(value: number | null | undefined) {
  if (value === null || value === undefined) return <Blank />;
  return <span>{value.toLocaleString()}</span>;
}

function day(iso: string | null | undefined) {
  if (!iso) return <Blank />;
  return <span>{iso.slice(0, 10)}</span>;
}

/**
 * The banners. Everything here is a case where the table alone would read as
 * an ordinary, quiet catalogue.
 */
function MetaBanners({ meta }: { meta: PerformanceMeta | undefined }) {
  if (!meta) return null;

  return (
    <div className="space-y-2">
      {!meta.warehouseAvailable && (
        // Non-dismissible on purpose: every metric column below is "n/a", and a
        // dismissed banner leaves a table that looks like real zeroes.
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
        >
          <strong>Analytics unavailable.</strong> Views, viewers, shares and every rate below
          could not be read. They are shown as <em>n/a</em> — this is not zero engagement. CSV
          export is disabled until the numbers load.
        </div>
      )}

      {meta.metricsSuspect && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
        >
          <strong>Metrics look wrong.</strong> The catalogue is not empty, yet every event count
          in this window is zero. That usually means the analytics event names changed upstream
          rather than that nobody engaged. Treat these numbers as unreliable and tell
          engineering.
        </div>
      )}

      {meta.partialAttribution && meta.warehouseAvailable && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <strong>Some shares are unattributed.</strong> A few items have no home-feed card
          carrying their id, so shares that started on the home feed cannot be counted against
          them. Share counts for those rows are a floor, not a total.
        </div>
      )}

      {meta.warehouseAvailable && (
        <p className="text-xs text-muted-foreground">
          Share intents and completion only exist from{' '}
          <strong>{meta.metricsAvailableFrom}</strong>. A date range starting earlier shows them
          blank beside a populated views column — blank means &ldquo;not recorded yet&rdquo;, not
          zero. Viewers is an approximate unique count (~0.5% error) and cannot be summed across
          rows.
        </p>
      )}
    </div>
  );
}

const DATE_FILTERS = [
  { id: 'dateFrom', label: 'From (IST)', type: 'text' as const, placeholder: 'YYYY-MM-DD' },
  { id: 'dateTo', label: 'To (IST)', type: 'text' as const, placeholder: 'YYYY-MM-DD' },
];

export function StatusPerformancePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'deity' ? 'deity' : 'item';
  const [exportError, setExportError] = useState<string | null>(null);

  // Default sort: share rate descending, with the 100-view floor on — the
  // question the page exists to answer is "what is worth making more of".
  const itemState = useDataTableState({
    sort: 'shareRate',
    order: 'desc',
    filters: { minViews: '100', ...(params.get('deitySlug') ? { deitySlug: params.get('deitySlug')! } : {}) },
  });
  const deityState = useDataTableState({ sort: 'shareRate', order: 'desc' });

  const items = useStatusPerformanceItems(itemState.state);
  const deities = useStatusPerformanceDeities(deityState.state);

  const setTab = useCallback(
    (next: string) => {
      const p = new URLSearchParams(params);
      p.set('tab', next);
      setParams(p, { replace: true });
    },
    [params, setParams],
  );

  /** Tab 2 → Tab 1, carrying the deity AND the window (D-14). */
  const drillDown = useCallback(
    (deitySlug: string) => {
      itemState.setState({
        ...itemState.state,
        page: 1,
        filters: {
          ...itemState.state.filters,
          deitySlug,
          dateFrom: deityState.state.filters['dateFrom'] ?? '',
          dateTo: deityState.state.filters['dateTo'] ?? '',
        },
      });
      setTab('item');
    },
    [itemState, deityState.state.filters, setTab],
  );

  const onExport = useCallback(
    async (which: 'items' | 'deities') => {
      setExportError(null);
      try {
        await downloadPerformanceCsv(
          which,
          which === 'items' ? itemState.state : deityState.state,
          localStorage.getItem('admin_token'),
        );
      } catch (err) {
        setExportError(err instanceof Error ? err.message : 'Export failed');
      }
    },
    [itemState.state, deityState.state],
  );

  const itemMeta = items.data as unknown as PerformanceMeta | undefined;
  const deityMeta = deities.data as unknown as PerformanceMeta | undefined;

  const itemColumns: DataTableColumn<StatusPerformanceItemRow>[] = [
    {
      id: 'thumb',
      header: '',
      cell: (r) => <CardThumb src={r.thumbnailUrl} title={r.title} />,
      className: 'w-14',
    },
    { id: 'title', header: 'Title', sortField: 'title', cell: (r) => r.title },
    {
      id: 'slug',
      header: 'Slug',
      sortField: 'slug',
      cell: (r) => <code className="text-xs">{r.slug}</code>,
    },
    {
      id: 'deity',
      header: 'Deity',
      sortField: 'deitySlug',
      cell: (r) => r.deityName ?? <Blank />,
    },
    { id: 'type', header: 'Type', sortField: 'mediaType', cell: (r) => r.mediaType },
    {
      id: 'active',
      header: 'Active',
      sortField: 'isActive',
      cell: (r) => (r.isActive ? 'Yes' : 'No'),
    },
    {
      id: 'createdAt',
      header: 'Created',
      sortField: 'createdAt',
      cell: (r) => day(r.createdAt),
    },
    { id: 'daysLive', header: 'Days live', sortField: 'daysLive', cell: (r) => int(r.daysLive) },
    {
      id: 'statusPin',
      header: 'Status pin',
      sortField: 'statusPinPosition',
      cell: (r) => int(r.statusPinPosition),
      headerClassName: 'whitespace-nowrap',
    },
    {
      id: 'homePin',
      header: 'Home pin',
      sortField: 'homepagePinPosition',
      cell: (r) => int(r.homepagePinPosition),
    },
    {
      id: 'avgPos',
      header: 'Avg. position',
      sortField: 'avgObservedPosition',
      cell: (r) => num(r.avgObservedPosition, 1),
    },
    {
      id: 'onHomeSince',
      header: 'On home since',
      sortField: 'onHomepageSince',
      cell: (r) => day(r.onHomepageSince),
    },
    { id: 'views', header: 'Views', sortField: 'views', cell: (r) => int(r.views) },
    { id: 'viewers', header: 'Viewers', sortField: 'viewers', cell: (r) => int(r.viewers) },
    {
      id: 'intents',
      header: 'Share intents',
      sortField: 'shareIntents',
      cell: (r) => int(r.shareIntents),
    },
    { id: 'shares', header: 'Shares', sortField: 'shares', cell: (r) => int(r.shares) },
    {
      id: 'shareRate',
      header: 'Share rate',
      sortField: 'shareRate',
      cell: (r) => pct(r.shareRate),
    },
    {
      id: 'completion',
      header: 'Completion',
      sortField: 'completion',
      cell: (r) => pct(r.completion),
    },
  ];

  const deityColumns: DataTableColumn<StatusPerformanceDeityRow>[] = [
    {
      id: 'deity',
      header: 'Deity',
      sortField: 'deityName',
      cell: (r) => (
        <button
          type="button"
          className="text-left font-medium underline-offset-2 hover:underline"
          onClick={() => drillDown(r.deitySlug)}
        >
          {r.deityName}
          {r.deitySlug === NO_DEITY && (
            <span className="ml-1 text-xs text-muted-foreground">(unmapped)</span>
          )}
        </button>
      ),
    },
    { id: 'total', header: 'Items', sortField: 'totalItems', cell: (r) => int(r.totalItems) },
    { id: 'active', header: 'Active', sortField: 'activeItems', cell: (r) => int(r.activeItems) },
    { id: 'inFeed', header: 'In feed', sortField: 'itemsInFeed', cell: (r) => int(r.itemsInFeed) },
    { id: 'views', header: 'Views', sortField: 'views', cell: (r) => int(r.views) },
    { id: 'viewers', header: 'Viewers', sortField: 'viewers', cell: (r) => int(r.viewers) },
    {
      id: 'intents',
      header: 'Share intents',
      sortField: 'shareIntents',
      cell: (r) => int(r.shareIntents),
    },
    { id: 'shares', header: 'Shares', sortField: 'shares', cell: (r) => int(r.shares) },
    {
      id: 'shareRate',
      header: 'Share rate',
      sortField: 'shareRate',
      cell: (r) => pct(r.shareRate),
    },
    {
      id: 'completion',
      header: 'Completion',
      sortField: 'completion',
      cell: (r) => pct(r.completion),
    },
    {
      id: 'viewsPerItem',
      header: 'Views / item',
      sortField: 'viewsPerItem',
      cell: (r) => num(r.viewsPerItem, 1),
    },
    {
      id: 'sharesPerItem',
      header: 'Shares / item',
      sortField: 'sharesPerItem',
      cell: (r) => num(r.sharesPerItem, 1),
    },
    {
      id: 'bestItem',
      header: 'Best item',
      cell: (r) =>
        r.bestItem ? (
          <button
            type="button"
            className="text-left underline-offset-2 hover:underline"
            onClick={() => drillDown(r.deitySlug)}
            title={`${(r.bestItem.shareRate * 100).toFixed(1)}% share rate over ${r.bestItem.views} views`}
          >
            {r.bestItem.title}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">not enough data</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Status performance</h1>
          <p className="text-sm text-muted-foreground">
            How status content is viewed and shared. Read-only; numbers come from the analytics
            warehouse and the date range applies to events only, never to the catalogue.
          </p>
        </div>
        <a
          href={COLUMN_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          What do these columns mean?
        </a>
      </div>

      {exportError && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          {exportError}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="item">By item</TabsTrigger>
          <TabsTrigger value="deity">By deity</TabsTrigger>
        </TabsList>

        <TabsContent value="item" className="space-y-3">
          <MetaBanners meta={itemMeta} />
          <DataTable
            columns={itemColumns}
            rows={items.data?.items}
            total={items.data?.total}
            getRowId={(r) => r.id}
            state={itemState.state}
            onStateChange={itemState.setState}
            isLoading={items.isLoading}
            isFetching={items.isFetching}
            isError={items.isError}
            error={items.error}
            onRetry={() => void items.refetch()}
            caption="Status items with view and share metrics for the selected date range."
            emptyMessage="No items match these filters. The minimum-views filter hides low-traffic items — clear it to see everything."
            filterFields={[
              { id: 'q', label: 'Search', type: 'text', placeholder: 'Title or slug' },
              { id: 'deitySlug', label: 'Deity', type: 'text', placeholder: 'e.g. hanuman' },
              {
                id: 'mediaType',
                label: 'Type',
                type: 'select',
                options: [
                  { label: 'Image', value: 'image' },
                  { label: 'Video', value: 'video' },
                ],
              },
              {
                id: 'isActive',
                label: 'Active',
                type: 'select',
                options: [
                  { label: 'Active', value: 'true' },
                  { label: 'Inactive', value: 'false' },
                ],
              },
              // A visible, clearable number rather than an invisible cutoff.
              { id: 'minViews', label: 'Min views', type: 'text', placeholder: '100' },
              ...DATE_FILTERS,
            ]}
            toolbar={
              <Button
                size="sm"
                variant="outline"
                disabled={!itemMeta?.warehouseAvailable}
                title={
                  itemMeta?.warehouseAvailable
                    ? 'Export every row matching these filters'
                    : 'Disabled while analytics are unavailable — the file would have no metrics'
                }
                onClick={() => void onExport('items')}
              >
                Export CSV
              </Button>
            }
          />
        </TabsContent>

        <TabsContent value="deity" className="space-y-3">
          <MetaBanners meta={deityMeta} />
          <p className="text-xs text-muted-foreground">
            Viewers here is the unique count across the whole deity&rsquo;s catalogue, so it is
            deliberately <strong>not</strong> the sum of the per-item viewers on the other tab —
            one devotee who viewed three of a deity&rsquo;s items is one viewer.
          </p>
          <DataTable
            columns={deityColumns}
            rows={deities.data?.items}
            total={deities.data?.total}
            getRowId={(r) => r.deitySlug}
            state={deityState.state}
            onStateChange={deityState.setState}
            isLoading={deities.isLoading}
            isFetching={deities.isFetching}
            isError={deities.isError}
            error={deities.error}
            onRetry={() => void deities.refetch()}
            caption="Status metrics rolled up per deity. Click a deity to see its items."
            emptyMessage="No deities match these filters."
            filterFields={[
              { id: 'q', label: 'Search', type: 'text', placeholder: 'Deity name or slug' },
              {
                id: 'mediaType',
                label: 'Type',
                type: 'select',
                options: [
                  { label: 'Image', value: 'image' },
                  { label: 'Video', value: 'video' },
                ],
              },
              ...DATE_FILTERS,
            ]}
            toolbar={
              <Button
                size="sm"
                variant="outline"
                disabled={!deityMeta?.warehouseAvailable}
                onClick={() => void onExport('deities')}
              >
                Export CSV
              </Button>
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
