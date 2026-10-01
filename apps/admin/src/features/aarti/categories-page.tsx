import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useAartiCategories,
  useDeactivateCategory,
  useUpdateCategory,
  type CategoryListItem,
} from './use-aarti';
import { CategoryFormDialog, type CategoryFormState } from './category-form';
import { DeactivateDialog } from './deactivate-dialog';

/**
 * Aarti categories list — a `<DataTable>` composition copied from the TAM-89
 * exemplar. Sort fields are only TAM-90's category allowlist
 * (`slug | sortOrder | isActive | createdAt | updatedAt`).
 */
export function CategoriesPage() {
  const table = useDataTableState({ sort: 'sortOrder', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useAartiCategories(table.state);

  const [formState, setFormState] = React.useState<CategoryFormState>(null);
  const [deactivating, setDeactivating] = React.useState<CategoryListItem | null>(null);
  const deactivate = useDeactivateCategory();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Aarti categories</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Groupings for the Aarti audio catalogue. Deactivating a category hides
          it from the app without deleting it or its tagged items.
        </p>
      </div>

      <DataTable<CategoryListItem>
        caption="All aarti categories"
        columns={[
          {
            id: 'image',
            header: 'Image',
            headerClassName: 'w-0',
            cell: (category) => <CategoryImage category={category} />,
          },
          {
            id: 'slug',
            header: 'Slug',
            sortField: 'slug',
            cell: (category) => <code className="text-xs">{category.slug}</code>,
          },
          { id: 'name', header: 'Name', cell: (category) => category.name },
          {
            id: 'sortOrder',
            header: 'Sort order',
            sortField: 'sortOrder',
            cell: (category) => category.sortOrder,
          },
          {
            id: 'isActive',
            header: 'Status',
            sortField: 'isActive',
            cell: (category) => (
              <Badge variant={category.isActive ? 'default' : 'muted'}>
                {category.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
          {
            id: 'updatedAt',
            header: 'Updated',
            sortField: 'updatedAt',
            cell: (category) => (
              <time dateTime={category.updatedAt} className="text-xs text-muted-foreground">
                {new Date(category.updatedAt).toLocaleDateString()}
              </time>
            ),
          },
        ]}
        filterFields={[
          { id: 'q', label: 'Search', type: 'text', placeholder: 'Search slug/name…' },
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
        getRowId={(category) => category.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No categories match these filters."
        actions={(category) => (
          <CategoryRowActions
            category={category}
            onEdit={() => setFormState({ kind: 'edit', id: category.id })}
            onDeactivate={() => setDeactivating(category)}
          />
        )}
      />

      <CategoryFormDialog state={formState} onClose={() => setFormState(null)} />
      <DeactivateDialog
        open={deactivating !== null}
        title={`Deactivate “${deactivating?.name}”?`}
        label={deactivating?.slug ?? ''}
        onConfirm={() =>
          deactivate.mutateAsync({
            id: deactivating!.id,
            expectedUpdatedAt: deactivating!.updatedAt,
          })
        }
        onClose={() => setDeactivating(null)}
      >
        <p>
          The category is hidden from the app’s listings. It is not deleted and
          can be reactivated at any time.
        </p>
        <p>
          Any items already tagged with this category keep their tag — those tag
          rows are not deleted.
        </p>
      </DeactivateDialog>
    </div>
  );
}

function CategoryImage({ category }: { category: CategoryListItem }) {
  const [broken, setBroken] = React.useState(false);
  if (!category.imageUrl || broken) {
    return <div aria-hidden="true" className="size-8 rounded-md border bg-muted" title="No image" />;
  }
  return (
    <img
      src={category.imageUrl}
      alt=""
      className="size-8 rounded-md border object-cover"
      onError={() => setBroken(true)}
    />
  );
}

function CategoryRowActions({
  category,
  onEdit,
  onDeactivate,
}: {
  category: CategoryListItem;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const update = useUpdateCategory();

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
