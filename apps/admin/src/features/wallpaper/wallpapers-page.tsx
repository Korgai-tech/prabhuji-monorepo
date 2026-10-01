import * as React from 'react';
import { ListPlusIcon, PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { CardThumb, CardVideo } from '@/components/data-table/card-thumb';
import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useWallpapers,
  useUpdateWallpaper,
  useDeactivateWallpaper,
  type WallpaperListItem,
} from './use-wallpapers';
import { useDeityOptions } from './use-deity-options';
import { WallpaperFormDialog, type WallpaperFormState } from './wallpaper-form';
import { DeactivateDialog, type DeactivateTarget } from './deactivate-dialog';
import { buildFeedPrefill } from '@/features/home/add-to-feed';
import { FeedItemFormDialog, type FeedItemFormState } from '@/features/home/feed-item-form';

/**
 * The wallpapers list (TAM-97 §(b)) — a `<DataTable>` config copied from the
 * deities exemplar (TAM-89). Columns include the `mediaType` badge, the deity
 * tag and the READ-ONLY `setCount` (text, never editable). Sort offers only
 * the allowlist (`title | setCount | isActive | createdAt | updatedAt`); the
 * per-item display-order column is gone, so the list defaults to newest-updated
 * first. Filters: `q`, `isActive`, `mediaType`, `deitySlug`.
 */
export function WallpapersPage() {
  const table = useDataTableState({ sort: 'updatedAt', order: 'desc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useWallpapers(table.state);
  const { data: deityOptions } = useDeityOptions();

  const [formState, setFormState] = React.useState<WallpaperFormState>(null);
  // "Add to feed" opens the home feed-item dialog prefilled from the row — the
  // feed is curated, not aggregated, so a card is still a real row the editor owns.
  const [feedState, setFeedState] = React.useState<FeedItemFormState>(null);
  const [deactivating, setDeactivating] = React.useState<DeactivateTarget | null>(null);
  const deactivate = useDeactivateWallpaper();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Wallpapers</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Static and live wallpapers. The media type decides which asset slots
          apply and cannot be changed after creation. Deactivating a wallpaper
          hides it from the app without deleting anything.
        </p>
      </div>

      <DataTable<WallpaperListItem>
        caption="All wallpapers"
        columns={[
          {
            id: 'thumbnail',
            header: 'Thumbnail',
            headerClassName: 'w-0',
            cell: (w) => <Thumb src={w.thumbnailUrl} />,
          },
          {
            id: 'title',
            header: 'Title',
            sortField: 'title',
            cell: (w) => w.title,
          },
          {
            id: 'slug',
            header: 'Slug',
            cell: (w) => <code className="text-xs">{w.slug}</code>,
          },
          {
            id: 'mediaType',
            header: 'Type',
            cell: (w) => (
              <Badge variant={w.mediaType === 'live' ? 'secondary' : 'outline'}>
                {w.mediaType === 'live' ? 'LIVE' : 'STATIC'}
              </Badge>
            ),
          },
          {
            id: 'deity',
            header: 'Deity',
            cell: (w) =>
              w.deitySlug ? (
                <code className="text-xs">{w.deitySlug}</code>
              ) : (
                <span className="text-xs text-muted-foreground">All</span>
              ),
          },
          {
            id: 'setCount',
            header: 'Sets',
            sortField: 'setCount',
            cell: (w) => <span className="tabular-nums text-muted-foreground">{w.setCount}</span>,
          },
          {
            id: 'isActive',
            header: 'Status',
            sortField: 'isActive',
            cell: (w) => (
              <Badge variant={w.isActive ? 'default' : 'muted'}>
                {w.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
          {
            id: 'updatedAt',
            header: 'Updated',
            sortField: 'updatedAt',
            cell: (w) => (
              <time dateTime={w.updatedAt} className="text-xs text-muted-foreground">
                {new Date(w.updatedAt).toLocaleDateString()}
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
              { label: 'Static', value: 'static' },
              { label: 'Live', value: 'live' },
            ],
          },
          {
            id: 'deitySlug',
            label: 'Deity',
            type: 'select',
            options: (deityOptions ?? []).map((d) => ({ label: d.slug, value: d.slug })),
          },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New wallpaper
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(w) => w.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No wallpapers match these filters."
        renderCard={(w) => (
          <WallpaperCard
            wallpaper={w}
            onEdit={() => setFormState({ kind: 'edit', id: w.id })}
            onDeactivate={() =>
              setDeactivating({ id: w.id, label: w.title, updatedAt: w.updatedAt })
            }
          />
        )}
        actions={(w) => (
          <WallpaperRowActions
            wallpaper={w}
            onAddToFeed={() =>
              setFeedState({ kind: 'create', prefill: buildFeedPrefill('wallpaper', { slug: w.slug, title: w.title, imageUrl: w.thumbnailUrl }) })
            }
            onEdit={() => setFormState({ kind: 'edit', id: w.id })}
            onDeactivate={() =>
              setDeactivating({ id: w.id, label: w.title, updatedAt: w.updatedAt })
            }
          />
        )}
      />

      <WallpaperFormDialog state={formState} onClose={() => setFormState(null)} />
      <FeedItemFormDialog state={feedState} onClose={() => setFeedState(null)} />
      <DeactivateDialog
        target={deactivating}
        title={`Deactivate “${deactivating?.label ?? ''}”?`}
        successLabel="deactivated"
        conflictMessage="This wallpaper changed since you opened this list — reload and try again."
        deactivate={(args) => deactivate.mutateAsync(args)}
        onClose={() => setDeactivating(null)}
        description={
          <>
            <p>
              The wallpaper is hidden from the app. It is not deleted and keeps
              its assets, deity tag and set count.
            </p>
            <p>You can reactivate it at any time from its row.</p>
          </>
        }
      />
    </div>
  );
}

function Thumb({ src }: { src: string }) {
  const [broken, setBroken] = React.useState(false);
  if (!src || broken) {
    return <div aria-hidden="true" className="size-10 rounded-md border bg-muted" title="No thumbnail" />;
  }
  return (
    <img
      src={src}
      alt=""
      className="size-10 rounded-md border object-cover"
      onError={() => setBroken(true)}
    />
  );
}

/** Grid-view card: a big thumbnail you can actually judge, its title + type, and
 *  the two controls the visual pass needs. The rest stays in the table view. */
function WallpaperCard({
  wallpaper,
  onEdit,
  onDeactivate,
}: {
  wallpaper: WallpaperListItem;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  return (
    <div className="grid gap-2">
      {wallpaper.mediaType === 'live' && wallpaper.previewVideoUrl ? (
        <CardVideo
          src={wallpaper.previewVideoUrl}
          poster={wallpaper.thumbnailUrl}
          title={wallpaper.title}
        />
      ) : (
        <CardThumb src={wallpaper.thumbnailUrl} title={wallpaper.title} />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium" title={wallpaper.title}>
          {wallpaper.title}
        </span>
        <Badge variant={wallpaper.mediaType === 'live' ? 'secondary' : 'outline'}>
          {wallpaper.mediaType === 'live' ? 'LIVE' : 'STATIC'}
        </Badge>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
          <PencilIcon aria-hidden="true" />
          Edit
        </Button>
        <ActivationButton
          wallpaper={wallpaper}
          onDeactivate={onDeactivate}
          variant="outline"
          className="flex-1"
        />
      </div>
    </div>
  );
}

/** Edit + (Deactivate | Reactivate). Reactivate is a plain `PATCH { isActive:true }`
 *  carrying the row's `updatedAt` — visibly reversible (§(g)). */
function WallpaperRowActions({
  wallpaper,
  onEdit,
  onDeactivate,
  onAddToFeed,
}: {
  wallpaper: WallpaperListItem;
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
      <ActivationButton wallpaper={wallpaper} onDeactivate={onDeactivate} />
    </div>
  );
}

/** Deactivate (→ confirm dialog) | Reactivate (a plain `PATCH { isActive:true }`
 *  carrying the row's `updatedAt` — visibly reversible, §(g)). Shared by the
 *  table row and the grid card so both toggle identically. */
function ActivationButton({
  wallpaper,
  onDeactivate,
  className,
  variant = 'ghost',
}: {
  wallpaper: WallpaperListItem;
  onDeactivate: () => void;
  className?: string;
  variant?: 'ghost' | 'outline';
}) {
  const update = useUpdateWallpaper();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: wallpaper.id,
        changes: { isActive: true },
        expectedUpdatedAt: wallpaper.updatedAt,
      });
      notify.success(`${wallpaper.title} reactivated`);
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          () => undefined,
          'This wallpaper changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(error, 'Could not reactivate this wallpaper.');
      }
    }
  }

  return wallpaper.isActive ? (
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
