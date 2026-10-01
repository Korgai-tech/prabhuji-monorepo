import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useDeactivateHomeFeedItem,
  useHomeFeedItems,
  useUpdateHomeFeedItem,
  type HomeFeedItem,
} from './use-home-feed-items';
import { FeedItemFormDialog, type FeedItemFormState } from './feed-item-form';
import { HomeDeactivateDialog } from './deactivate-dialog';
import { CONTENT_TYPE_OPTIONS, MODULE_KEY_OPTIONS } from './home-constants';

/**
 * Home feed items list (TAM-105 §(d)) — the TAM-89 `<DataTable>` composition.
 * Sort fields per TAM-104
 * (`title | trendingScore | badge | isActive | createdAt | updatedAt`). With no
 * explicit sort the list follows the API's default id order — the same stable
 * shuffle the public feed serves now that the curated sort order was dropped.
 */
export function FeedItemsPage() {
  const table = useDataTableState();
  const { data, isLoading, isFetching, isError, error, refetch } = useHomeFeedItems(table.state);
  const deactivate = useDeactivateHomeFeedItem();

  const [formState, setFormState] = React.useState<FeedItemFormState>(null);
  const [deactivating, setDeactivating] = React.useState<HomeFeedItem | null>(null);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Home feed</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The mixed content feed on the home screen. Ordering is a stable shuffle,
          or trending score first when that mode is enabled in Home settings.
        </p>
      </div>

      <DataTable<HomeFeedItem>
        caption="All home feed items"
        columns={[
          {
            id: 'hero',
            header: 'Hero',
            headerClassName: 'w-0',
            cell: (item) => <FeedHero item={item} />,
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
            id: 'contentType',
            header: 'Content type',
            cell: (item) => <Badge variant="muted">{item.contentType}</Badge>,
          },
          {
            id: 'module',
            header: 'Module',
            cell: (item) => <span className="text-xs">{item.module}</span>,
          },
          {
            id: 'badge',
            header: 'Badge',
            sortField: 'badge',
            cell: (item) =>
              item.badge ? (
                <Badge variant="default">{item.badge}</Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
          {
            id: 'badgeLabel',
            header: 'Badge label',
            cell: (item) =>
              item.badgeLabel ?? <span className="text-muted-foreground">—</span>,
          },
          {
            id: 'trendingScore',
            header: 'Trending',
            sortField: 'trendingScore',
            cell: (item) =>
              item.trendingScore ?? <span className="text-muted-foreground">—</span>,
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
        filterFields={[
          { id: 'q', label: 'Search', type: 'text', placeholder: 'Search title / slug…' },
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
            id: 'contentType',
            label: 'Content type',
            type: 'select',
            options: CONTENT_TYPE_OPTIONS,
          },
          {
            id: 'module',
            label: 'Module',
            type: 'select',
            options: MODULE_KEY_OPTIONS,
          },
          {
            id: 'badge',
            label: 'Badge',
            type: 'select',
            options: [
              { label: 'Trending', value: 'trending' },
              { label: 'Suggested', value: 'suggested' },
            ],
          },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New feed item
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
        emptyMessage="No feed items match these filters."
        actions={(item) => (
          <FeedItemRowActions
            item={item}
            onEdit={() => setFormState({ kind: 'edit', id: item.id })}
            onDeactivate={() => setDeactivating(item)}
          />
        )}
      />

      <FeedItemFormDialog state={formState} onClose={() => setFormState(null)} />
      <HomeDeactivateDialog
        entityLabel="feed item"
        row={
          deactivating
            ? { id: deactivating.id, updatedAt: deactivating.updatedAt, label: deactivating.title }
            : null
        }
        onConfirm={deactivate.mutateAsync}
        onClose={() => setDeactivating(null)}
      />
    </div>
  );
}

function FeedHero({ item }: { item: HomeFeedItem }) {
  const [broken, setBroken] = React.useState(false);
  if (!item.heroImageUrl || broken) {
    return (
      <div aria-hidden="true" className="size-10 rounded-md border bg-muted" title="No image" />
    );
  }
  return (
    <img
      src={item.heroImageUrl}
      alt=""
      className="size-10 rounded-md border object-cover"
      onError={() => setBroken(true)}
    />
  );
}

function FeedItemRowActions({
  item,
  onEdit,
  onDeactivate,
}: {
  item: HomeFeedItem;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const update = useUpdateHomeFeedItem();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: item.id,
        changes: { isActive: true },
        expectedUpdatedAt: item.updatedAt,
      });
      notify.success('Feed item reactivated');
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          () => undefined,
          'This feed item changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(error, 'Could not reactivate this feed item.');
      }
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      {item.isActive ? (
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
