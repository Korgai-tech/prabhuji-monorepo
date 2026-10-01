import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useWallpaperRows,
  useUpdateWallpaperRow,
  useDeactivateWallpaperRow,
  type WallpaperRowListItem,
} from './use-wallpaper-rows';
import { ROW_TYPE_OPTIONS } from './row-schema';
import { RowFormDialog, type RowFormState } from './row-form';
import { DeactivateDialog, type DeactivateTarget } from './deactivate-dialog';

/**
 * The homepage-rows list (TAM-97 §(e)). Columns: title, `rowType` badge,
 * `iconKey`, `displayOrder`, `isActive`, `updatedAt`. Sort per TAM-96's
 * allowlist (`title | rowType | displayOrder | isActive | createdAt |
 * updatedAt`); filters: `q`, `rowType`, `isActive`.
 */
export function WallpaperRowsPage() {
  const table = useDataTableState({ sort: 'displayOrder', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useWallpaperRows(table.state);

  const [formState, setFormState] = React.useState<RowFormState>(null);
  const [deactivating, setDeactivating] = React.useState<DeactivateTarget | null>(null);
  const deactivate = useDeactivateWallpaperRow();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Wallpaper homepage rows</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The curated rows on the Wallpaper home screen (Top Live, New, Trending,
          Liked and hand-curated Custom rows). Only Custom rows accept hand-picked
          items; the rest resolve automatically from their filters.
        </p>
      </div>

      <DataTable<WallpaperRowListItem>
        caption="All homepage rows"
        columns={[
          { id: 'title', header: 'Title', sortField: 'title', cell: (r) => r.title },
          {
            id: 'rowType',
            header: 'Type',
            sortField: 'rowType',
            cell: (r) => <Badge variant="secondary">{rowTypeLabel(r.rowType)}</Badge>,
          },
          {
            id: 'iconKey',
            header: 'Icon',
            cell: (r) =>
              r.iconKey ? (
                <code className="text-xs">{r.iconKey}</code>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          },
          {
            id: 'displayOrder',
            header: 'Order',
            sortField: 'displayOrder',
            cell: (r) => r.displayOrder,
          },
          {
            id: 'isActive',
            header: 'Status',
            sortField: 'isActive',
            cell: (r) => (
              <Badge variant={r.isActive ? 'default' : 'muted'}>
                {r.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
          {
            id: 'updatedAt',
            header: 'Updated',
            sortField: 'updatedAt',
            cell: (r) => (
              <time dateTime={r.updatedAt} className="text-xs text-muted-foreground">
                {new Date(r.updatedAt).toLocaleDateString()}
              </time>
            ),
          },
        ]}
        filterFields={[
          { id: 'q', label: 'Search', type: 'text', placeholder: 'Search title/key…' },
          { id: 'rowType', label: 'Type', type: 'select', options: ROW_TYPE_OPTIONS },
          {
            id: 'isActive',
            label: 'Status',
            type: 'select',
            options: [
              { label: 'Active', value: 'true' },
              { label: 'Inactive', value: 'false' },
            ],
          },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New row
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(r) => r.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No homepage rows match these filters."
        actions={(r) => (
          <RowActions
            row={r}
            onEdit={() => setFormState({ kind: 'edit', id: r.id })}
            onDeactivate={() =>
              setDeactivating({ id: r.id, label: r.title, updatedAt: r.updatedAt })
            }
          />
        )}
      />

      <RowFormDialog state={formState} onClose={() => setFormState(null)} />
      <DeactivateDialog
        target={deactivating}
        title={`Deactivate “${deactivating?.label ?? ''}”?`}
        successLabel="deactivated"
        conflictMessage="This row changed since you opened this list — reload and try again."
        deactivate={(args) => deactivate.mutateAsync(args)}
        onClose={() => setDeactivating(null)}
        description={
          <>
            <p>
              The row is hidden from the app’s Wallpaper home. It is not deleted.
            </p>
            <p>
              Its curated items are untouched — reactivate the row to bring it and
              its items back.
            </p>
          </>
        }
      />
    </div>
  );
}

function rowTypeLabel(rowType: string): string {
  return ROW_TYPE_OPTIONS.find((o) => o.value === rowType)?.label ?? rowType;
}

function RowActions({
  row,
  onEdit,
  onDeactivate,
}: {
  row: WallpaperRowListItem;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const update = useUpdateWallpaperRow();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: row.id,
        changes: { isActive: true },
        expectedUpdatedAt: row.updatedAt,
      });
      notify.success(`${row.title} reactivated`);
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          () => undefined,
          'This row changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(error, 'Could not reactivate this row.');
      }
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      {row.isActive ? (
        <Button variant="ghost" size="sm" onClick={onDeactivate}>
          <PowerOffIcon aria-hidden="true" />
          Deactivate
        </Button>
      ) : (
        <Button variant="ghost" size="sm" disabled={update.isPending} onClick={() => void reactivate()}>
          <PowerIcon aria-hidden="true" />
          Reactivate
        </Button>
      )}
    </div>
  );
}
