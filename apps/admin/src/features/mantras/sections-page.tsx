import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useMantraSections,
  useUpdateMantraSection,
  useDeactivateMantraSection,
  type MantraSection,
} from './use-mantra-sections';
import { MantraSectionFormDialog, type MantraSectionFormState } from './section-form';
import { DeactivateDialog } from './deactivate-dialog';

/**
 * Mantra homepage sections list — a `<DataTable>` mirroring the taxonomy
 * EXEMPLAR. Sort is offered ONLY on TAM-92's allowlist (`sectionType |
 * sortOrder | isActive | createdAt | updatedAt`).
 */
export function MantraSectionsPage() {
  const table = useDataTableState({ sort: 'sortOrder', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useMantraSections(table.state);
  const deactivate = useDeactivateMantraSection();

  const [formState, setFormState] = React.useState<MantraSectionFormState>(null);
  const [deactivating, setDeactivating] = React.useState<MantraSection | null>(null);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Mantra homepage sections</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The rows that make up the Mantras home screen. Each section type is
          unique. Deactivating a section hides it without deleting anything.
        </p>
      </div>

      <DataTable<MantraSection>
        caption="All mantra homepage sections"
        columns={[
          {
            id: 'sectionType',
            header: 'Section type',
            sortField: 'sectionType',
            cell: (row) => <code className="text-xs">{row.sectionType}</code>,
          },
          { id: 'title', header: 'Title', cell: (row) => row.title },
          {
            id: 'layoutType',
            header: 'Layout',
            cell: (row) => <Badge variant="muted">{row.layoutType}</Badge>,
          },
          {
            id: 'showAllEnabled',
            header: 'Show all',
            cell: (row) =>
              row.showAllEnabled ? (
                <Badge>On</Badge>
              ) : (
                <span className="text-muted-foreground">Off</span>
              ),
          },
          {
            id: 'sortOrder',
            header: 'Sort order',
            sortField: 'sortOrder',
            cell: (row) => row.sortOrder,
          },
          {
            id: 'isActive',
            header: 'Status',
            sortField: 'isActive',
            cell: (row) => (
              <Badge variant={row.isActive ? 'default' : 'muted'}>
                {row.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
          {
            id: 'updatedAt',
            header: 'Updated',
            sortField: 'updatedAt',
            cell: (row) => (
              <time dateTime={row.updatedAt} className="text-xs text-muted-foreground">
                {new Date(row.updatedAt).toLocaleDateString()}
              </time>
            ),
          },
        ]}
        filterFields={[
          { id: 'q', label: 'Search', type: 'text', placeholder: 'Search title…' },
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
            New section
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(row) => row.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No sections match these filters."
        actions={(row) => (
          <SectionRowActions
            section={row}
            onEdit={() => setFormState({ kind: 'edit', id: row.id })}
            onDeactivate={() => setDeactivating(row)}
          />
        )}
      />

      <MantraSectionFormDialog state={formState} onClose={() => setFormState(null)} />
      <DeactivateDialog
        open={deactivating !== null}
        label={deactivating?.sectionType ?? ''}
        body={
          <>
            <p>The section is hidden from the app’s home screen. It is not deleted.</p>
            <p>You can reactivate it at any time from its row.</p>
          </>
        }
        onConfirm={() =>
          deactivating
            ? deactivate.mutateAsync({
                id: deactivating.id,
                expectedUpdatedAt: deactivating.updatedAt,
              })
            : Promise.resolve()
        }
        onClose={() => setDeactivating(null)}
      />
    </div>
  );
}

/** Edit + (Deactivate | Reactivate). Reactivate is a `PATCH { isActive: true }`. */
function SectionRowActions({
  section,
  onEdit,
  onDeactivate,
}: {
  section: MantraSection;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const update = useUpdateMantraSection();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: section.id,
        changes: { isActive: true },
        expectedUpdatedAt: section.updatedAt,
      });
      notify.success(`${section.sectionType} reactivated`);
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          () => undefined,
          'This section changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(error, 'Could not reactivate this section.');
      }
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      {section.isActive ? (
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
