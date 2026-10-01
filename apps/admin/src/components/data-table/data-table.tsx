import * as React from 'react';
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, LayoutGridIcon, ListIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api-error';
import type { DataTableState, SortOrder } from './use-data-table-state';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  <DataTable> — THE list view. Its props are a CONTRACT with nine UI tickets.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Every admin list is a CONFIG of this component. 20+ hand-rolled tables — each
 * with its own subtly different pagination, empty and error behaviour — is the
 * failure mode this exists to prevent. Do not fork it; if it cannot express your
 * list, raise it rather than hand-rolling a table beside it.
 *
 * It is deliberately PRESENTATIONAL and transport-agnostic: it owns no query.
 * The caller owns the query state (`useDataTableState`) and the hook that turns
 * that state into a request, so `<DataTable>` never has to know your endpoint.
 *
 * OFFSET pagination, not keyset (ADR C2) — an editor needs "Page 7 of 23" and a
 * total, which keyset cannot render. This is a CONSIDERED divergence from the
 * mobile convention. Do not "fix" it to match mobile.
 *
 * NO TABLE LIBRARY. `patterns_library/ui/data-table.md` is explicit that this
 * repo has no TanStack Table and that one must not be added — this is a
 * semantic, Tailwind-styled `<table>`. If a requirement genuinely outgrows that,
 * it is a System Architect decision + a pattern update, not a silent `pnpm add`.
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 * ```tsx
 * const table = useDataTableState({ sort: 'createdAt', order: 'desc' });
 * const { data, isLoading, isError, error, refetch } = useDeities(table.state);
 *
 * <DataTable
 *   columns={[
 *     { id: 'name', header: 'Name', cell: (d) => d.name, sortField: 'name' },
 *     { id: 'slug', header: 'Slug', cell: (d) => <code>{d.slug}</code> },
 *   ]}
 *   rows={data?.items}
 *   total={data?.total}
 *   getRowId={(d) => d.id}
 *   state={table.state}
 *   onStateChange={table.setState}
 *   isLoading={isLoading}
 *   isError={isError}
 *   error={error}
 *   onRetry={refetch}
 *   filterFields={[{ id: 'q', label: 'Search', type: 'text' }]}
 *   actions={(d) => <Button size="sm" variant="ghost">Edit</Button>}
 * />
 * ```
 */
export interface DataTableColumn<TRow> {
  /** Stable identity for the column (React key). */
  id: string;
  header: string;
  cell: (row: TRow) => React.ReactNode;
  /**
   * The API sort field this column maps to. **OMIT to make the column
   * unsortable.** Only set it to a field on that entity's TAM-82 `sortQuery`
   * ALLOWLIST — the UI must never offer a sort the API will 400 on.
   */
  sortField?: string;
  className?: string;
  headerClassName?: string;
}

export interface DataTableFilterField {
  /** The query-param name this filter maps to (e.g. `q`, `isActive`). */
  id: string;
  label: string;
  type: 'text' | 'select';
  placeholder?: string;
  /** Required for `type: 'select'`. An empty-value option is added for you. */
  options?: { label: string; value: string }[];
}

export interface DataTableProps<TRow> {
  columns: DataTableColumn<TRow>[];
  /** One page of rows. `undefined` while loading. */
  rows: TRow[] | undefined;
  /** The server's total row count — ADR C2's `{items,total,page,pageSize}`. */
  total: number | undefined;
  getRowId: (row: TRow) => string;
  state: DataTableState;
  onStateChange: (next: DataTableState) => void;
  isLoading?: boolean;
  /** A background refetch — dims the table instead of replacing it. */
  isFetching?: boolean;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;
  filterFields?: DataTableFilterField[];
  /** Trailing actions cell (edit / deactivate / …). */
  actions?: (row: TRow) => React.ReactNode;
  emptyMessage?: string;
  /** Accessible description of the table. Strongly recommended. */
  caption?: string;
  pageSizeOptions?: number[];
  /** Rendered between the filter bar and the table (e.g. a "New" button). */
  toolbar?: React.ReactNode;
  /**
   * OPT-IN grid view. When provided, a Table/Grid toggle appears in the filter
   * bar and Grid mode renders this per row instead of the table — same query,
   * same filters, same pagination. Sorting is table-only (there are no headers
   * to click in Grid). Omit it and the list is exactly as it was.
   */
  renderCard?: (row: TRow) => React.ReactNode;
  className?: string;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const GRID_CLASS = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

export function DataTable<TRow>({
  columns,
  rows,
  total,
  getRowId,
  state,
  onStateChange,
  isLoading = false,
  isFetching = false,
  isError = false,
  error,
  onRetry,
  filterFields,
  actions,
  emptyMessage = 'Nothing here yet.',
  caption,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  toolbar,
  renderCard,
  className,
}: DataTableProps<TRow>) {
  // View mode is presentation only — it changes no query, so it stays local
  // state and out of `DataTableState`.
  const [view, setView] = React.useState<'table' | 'grid'>('table');
  const showGrid = renderCard !== undefined && view === 'grid';
  const columnCount = columns.length + (actions ? 1 : 0);
  const pageCount =
    total === undefined ? 1 : Math.max(1, Math.ceil(total / state.pageSize));
  const canPrev = state.page > 1;
  const canNext = state.page < pageCount;

  /** Any change to sort/filter/pageSize resets to page 1 — page 7 of the old
   *  result set is meaningless against a new one (and often out of range). */
  function toggleSort(sortField: string) {
    const isCurrent = state.sort === sortField;
    const nextOrder: SortOrder = isCurrent && state.order === 'asc' ? 'desc' : 'asc';
    onStateChange({ ...state, page: 1, sort: sortField, order: nextOrder });
  }

  function setFilter(id: string, value: string) {
    const filters = { ...state.filters };
    if (value === '') delete filters[id];
    else filters[id] = value;
    onStateChange({ ...state, page: 1, filters });
  }

  return (
    <div data-slot="data-table" className={cn('grid gap-4', className)}>
      {(filterFields?.length || toolbar || renderCard) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {filterFields?.map((field) => (
              <DataTableFilter
                key={field.id}
                field={field}
                value={state.filters[field.id] ?? ''}
                onChange={(value) => setFilter(field.id, value)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {renderCard && <ViewToggle view={view} onChange={setView} />}
            {toolbar}
          </div>
        </div>
      )}

      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load this list</AlertTitle>
          <AlertDescription>
            <p>{errorMessage(error, 'Something went wrong.')}</p>
            {onRetry && (
              <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
                Try again
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : showGrid ? (
        <div className={cn('transition-opacity', isFetching && !isLoading && 'opacity-60')}>
          {isLoading ? (
            <div className={GRID_CLASS}>
              {Array.from({ length: Math.min(state.pageSize, 10) }).map((_, index) => (
                <Skeleton key={index} className="aspect-[3/4] w-full rounded-md" />
              ))}
            </div>
          ) : !rows?.length ? (
            <div className="rounded-md border py-16 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <ul aria-label={caption} className={GRID_CLASS}>
              {rows.map((row) => (
                <li key={getRowId(row)}>{renderCard?.(row)}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'rounded-md border transition-opacity',
            isFetching && !isLoading && 'opacity-60',
          )}
        >
          <Table>
            {caption && <caption className="sr-only">{caption}</caption>}
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <DataTableHeadCell
                    key={column.id}
                    column={column}
                    state={state}
                    onToggleSort={toggleSort}
                  />
                ))}
                {actions && (
                  <TableHead scope="col" className="w-0 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <DataTableSkeletonRows
                  rowCount={Math.min(state.pageSize, 5)}
                  columnCount={columnCount}
                />
              ) : !rows?.length ? (
                <TableRow>
                  <TableCell
                    colSpan={columnCount}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={getRowId(row)}>
                    {columns.map((column) => (
                      <TableCell key={column.id} className={column.className}>
                        {column.cell(row)}
                      </TableCell>
                    ))}
                    {actions && (
                      <TableCell className="text-right whitespace-nowrap">
                        {actions(row)}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {!isError && (
        <DataTablePagination
          state={state}
          onStateChange={onStateChange}
          total={total}
          pageCount={pageCount}
          canPrev={canPrev}
          canNext={canNext}
          pageSizeOptions={pageSizeOptions}
        />
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: 'table' | 'grid';
  onChange: (next: 'table' | 'grid') => void;
}) {
  return (
    <div role="group" aria-label="View" className="flex gap-0.5 rounded-md border p-0.5">
      {(
        [
          ['table', 'Table', ListIcon],
          ['grid', 'Grid', LayoutGridIcon],
        ] as const
      ).map(([value, label, Icon]) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={view === value ? 'secondary' : 'ghost'}
          aria-pressed={view === value}
          onClick={() => onChange(value)}
        >
          <Icon aria-hidden="true" />
          {label}
        </Button>
      ))}
    </div>
  );
}

function DataTableHeadCell<TRow>({
  column,
  state,
  onToggleSort,
}: {
  column: DataTableColumn<TRow>;
  state: DataTableState;
  onToggleSort: (sortField: string) => void;
}) {
  const isSorted = column.sortField !== undefined && state.sort === column.sortField;
  const ariaSort = isSorted
    ? state.order === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';

  // Unsortable column: a plain header. No button, nothing focusable.
  if (!column.sortField) {
    return (
      <TableHead scope="col" className={column.headerClassName}>
        {column.header}
      </TableHead>
    );
  }

  const SortIcon = !isSorted
    ? ArrowUpDownIcon
    : state.order === 'asc'
      ? ArrowUpIcon
      : ArrowDownIcon;

  return (
    <TableHead scope="col" aria-sort={ariaSort} className={column.headerClassName}>
      <button
        type="button"
        onClick={() => onToggleSort(column.sortField as string)}
        className={cn(
          '-mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors',
          'hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
          isSorted && 'text-foreground',
        )}
      >
        {column.header}
        <SortIcon aria-hidden="true" className="size-3.5 opacity-70" />
        <span className="sr-only">
          {isSorted
            ? `sorted ${state.order === 'asc' ? 'ascending' : 'descending'}, activate to reverse`
            : 'not sorted, activate to sort ascending'}
        </span>
      </button>
    </TableHead>
  );
}

function DataTableSkeletonRows({
  rowCount,
  columnCount,
}: {
  rowCount: number;
  columnCount: number;
}) {
  return (
    <>
      {Array.from({ length: Math.max(1, rowCount) }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: columnCount }).map((__, cellIndex) => (
            <TableCell key={cellIndex}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function DataTableFilter({
  field,
  value,
  onChange,
}: {
  field: DataTableFilterField;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `data-table-filter-${field.id}`;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {field.label}
      </label>
      {field.type === 'select' ? (
        <Select
          id={id}
          className="w-48"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">All</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          id={id}
          type="search"
          className="w-56"
          placeholder={field.placeholder ?? 'Search…'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

function DataTablePagination({
  state,
  onStateChange,
  total,
  pageCount,
  canPrev,
  canNext,
  pageSizeOptions,
}: {
  state: DataTableState;
  onStateChange: (next: DataTableState) => void;
  total: number | undefined;
  pageCount: number;
  canPrev: boolean;
  canNext: boolean;
  pageSizeOptions: number[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <label
          htmlFor="data-table-page-size"
          className="text-xs font-medium text-muted-foreground"
        >
          Rows per page
        </label>
        <Select
          id="data-table-page-size"
          className="h-8 w-20"
          value={String(state.pageSize)}
          onChange={(event) =>
            onStateChange({ ...state, page: 1, pageSize: Number(event.target.value) })
          }
        >
          {pageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-3">
        {/* The reason admin uses offset pagination: this sentence (ADR C2). */}
        <p aria-live="polite" className="text-sm text-muted-foreground">
          Page {state.page} of {pageCount}
          {total !== undefined && ` · ${total} ${total === 1 ? 'row' : 'rows'}`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canPrev}
            onClick={() => onStateChange({ ...state, page: state.page - 1 })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canNext}
            onClick={() => onStateChange({ ...state, page: state.page + 1 })}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
