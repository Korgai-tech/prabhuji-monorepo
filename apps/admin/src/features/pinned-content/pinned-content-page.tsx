import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ClipboardListIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { errorMessage, ApiError } from '@/lib/api-error';
import { isConflictError, notify } from '@/lib/toast';
import { useDeityOptions } from '@/features/status/use-deity-options';

import {
  DEFAULT_LIST_STATE,
  usePinnedContentList,
  useRestorePin,
  useSoftDeletePin,
  type PinnedContentListState,
  type PinnedContentRow,
} from './use-pinned-content';
import {
  PIN_STATUS_FILTERS,
  SURFACE_OPTIONS,
  classifyStatus,
  formatIst,
  surfaceLabel,
  type PinRuntimeStatus,
  type PinStatusFilter,
  type PinSurface,
} from './pinned-content-schema';
import {
  PinnedContentFormDialog,
  type PinnedContentFormState,
} from './pinned-content-form';
import { AuditDrawer } from './audit-drawer';
import { lookupKey, useContentLookup, type ContentOption } from './use-content-picker';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Pinned content — the list page (TAM-173, admin UI section).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Data-table shape identical to `feed-items-page.tsx` and `status/items-page.tsx`:
 * filter bar → New button → paginated table → row actions.
 *
 * DEVIATION FROM THE SHARED `<DataTable>`: this page hand-rolls the table
 * because its filter+pagination state has to survive the URL (per TAM-173
 * spec — "All filters URL-persisted"). `useDataTableState()` snapshots its
 * initial state and never re-reads it, so back-navigating with different
 * search params would not re-hydrate. A small `useSearchParams`-driven
 * controller is smaller than either extending the shared hook or duplicating
 * the URL-sync into every filter.
 *
 * The columns still mirror the precedent pages one-for-one:
 * Surface · Deity · Content · Position · Start (IST) · End (IST) · Status ·
 * Created by · Actions. Sort defaults to `pin_position ASC` (the server order
 * — no client sort is offered).
 */
export function PinnedContentPage() {
  const [state, setState] = useUrlListState();
  const query = usePinnedContentList(state);
  const { data: deities } = useDeityOptions();

  const [formState, setFormState] = React.useState<PinnedContentFormState>(null);
  const [auditPinId, setAuditPinId] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<PinnedContentRow | null>(null);

  const rows = query.data?.items ?? [];

  // Content lookup — the Content column displays title + thumbnail, which the
  // pin row itself does not carry. Resolved BY ID, one cached query per distinct
  // `(surface, contentId)` on this page (TAM-175). This used to index into two
  // unconditional `pageSize=100` catalogue fetches, which missed for every pin
  // whose content sat outside those 100 arbitrary rows — the column then
  // rendered a bare UUID.
  const contentLookup = useContentLookup(rows);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Pinned content</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Editorial pins that sit above the twice-daily rotation on the home
          and status feeds. Pins are a pure overlay — creating one goes live on
          the very next feed request, and expiry drops the pin without any
          admin action.
        </p>
      </div>

      <FilterBar
        state={state}
        onStateChange={setState}
        deities={(deities ?? []).map((d) => ({ label: d.slug, value: d.slug }))}
        onNew={() => setFormState({ kind: 'create' })}
      />

      {query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load pinned content</AlertTitle>
          <AlertDescription>
            <p>{errorMessage(query.error, 'Please try again.')}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <PinsTable
          rows={rows}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          contentLookup={contentLookup}
          onEdit={(row) => setFormState({ kind: 'edit', id: row.id })}
          onDelete={(row) => setPendingDelete(row)}
          onAudit={(row) => setAuditPinId(row.id)}
        />
      )}

      <PagingBar
        state={state}
        onStateChange={setState}
        total={query.data?.total}
      />

      <PinnedContentFormDialog
        state={formState}
        onClose={() => setFormState(null)}
      />
      <AuditDrawer
        pinId={auditPinId}
        onClose={() => setAuditPinId(null)}
      />
      <DeleteConfirmDialog
        row={pendingDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

// Row-level restore action, hoisted here so it stays close to the list
// context that shows/hides the button.
function RestoreButton({ row, onRestored }: { row: PinnedContentRow; onRestored: () => void }) {
  const restore = useRestorePin();

  async function onClick() {
    try {
      await restore.mutateAsync({ id: row.id, expectedUpdatedAt: row.updatedAt });
      notify.success('Pin restored');
      onRestored();
    } catch (err) {
      if (isConflictError(err)) {
        notify.conflict(
          () => undefined,
          'This pin changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(err, 'Could not restore this pin.');
      }
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={restore.isPending}
      onClick={() => void onClick()}
    >
      <RotateCcwIcon aria-hidden="true" />
      Restore
    </Button>
  );
}

// ── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({
  state,
  onStateChange,
  deities,
  onNew,
}: {
  state: PinnedContentListState;
  onStateChange: (next: PinnedContentListState) => void;
  deities: { label: string; value: string }[];
  onNew: () => void;
}) {
  function setSurface(next: PinSurface | '') {
    onStateChange({
      ...state,
      page: 1,
      surface: next,
      // Deity is only meaningful for status_deity; clear it otherwise.
      deitySlug: next === 'status_deity' ? state.deitySlug : '',
    });
  }

  function setDeity(next: string) {
    onStateChange({ ...state, page: 1, deitySlug: next });
  }

  function setActive(next: PinStatusFilter) {
    onStateChange({ ...state, page: 1, active: next });
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <label htmlFor="filter-surface" className="text-xs font-medium text-muted-foreground">
            Surface
          </label>
          <Select
            id="filter-surface"
            className="w-48"
            value={state.surface}
            onChange={(e) => setSurface(e.target.value as PinSurface | '')}
          >
            <option value="">All surfaces</option>
            {SURFACE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        {state.surface === 'status_deity' && (
          <div className="grid gap-1.5">
            <label htmlFor="filter-deity" className="text-xs font-medium text-muted-foreground">
              Deity
            </label>
            <Select
              id="filter-deity"
              className="w-48"
              value={state.deitySlug}
              onChange={(e) => setDeity(e.target.value)}
            >
              <option value="">All deities</option>
              {deities.map((deity) => (
                <option key={deity.value} value={deity.value}>
                  {deity.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="grid gap-1.5">
          <label htmlFor="filter-active" className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <Select
            id="filter-active"
            className="w-48"
            value={state.active}
            onChange={(e) => setActive(e.target.value as PinStatusFilter)}
          >
            {PIN_STATUS_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {filter === 'any' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Button size="sm" onClick={onNew}>
        <PlusIcon aria-hidden="true" />
        New pin
      </Button>
    </div>
  );
}

// ── The table ────────────────────────────────────────────────────────────────

function PinsTable({
  rows,
  isLoading,
  isFetching,
  contentLookup,
  onEdit,
  onDelete,
  onAudit,
}: {
  rows: PinnedContentRow[];
  isLoading: boolean;
  isFetching: boolean;
  contentLookup: Map<string, ContentOption>;
  onEdit: (row: PinnedContentRow) => void;
  onDelete: (row: PinnedContentRow) => void;
  onAudit: (row: PinnedContentRow) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border py-16 text-center text-sm text-muted-foreground">
        No pins match these filters.
      </div>
    );
  }

  return (
    <div
      className={`rounded-md border transition-opacity ${
        isFetching && !isLoading ? 'opacity-60' : ''
      }`}
    >
      <Table>
        <caption className="sr-only">All pinned content</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Surface</TableHead>
            <TableHead scope="col">Deity</TableHead>
            <TableHead scope="col">Content</TableHead>
            <TableHead scope="col">Position</TableHead>
            <TableHead scope="col">Start (IST)</TableHead>
            <TableHead scope="col">End (IST)</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col">Created by</TableHead>
            <TableHead scope="col" className="w-0 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <PinRow
              key={row.id}
              row={row}
              contentLookup={contentLookup}
              onEdit={onEdit}
              onDelete={onDelete}
              onAudit={onAudit}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PinRow({
  row,
  contentLookup,
  onEdit,
  onDelete,
  onAudit,
}: {
  row: PinnedContentRow;
  contentLookup: Map<string, ContentOption>;
  onEdit: (row: PinnedContentRow) => void;
  onDelete: (row: PinnedContentRow) => void;
  onAudit: (row: PinnedContentRow) => void;
}) {
  const status = classifyStatus(row);
  const content = contentLookup.get(lookupKey(row.surface, row.contentId));
  const isDeleted = status === 'deleted';

  return (
    <TableRow data-status={status} data-deleted={isDeleted || undefined}>
      <TableCell>
        <Badge variant="secondary">{surfaceLabel(row.surface)}</Badge>
      </TableCell>
      <TableCell>
        {row.deitySlug ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <ContentThumb url={content?.thumbnailUrl ?? null} />
          <div className="grid gap-0.5">
            {content ? (
              <>
                <span className="text-sm font-medium">{content.title}</span>
                <code className="text-xs text-muted-foreground">{content.slug}</code>
              </>
            ) : (
              <code className="text-xs">{row.contentId}</code>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>{row.pinPosition}</TableCell>
      <TableCell>
        <time dateTime={row.startAt} className="text-xs">
          {formatIst(row.startAt)}
        </time>
      </TableCell>
      <TableCell>
        <time dateTime={row.endAt} className="text-xs">
          {formatIst(row.endAt)}
        </time>
      </TableCell>
      <TableCell>
        <StatusBadge status={status} />
      </TableCell>
      <TableCell>
        <code className="text-xs">{row.createdBy}</code>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <div className="flex justify-end gap-1">
          {isDeleted ? (
            <RestoreButton row={row} onRestored={() => undefined} />
          ) : (
            <Button variant="ghost" size="sm" onClick={() => onEdit(row)}>
              <PencilIcon aria-hidden="true" />
              Edit
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onAudit(row)}>
            <ClipboardListIcon aria-hidden="true" />
            Audit
          </Button>
          {!isDeleted && (
            <Button variant="ghost" size="sm" onClick={() => onDelete(row)}>
              <Trash2Icon aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: PinRuntimeStatus }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  const variant =
    status === 'active'
      ? 'default'
      : status === 'scheduled'
        ? 'secondary'
        : status === 'expired'
          ? 'muted'
          : 'destructive';
  return <Badge variant={variant}>{label}</Badge>;
}

function ContentThumb({ url }: { url: string | null }) {
  const [broken, setBroken] = React.useState(false);
  if (url === null || url === '' || broken) {
    return (
      <div
        aria-hidden="true"
        className="size-10 shrink-0 rounded-md border bg-muted"
        title="No thumbnail"
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="size-10 shrink-0 rounded-md border object-cover"
      onError={() => setBroken(true)}
    />
  );
}

// ── Pagination bar ───────────────────────────────────────────────────────────

function PagingBar({
  state,
  onStateChange,
  total,
}: {
  state: PinnedContentListState;
  onStateChange: (next: PinnedContentListState) => void;
  total: number | undefined;
}) {
  const pageCount = total === undefined ? 1 : Math.max(1, Math.ceil(total / state.pageSize));
  const canPrev = state.page > 1;
  const canNext = state.page < pageCount;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="pin-page-size" className="text-xs font-medium text-muted-foreground">
          Rows per page
        </label>
        <Select
          id="pin-page-size"
          className="h-8 w-20"
          value={String(state.pageSize)}
          onChange={(event) =>
            onStateChange({ ...state, page: 1, pageSize: Number(event.target.value) })
          }
        >
          {[10, 25, 50, 100].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-3">
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

// ── Delete confirm dialog ────────────────────────────────────────────────────

function DeleteConfirmDialog({
  row,
  onClose,
}: {
  row: PinnedContentRow | null;
  onClose: () => void;
}) {
  const remove = useSoftDeletePin();

  async function confirm() {
    if (!row) return;
    try {
      await remove.mutateAsync({ id: row.id, expectedUpdatedAt: row.updatedAt });
      notify.success('Pin deleted');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        notify.conflict(
          () => undefined,
          'This pin changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(err, 'Could not delete this pin.');
      }
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this pin?</DialogTitle>
          <DialogDescription>
            The pin is soft-deleted — the row survives with a `deleted_at`
            timestamp and can be restored. The item returns to its natural
            rotation slot on the next feed request.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={remove.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => void confirm()}
          >
            {remove.isPending ? 'Deleting…' : 'Delete pin'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── URL-persisted state controller ───────────────────────────────────────────

/**
 * Filters, page and page-size persisted into `?...` on the URL so:
 *  1. a deep-link ("Pinned content, Home surface, page 3") is shareable;
 *  2. browser back/forward restores the exact list an editor left;
 *  3. a page reload is not a filter reset.
 */
function useUrlListState(): [
  PinnedContentListState,
  (next: PinnedContentListState) => void,
] {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = readState(searchParams);

  const setState = React.useCallback(
    (next: PinnedContentListState) => {
      setSearchParams(writeState(next), { replace: true });
    },
    [setSearchParams],
  );

  return [state, setState];
}

function readState(params: URLSearchParams): PinnedContentListState {
  const page = clampInt(params.get('page'), 1, DEFAULT_LIST_STATE.page);
  const pageSize = clampInt(params.get('pageSize'), 1, DEFAULT_LIST_STATE.pageSize);
  const surface = params.get('surface');
  const deitySlug = params.get('deitySlug') ?? '';
  const active = params.get('active');

  return {
    page,
    pageSize,
    surface: isSurface(surface) ? surface : '',
    deitySlug,
    active: isStatusFilter(active) ? active : 'any',
  };
}

function writeState(next: PinnedContentListState): URLSearchParams {
  const params = new URLSearchParams();
  if (next.page !== 1) params.set('page', String(next.page));
  if (next.pageSize !== DEFAULT_LIST_STATE.pageSize) {
    params.set('pageSize', String(next.pageSize));
  }
  if (next.surface !== '') params.set('surface', next.surface);
  if (next.deitySlug !== '') params.set('deitySlug', next.deitySlug);
  if (next.active !== 'any') params.set('active', next.active);
  return params;
}

function clampInt(value: string | null, min: number, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < min) return fallback;
  return parsed;
}

function isSurface(value: string | null): value is PinSurface {
  return (
    value === 'home' ||
    value === 'status_all_gods' ||
    value === 'status_deity'
  );
}

function isStatusFilter(value: string | null): value is PinStatusFilter {
  return (
    value === 'any' ||
    value === 'active' ||
    value === 'scheduled' ||
    value === 'expired'
  );
}
