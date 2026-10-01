import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { CardThumb } from '@/components/data-table/card-thumb';
import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useMantraItems,
  useUpdateMantraItem,
  useDeactivateMantraItem,
  type MantraItemListRow,
} from './use-mantra-items';
import { useMantraCategoryOptions } from './use-mantra-categories';
import { useDeityOptions } from './use-deity-options';
import { MANTRA_TYPE_OPTIONS, LANGUAGE_OPTIONS } from './mantra-schemas';
import { MantraItemFormDialog, type MantraItemFormState } from './item-form';
import { DeactivateDialog } from './deactivate-dialog';
import { Thumbnail } from './thumbnail';

/**
 * Mantra items list — the module's richest `<DataTable>`. Sort is offered ONLY on
 * TAM-92's allowlist (`title | playCount | publishedAt | isActive | createdAt |
 * updatedAt`). `playCount` is READ-ONLY text, never an input. The item
 * `sortOrder` column was dropped, so the list defaults to newest-updated first.
 *
 * NOTE: the list payload carries no `deitySlug`/`categoryIds` (a deliberate N+1
 * avoidance, like the taxonomy exemplar), so those are edited on the detail form;
 * the list shows the item's languages instead.
 */
export function MantraItemsPage() {
  const table = useDataTableState({ sort: 'updatedAt', order: 'desc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useMantraItems(table.state);
  const deactivate = useDeactivateMantraItem();
  const deityOptions = useDeityOptions();
  const categoryOptions = useMantraCategoryOptions();

  const [formState, setFormState] = React.useState<MantraItemFormState>(null);
  const [deactivating, setDeactivating] = React.useState<MantraItemListRow | null>(null);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Mantras &amp; stutis</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Audio items with Devanagari mantra text. Deactivating an item hides it
          from the app without deleting anything.
        </p>
      </div>

      <DataTable<MantraItemListRow>
        caption="All mantra items"
        columns={[
          {
            id: 'artwork',
            header: 'Artwork',
            headerClassName: 'w-0',
            cell: (row) => <Thumbnail src={row.artworkUrl} />,
          },
          {
            id: 'title',
            header: 'Title',
            sortField: 'title',
            cell: (row) => row.title,
          },
          {
            id: 'slug',
            header: 'Slug',
            cell: (row) => <code className="text-xs">{row.slug}</code>,
          },
          {
            id: 'type',
            header: 'Type',
            cell: (row) => <Badge variant="muted">{row.type}</Badge>,
          },
          {
            id: 'languages',
            header: 'Languages',
            cell: (row) =>
              row.languages.length === 0 ? (
                <span className="text-xs text-muted-foreground">All</span>
              ) : (
                <span className="text-xs">{row.languages.join(', ')}</span>
              ),
          },
          {
            id: 'playCount',
            header: 'Plays',
            sortField: 'playCount',
            // READ-ONLY server counter — plain text, never an input.
            cell: (row) => (
              <span className="tabular-nums text-muted-foreground">
                {row.playCount.toLocaleString()}
              </span>
            ),
          },
          {
            id: 'isFeatured',
            header: 'Featured',
            cell: (row) =>
              row.isFeatured ? <Badge>Featured</Badge> : <span className="text-muted-foreground">—</span>,
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
          { id: 'q', label: 'Search', type: 'text', placeholder: 'Search title/slug…' },
          {
            id: 'type',
            label: 'Type',
            type: 'select',
            options: MANTRA_TYPE_OPTIONS,
          },
          {
            id: 'deitySlug',
            label: 'Deity',
            type: 'select',
            options: (deityOptions.data ?? []).map((d) => ({ label: d.label, value: d.slug })),
          },
          {
            id: 'categoryId',
            label: 'Category',
            type: 'select',
            options: (categoryOptions.data?.items ?? []).map((c) => ({
              label: c.displayName,
              value: c.id,
            })),
          },
          {
            id: 'language',
            label: 'Language',
            type: 'select',
            options: LANGUAGE_OPTIONS.map((l) => ({ label: l.label, value: l.value })),
          },
          {
            id: 'isFeatured',
            label: 'Featured',
            type: 'select',
            options: [
              { label: 'Featured', value: 'true' },
              { label: 'Not featured', value: 'false' },
            ],
          },
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
            New item
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
        emptyMessage="No items match these filters."
        renderCard={(row) => (
          <ItemCard
            item={row}
            onEdit={() => setFormState({ kind: 'edit', id: row.id })}
            onDeactivate={() => setDeactivating(row)}
          />
        )}
        actions={(row) => (
          <ItemRowActions
            item={row}
            onEdit={() => setFormState({ kind: 'edit', id: row.id })}
            onDeactivate={() => setDeactivating(row)}
          />
        )}
      />

      <MantraItemFormDialog state={formState} onClose={() => setFormState(null)} />
      <DeactivateDialog
        open={deactivating !== null}
        label={deactivating?.title ?? ''}
        body={
          <>
            <p>The item is hidden from the app. It is not deleted.</p>
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

/** Grid-view card: a big artwork you can actually judge, its title + type, and
 *  the two controls the visual pass needs. The rest stays in the table view. */
function ItemCard({
  item,
  onEdit,
  onDeactivate,
}: {
  item: MantraItemListRow;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  return (
    <div className="grid gap-2">
      <CardThumb src={item.artworkUrl} title={item.title} aspect="aspect-square" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium" title={item.title}>
          {item.title}
        </span>
        <Badge variant="muted">{item.type}</Badge>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
          <PencilIcon aria-hidden="true" />
          Edit
        </Button>
        <ActivationButton
          item={item}
          onDeactivate={onDeactivate}
          variant="outline"
          className="flex-1"
        />
      </div>
    </div>
  );
}

/** Edit + (Deactivate | Reactivate). */
function ItemRowActions({
  item,
  onEdit,
  onDeactivate,
}: {
  item: MantraItemListRow;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      <ActivationButton item={item} onDeactivate={onDeactivate} />
    </div>
  );
}

/** Deactivate (→ confirm dialog) | Reactivate (a `PATCH { isActive: true }`
 *  carrying the row's `updatedAt`). Shared by the table row and the grid card so
 *  both toggle identically. */
function ActivationButton({
  item,
  onDeactivate,
  className,
  variant = 'ghost',
}: {
  item: MantraItemListRow;
  onDeactivate: () => void;
  className?: string;
  variant?: 'ghost' | 'outline';
}) {
  const update = useUpdateMantraItem();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: item.id,
        changes: { isActive: true },
        expectedUpdatedAt: item.updatedAt,
      });
      notify.success(`${item.title} reactivated`);
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          () => undefined,
          'This item changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(error, 'Could not reactivate this item.');
      }
    }
  }

  return item.isActive ? (
    <Button variant={variant} size="sm" className={className} onClick={onDeactivate}>
      <PowerOffIcon aria-hidden="true" />
      Deactivate
    </Button>
  ) : (
    <Button
      variant={variant}
      size="sm"
      className={className}
      disabled={update.isPending}
      onClick={() => void reactivate()}
    >
      <PowerIcon aria-hidden="true" />
      Reactivate
    </Button>
  );
}
