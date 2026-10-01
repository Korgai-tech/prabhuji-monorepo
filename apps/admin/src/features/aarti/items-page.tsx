import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { CardThumb } from '@/components/data-table/card-thumb';
import { DataTable } from '@/components/data-table/data-table';
import type { DataTableFilterField } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useAartiItems,
  useCategoryOptions,
  useDeactivateItem,
  useDeityOptions,
  useUpdateItem,
  type ItemListItem,
} from './use-aarti';
import { languageLabel } from './aarti-schema';
import { ItemFormDialog, type ItemFormState } from './item-form';
import { DeactivateDialog } from './deactivate-dialog';

/**
 * Aarti items list — a `<DataTable>` composition (TAM-89 exemplar). Sort fields
 * are only TAM-90's item allowlist (`title | playCount | publishedAt | isActive
 * | createdAt | updatedAt`); `playCount` is read-only text, never submitted.
 * (AudioItem has no `sortOrder` — the column was dropped; the flat app listing is
 * a stable shuffle.) Category tags are NOT in the list response (detail only), so
 * they are edited on the item form, not shown as a column.
 */
export function ItemsPage() {
  const table = useDataTableState({ sort: 'title', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useAartiItems(table.state);
  const categories = useCategoryOptions();
  const deities = useDeityOptions();

  const [formState, setFormState] = React.useState<ItemFormState>(null);
  const [deactivating, setDeactivating] = React.useState<ItemListItem | null>(null);
  const deactivate = useDeactivateItem();

  const filterFields: DataTableFilterField[] = [
    { id: 'q', label: 'Search', type: 'text', placeholder: 'Search title/slug…' },
    {
      id: 'isActive',
      label: 'Status',
      type: 'select',
      options: [
        { label: 'Active', value: 'true' },
        { label: 'Inactive', value: 'false' },
      ],
    },
    {
      id: 'categoryId',
      label: 'Category',
      type: 'select',
      options: (categories.data?.items ?? []).map((c) => ({ label: c.name, value: c.id })),
    },
    {
      id: 'deitySlug',
      label: 'Deity',
      type: 'select',
      options: (deities.data?.items ?? []).map((d) => ({ label: d.slug, value: d.slug })),
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
      id: 'isPrabhujiOriginal',
      label: 'Original',
      type: 'select',
      options: [
        { label: 'Prabhuji original', value: 'true' },
        { label: 'Not original', value: 'false' },
      ],
    },
  ];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Aarti items</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The devotional audio catalogue. Each item has a cover image, an MP3, a
          deity and the languages it is available in.
        </p>
      </div>

      <DataTable<ItemListItem>
        caption="All aarti items"
        columns={[
          {
            id: 'cover',
            header: 'Cover',
            headerClassName: 'w-0',
            cell: (item) => <ItemCover item={item} />,
          },
          {
            id: 'title',
            header: 'Title',
            sortField: 'title',
            cell: (item) => item.title,
          },
          {
            id: 'slug',
            header: 'Slug',
            cell: (item) => <code className="text-xs">{item.slug}</code>,
          },
          {
            id: 'deity',
            header: 'Deity',
            cell: (item) =>
              item.deitySlug ? (
                <code className="text-xs">{item.deitySlug}</code>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
          {
            id: 'languages',
            header: 'Languages',
            cell: (item) =>
              item.languages.length === 0 ? (
                <span className="text-muted-foreground">All</span>
              ) : (
                <span className="text-xs">
                  {item.languages.map((code) => languageLabel(code)).join(', ')}
                </span>
              ),
          },
          {
            id: 'playCount',
            header: 'Plays',
            sortField: 'playCount',
            // Read-only, server-authoritative — displayed as text.
            cell: (item) => item.playCount.toLocaleString(),
          },
          {
            id: 'isFeatured',
            header: 'Featured',
            cell: (item) => (item.isFeatured ? <Badge>Featured</Badge> : null),
          },
          {
            id: 'isPrabhujiOriginal',
            header: 'Original',
            cell: (item) => (item.isPrabhujiOriginal ? <Badge variant="outline">Original</Badge> : null),
          },
          {
            id: 'isActive',
            header: 'Status',
            sortField: 'isActive',
            cell: (item) => (
              <Badge variant={item.isActive ? 'default' : 'muted'}>
                {item.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
          {
            id: 'updatedAt',
            header: 'Updated',
            sortField: 'updatedAt',
            cell: (item) => (
              <time dateTime={item.updatedAt} className="text-xs text-muted-foreground">
                {new Date(item.updatedAt).toLocaleDateString()}
              </time>
            ),
          },
        ]}
        filterFields={filterFields}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New item
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(item) => item.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No items match these filters."
        renderCard={(item) => (
          <ItemCard
            item={item}
            onEdit={() => setFormState({ kind: 'edit', id: item.id })}
            onDeactivate={() => setDeactivating(item)}
          />
        )}
        actions={(item) => (
          <ItemRowActions
            item={item}
            onEdit={() => setFormState({ kind: 'edit', id: item.id })}
            onDeactivate={() => setDeactivating(item)}
          />
        )}
      />

      <ItemFormDialog state={formState} onClose={() => setFormState(null)} />
      <DeactivateDialog
        open={deactivating !== null}
        title={`Deactivate “${deactivating?.title}”?`}
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
          This item disappears from the app’s listings. It is not deleted and can
          be reactivated at any time from its row.
        </p>
      </DeactivateDialog>
    </div>
  );
}

function ItemCover({ item }: { item: ItemListItem }) {
  const [broken, setBroken] = React.useState(false);
  if (!item.coverImageUrl || broken) {
    return <div aria-hidden="true" className="size-8 rounded-md border bg-muted" title="No cover" />;
  }
  return (
    <img
      src={item.coverImageUrl}
      alt=""
      className="size-8 rounded-md border object-cover"
      onError={() => setBroken(true)}
    />
  );
}

/** Grid-view card: a big cover you can actually judge, its title + deity, and the
 *  two controls the visual pass needs. The rest stays in the table view. */
function ItemCard({
  item,
  onEdit,
  onDeactivate,
}: {
  item: ItemListItem;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  return (
    <div className="grid gap-2">
      <CardThumb src={item.coverImageUrl} title={item.title} aspect="aspect-square" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium" title={item.title}>
          {item.title}
        </span>
        {item.deitySlug && <Badge variant="outline">{item.deitySlug}</Badge>}
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

function ItemRowActions({
  item,
  onEdit,
  onDeactivate,
}: {
  item: ItemListItem;
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

/** Deactivate (→ confirm dialog) | Reactivate (a plain `PATCH { isActive:true }`
 *  carrying the row's `updatedAt` — visibly reversible). Shared by the table row
 *  and the grid card so both toggle identically. */
function ActivationButton({
  item,
  onDeactivate,
  className,
  variant = 'ghost',
}: {
  item: ItemListItem;
  onDeactivate: () => void;
  className?: string;
  variant?: 'ghost' | 'outline';
}) {
  const update = useUpdateItem();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: item.id,
        changes: { isActive: true },
        expectedUpdatedAt: item.updatedAt,
      });
      notify.success(`${item.slug} reactivated`);
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
