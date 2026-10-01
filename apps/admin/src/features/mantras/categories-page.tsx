import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useMantraCategories,
  useUpdateMantraCategory,
  useDeactivateMantraCategory,
  type MantraCategory,
} from './use-mantra-categories';
import {
  MantraCategoryFormDialog,
  type MantraCategoryFormState,
} from './category-form';
import { DeactivateDialog } from './deactivate-dialog';
import { Thumbnail } from './thumbnail';

/**
 * Mantra categories list — a `<DataTable>` composition mirroring the taxonomy
 * EXEMPLAR (TAM-89). Sort is offered ONLY on TAM-92's allowlist
 * (`slug | sortOrder | isActive | createdAt | updatedAt`).
 */
export function MantraCategoriesPage() {
  const table = useDataTableState({ sort: 'sortOrder', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useMantraCategories(
    table.state,
  );
  const deactivate = useDeactivateMantraCategory();

  const [formState, setFormState] = React.useState<MantraCategoryFormState>(null);
  const [deactivating, setDeactivating] = React.useState<MantraCategory | null>(null);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Mantra categories</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Groupings for mantras &amp; stutis. Deactivating a category hides it
          from the app without deleting anything.
        </p>
      </div>

      <DataTable<MantraCategory>
        caption="All mantra categories"
        columns={[
          {
            id: 'image',
            header: 'Image',
            headerClassName: 'w-0',
            cell: (row) => <Thumbnail src={row.imageUrl} />,
          },
          {
            id: 'slug',
            header: 'Slug',
            sortField: 'slug',
            cell: (row) => <code className="text-xs">{row.slug}</code>,
          },
          {
            id: 'displayName',
            header: 'Name',
            cell: (row) => row.displayName,
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
          { id: 'q', label: 'Search', type: 'text', placeholder: 'Search slug…' },
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
            New category
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
        emptyMessage="No categories match these filters."
        actions={(row) => (
          <CategoryRowActions
            category={row}
            onEdit={() => setFormState({ kind: 'edit', id: row.id })}
            onDeactivate={() => setDeactivating(row)}
          />
        )}
      />

      <MantraCategoryFormDialog state={formState} onClose={() => setFormState(null)} />
      <DeactivateDialog
        open={deactivating !== null}
        label={deactivating?.slug ?? ''}
        body={
          <>
            <p>The category is hidden from the app. It is not deleted.</p>
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
function CategoryRowActions({
  category,
  onEdit,
  onDeactivate,
}: {
  category: MantraCategory;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const update = useUpdateMantraCategory();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: category.id,
        changes: { isActive: true },
        expectedUpdatedAt: category.updatedAt,
      });
      notify.success(`${category.slug} reactivated`);
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          () => undefined,
          'This category changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(error, 'Could not reactivate this category.');
      }
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      {category.isActive ? (
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
