import * as React from 'react';
import { ListPlusIcon, PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { CardThumb, CardVideo } from '@/components/data-table/card-thumb';
import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useStatusItems,
  useUpdateStatusItem,
  useDeactivateStatusItem,
  type StatusItemListRow,
} from './use-status-items';
import { useDeityOptions } from './use-deity-options';
import { LANGUAGE_OPTIONS, languageLabel } from './status-schema';
import { StatusItemFormDialog, type StatusItemFormState } from './item-form';
import { buildFeedPrefill } from '@/features/home/add-to-feed';
import { FeedItemFormDialog, type FeedItemFormState } from '@/features/home/feed-item-form';
import { StatusDeactivateDialog } from './deactivate-dialog';

/**
 * Status items list (TAM-99 §(b)) — the TAM-89 `<DataTable>` composition.
 *
 * The list VIEW carries no `deitySlug` (it is a detail-only field on TAM-98), so
 * there is no deity COLUMN — a deity is edited/seen on the row's form. Filtering by
 * `deitySlug` is still offered (the API supports it), its options coming from the
 * deity picker. Sortable columns use ONLY TAM-98's allowlist
 * (`title | isActive | createdAt | updatedAt`) — the `sortOrder` column was
 * dropped, so the list defaults to newest-first (`createdAt desc`).
 */
export function StatusItemsPage() {
  const table = useDataTableState({ sort: 'createdAt', order: 'desc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useStatusItems(table.state);
  const { data: deities } = useDeityOptions();

  const [formState, setFormState] = React.useState<StatusItemFormState>(null);
  // "Add to feed" opens the home feed-item dialog prefilled from the row.
  const [feedState, setFeedState] = React.useState<FeedItemFormState>(null);
  const [deactivating, setDeactivating] = React.useState<StatusItemListRow | null>(null);
  const deactivate = useDeactivateStatusItem();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Status items</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Devotional images and videos for the Status feed. Set the overlay safe area
          so a shared status never renders a user’s name over the deity’s face.
        </p>
      </div>

      <DataTable<StatusItemListRow>
        caption="All status items"
        columns={[
          {
            id: 'thumbnail',
            header: 'Thumbnail',
            headerClassName: 'w-0',
            cell: (item) => <StatusThumbnail item={item} />,
          },
          { id: 'title', header: 'Title', sortField: 'title', cell: (item) => item.title },
          {
            id: 'slug',
            header: 'Slug',
            cell: (item) => <code className="text-xs">{item.slug}</code>,
          },
          {
            id: 'mediaType',
            header: 'Type',
            cell: (item) => (
              <Badge variant={item.mediaType === 'video' ? 'secondary' : 'outline'}>
                {item.mediaType.toUpperCase()}
              </Badge>
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
                  {item.languages.map((l) => languageLabel(l)).join(', ')}
                </span>
              ),
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
            id: 'mediaType',
            label: 'Type',
            type: 'select',
            options: [
              { label: 'Image', value: 'image' },
              { label: 'Video', value: 'video' },
            ],
          },
          {
            id: 'deitySlug',
            label: 'Deity',
            type: 'select',
            options: (deities ?? []).map((d) => ({
              label: d.active ? d.slug : `${d.slug} (inactive)`,
              value: d.slug,
            })),
          },
          {
            id: 'language',
            label: 'Language',
            type: 'select',
            options: LANGUAGE_OPTIONS.map((l) => ({ label: l.label, value: l.value })),
          },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New status
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
        emptyMessage="No status items match these filters."
        renderCard={(item) => (
          <StatusItemCard
            item={item}
            onEdit={() => setFormState({ kind: 'edit', id: item.id })}
            onDeactivate={() => setDeactivating(item)}
          />
        )}
        actions={(item) => (
          <StatusItemRowActions
            item={item}
            onAddToFeed={() =>
              setFeedState({ kind: 'create', prefill: buildFeedPrefill('status', { slug: item.slug, title: item.title, imageUrl: item.thumbnailUrl }) })
            }
            onEdit={() => setFormState({ kind: 'edit', id: item.id })}
            onDeactivate={() => setDeactivating(item)}
          />
        )}
      />

      <StatusItemFormDialog state={formState} onClose={() => setFormState(null)} />
      <FeedItemFormDialog state={feedState} onClose={() => setFeedState(null)} />

      <StatusDeactivateDialog
        open={deactivating !== null}
        label={deactivating?.slug ?? ''}
        busy={deactivate.isPending}
        description={
          <>
            <p>
              The status is hidden from the feed. It is not deleted, and you can
              reactivate it at any time from its row.
            </p>
          </>
        }
        onConfirm={async () => {
          if (!deactivating) return;
          await deactivate.mutateAsync({
            id: deactivating.id,
            expectedUpdatedAt: deactivating.updatedAt,
          });
        }}
        onClose={() => setDeactivating(null)}
      />
    </div>
  );
}

/** The thumbnail. Seeded rows carry URLs never uploaded through us; shown, never
 *  rejected on read. A broken/missing image degrades to a neutral placeholder. */
function StatusThumbnail({ item }: { item: StatusItemListRow }) {
  const [broken, setBroken] = React.useState(false);
  if (!item.thumbnailUrl || broken) {
    return <div aria-hidden="true" className="size-10 rounded-md border bg-muted" title="No thumbnail" />;
  }
  return (
    <img
      src={item.thumbnailUrl}
      alt=""
      className="size-10 rounded-md border object-cover"
      onError={() => setBroken(true)}
    />
  );
}

/** Grid-view card: a big thumbnail you can actually judge, its title + type, and
 *  the two controls the visual pass needs. The rest stays in the table view. */
function StatusItemCard({
  item,
  onEdit,
  onDeactivate,
}: {
  item: StatusItemListRow;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  return (
    <div className="grid gap-2">
      {item.mediaType === 'video' && item.videoUrl ? (
        <CardVideo src={item.videoUrl} poster={item.thumbnailUrl} title={item.title} />
      ) : (
        <CardThumb src={item.thumbnailUrl} title={item.title} />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium" title={item.title}>
          {item.title}
        </span>
        <Badge variant={item.mediaType === 'video' ? 'secondary' : 'outline'}>
          {item.mediaType.toUpperCase()}
        </Badge>
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
function StatusItemRowActions({
  item,
  onEdit,
  onDeactivate,
  onAddToFeed,
}: {
  item: StatusItemListRow;
  onEdit: () => void;
  onDeactivate: () => void;
  onAddToFeed: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onAddToFeed}>
        <ListPlusIcon aria-hidden="true" />
        Add to feed
      </Button>
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      <ActivationButton item={item} onDeactivate={onDeactivate} />
    </div>
  );
}

/** Deactivate (→ confirm dialog) | Reactivate (a `PATCH { isActive: true }`
 *  carrying the row's `updatedAt` — visibly reversible, §(f)). Shared by the
 *  table row and the grid card so both toggle identically. */
function ActivationButton({
  item,
  onDeactivate,
  className,
  variant = 'ghost',
}: {
  item: StatusItemListRow;
  onDeactivate: () => void;
  className?: string;
  variant?: 'ghost' | 'outline';
}) {
  const update = useUpdateStatusItem();

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
          'This status changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(error, 'Could not reactivate this status.');
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
