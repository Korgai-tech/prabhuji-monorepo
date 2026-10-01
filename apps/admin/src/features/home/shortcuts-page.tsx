import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useDeactivateHomeShortcut,
  useHomeShortcuts,
  useUpdateHomeShortcut,
  type HomeShortcut,
} from './use-home-shortcuts';
import { ShortcutFormDialog, type ShortcutFormState } from './shortcut-form';
import { HomeDeactivateDialog } from './deactivate-dialog';

/**
 * Home shortcuts list (TAM-105 §(e)) — the TAM-89 `<DataTable>` composition.
 * Sort fields per TAM-104 (`key | label | sortOrder | isActive | createdAt | updatedAt`).
 */
export function ShortcutsPage() {
  const table = useDataTableState({ sort: 'sortOrder', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useHomeShortcuts(table.state);
  const deactivate = useDeactivateHomeShortcut();

  const [formState, setFormState] = React.useState<ShortcutFormState>(null);
  const [deactivating, setDeactivating] = React.useState<HomeShortcut | null>(null);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Home shortcuts</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The feature shortcut grid on the home screen. Icons are bundled client
          assets referenced by key — a new icon is an app release, not an upload.
        </p>
      </div>

      <DataTable<HomeShortcut>
        caption="All home shortcuts"
        columns={[
          {
            id: 'key',
            header: 'Key',
            sortField: 'key',
            cell: (s) => <code className="text-xs">{s.key}</code>,
          },
          {
            id: 'label',
            header: 'Label',
            sortField: 'label',
            cell: (s) => s.label,
          },
          {
            id: 'iconKey',
            header: 'Icon key',
            cell: (s) =>
              s.iconKey ? (
                <code className="text-xs">{s.iconKey}</code>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
          {
            id: 'destinationType',
            header: 'Destination',
            cell: (s) => <span className="text-xs">{s.destinationType}</span>,
          },
          {
            id: 'destinationValue',
            header: 'Value',
            cell: (s) =>
              s.destinationValue ? (
                <code className="text-xs">{s.destinationValue}</code>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
          {
            id: 'sortOrder',
            header: 'Sort order',
            sortField: 'sortOrder',
            cell: (s) => s.sortOrder,
          },
          {
            id: 'isActive',
            header: 'Status',
            sortField: 'isActive',
            cell: (s) => (
              <Badge variant={s.isActive ? 'default' : 'muted'}>
                {s.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
        ]}
        filterFields={[
          { id: 'q', label: 'Search', type: 'text', placeholder: 'Search key / label…' },
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
            New shortcut
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(s) => s.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No shortcuts match these filters."
        actions={(s) => (
          <ShortcutRowActions
            shortcut={s}
            onEdit={() => setFormState({ kind: 'edit', id: s.id })}
            onDeactivate={() => setDeactivating(s)}
          />
        )}
      />

      <ShortcutFormDialog state={formState} onClose={() => setFormState(null)} />
      <HomeDeactivateDialog
        entityLabel="shortcut"
        row={
          deactivating
            ? { id: deactivating.id, updatedAt: deactivating.updatedAt, label: deactivating.label }
            : null
        }
        onConfirm={deactivate.mutateAsync}
        onClose={() => setDeactivating(null)}
      />
    </div>
  );
}

function ShortcutRowActions({
  shortcut,
  onEdit,
  onDeactivate,
}: {
  shortcut: HomeShortcut;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const update = useUpdateHomeShortcut();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: shortcut.id,
        changes: { isActive: true },
        expectedUpdatedAt: shortcut.updatedAt,
      });
      notify.success('Shortcut reactivated');
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          () => undefined,
          'This shortcut changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(error, 'Could not reactivate this shortcut.');
      }
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      {shortcut.isActive ? (
        <Button variant="ghost" size="sm" onClick={onDeactivate}>
          <PowerOffIcon aria-hidden="true" />
          Deactivate
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={update.isPending}
          onClick={() => void reactivate()}
        >
          <PowerIcon aria-hidden="true" />
          Reactivate
        </Button>
      )}
    </div>
  );
}
