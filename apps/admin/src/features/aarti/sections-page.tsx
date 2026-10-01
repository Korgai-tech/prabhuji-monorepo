import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useAartiSections,
  useDeactivateSection,
  useUpdateSection,
  type SectionListItem,
} from './use-aarti';
import { sectionTypeLabel } from './aarti-schema';
import { SectionFormDialog, type SectionFormState } from './section-form';
import { DeactivateDialog } from './deactivate-dialog';

/**
 * Aarti homepage sections list — a `<DataTable>` composition (TAM-89 exemplar).
 * Sort fields are only TAM-90's section allowlist (`sectionType | sortOrder |
 * isActive | createdAt | updatedAt`).
 */
export function SectionsPage() {
  const table = useDataTableState({ sort: 'sortOrder', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useAartiSections(table.state);

  const [formState, setFormState] = React.useState<SectionFormState>(null);
  const [deactivating, setDeactivating] = React.useState<SectionListItem | null>(null);
  const deactivate = useDeactivateSection();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Aarti homepage sections</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The dynamic rows on the Aarti module’s homepage. Each section type is
          resolved by the app; deactivating a section hides its row.
        </p>
      </div>

      <DataTable<SectionListItem>
        caption="All aarti homepage sections"
        columns={[
          {
            id: 'sectionType',
            header: 'Type',
            sortField: 'sectionType',
            cell: (section) => sectionTypeLabel(section.sectionType),
          },
          { id: 'title', header: 'Title', cell: (section) => section.title },
          {
            id: 'sortOrder',
            header: 'Sort order',
            sortField: 'sortOrder',
            cell: (section) => section.sortOrder,
          },
          {
            id: 'isActive',
            header: 'Status',
            sortField: 'isActive',
            cell: (section) => (
              <Badge variant={section.isActive ? 'default' : 'muted'}>
                {section.isActive ? 'Active' : 'Inactive'}
              </Badge>
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
        getRowId={(section) => section.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No sections match these filters."
        actions={(section) => (
          <SectionRowActions
            section={section}
            onEdit={() => setFormState({ kind: 'edit', id: section.id })}
            onDeactivate={() => setDeactivating(section)}
          />
        )}
      />

      <SectionFormDialog state={formState} onClose={() => setFormState(null)} />
      <DeactivateDialog
        open={deactivating !== null}
        title={`Deactivate “${deactivating?.title}”?`}
        label={deactivating?.title ?? ''}
        onConfirm={() =>
          deactivate.mutateAsync({
            id: deactivating!.id,
            expectedUpdatedAt: deactivating!.updatedAt,
          })
        }
        onClose={() => setDeactivating(null)}
      >
        <p>
          This row is hidden from the Aarti homepage. It is not deleted and can be
          reactivated at any time.
        </p>
      </DeactivateDialog>
    </div>
  );
}

function SectionRowActions({
  section,
  onEdit,
  onDeactivate,
}: {
  section: SectionListItem;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const update = useUpdateSection();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: section.id,
        changes: { isActive: true },
        expectedUpdatedAt: section.updatedAt,
      });
      notify.success(`${section.title} reactivated`);
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
