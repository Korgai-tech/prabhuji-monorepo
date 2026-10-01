import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useDeactivateHomeBanner,
  useHomeBanners,
  useUpdateHomeBanner,
  type HomeBanner,
} from './use-home-banners';
import { BannerFormDialog, type BannerFormState } from './banner-form';
import { HomeDeactivateDialog } from './deactivate-dialog';

/**
 * Home banners list (TAM-105 §(c)) — the TAM-89 `<DataTable>` composition.
 * Sort fields are only those on TAM-104's allowlist
 * (`sortOrder | mediaType | isActive | createdAt | updatedAt`).
 */
export function BannersPage() {
  const table = useDataTableState({ sort: 'sortOrder', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useHomeBanners(table.state);
  const deactivate = useDeactivateHomeBanner();

  const [formState, setFormState] = React.useState<BannerFormState>(null);
  const [deactivating, setDeactivating] = React.useState<HomeBanner | null>(null);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Home banners</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The carousel at the top of the app’s home screen. Deactivating a banner
          hides it without deleting anything.
        </p>
      </div>

      <DataTable<HomeBanner>
        caption="All home banners"
        columns={[
          {
            id: 'media',
            header: 'Media',
            headerClassName: 'w-0',
            cell: (banner) => <BannerThumb banner={banner} />,
          },
          {
            id: 'mediaType',
            header: 'Type',
            sortField: 'mediaType',
            cell: (banner) => (
              <Badge variant="muted">{banner.mediaType}</Badge>
            ),
          },
          {
            id: 'title',
            header: 'Title',
            cell: (banner) =>
              banner.title ?? <span className="text-muted-foreground">—</span>,
          },
          {
            id: 'destinationType',
            header: 'Destination',
            cell: (banner) => (
              <span className="text-xs">{banner.destinationType}</span>
            ),
          },
          {
            id: 'destinationValue',
            header: 'Value',
            cell: (banner) =>
              banner.destinationValue ? (
                <code className="text-xs">{banner.destinationValue}</code>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
          {
            id: 'isProFeatureDiscovery',
            header: 'Pro discovery',
            cell: (banner) =>
              banner.isProFeatureDiscovery ? (
                <Badge variant="default">Yes</Badge>
              ) : (
                <span className="text-muted-foreground">No</span>
              ),
          },
          {
            id: 'sortOrder',
            header: 'Sort order',
            sortField: 'sortOrder',
            cell: (banner) => banner.sortOrder,
          },
          {
            id: 'isActive',
            header: 'Status',
            sortField: 'isActive',
            cell: (banner) => (
              <Badge variant={banner.isActive ? 'default' : 'muted'}>
                {banner.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
          {
            id: 'updatedAt',
            header: 'Updated',
            sortField: 'updatedAt',
            cell: (banner) => (
              <time
                dateTime={banner.updatedAt}
                className="text-xs text-muted-foreground"
              >
                {new Date(banner.updatedAt).toLocaleDateString()}
              </time>
            ),
          },
        ]}
        filterFields={[
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
            label: 'Media type',
            type: 'select',
            options: [
              { label: 'Image', value: 'image' },
              { label: 'Video', value: 'video' },
            ],
          },
          {
            id: 'destinationType',
            label: 'Destination',
            type: 'select',
            options: [
              { label: 'Linked module', value: 'linked_module' },
              { label: 'Content detail', value: 'content_detail' },
              { label: 'Pro paywall', value: 'pro_paywall' },
              { label: 'Informational', value: 'informational' },
            ],
          },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New banner
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(banner) => banner.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No banners match these filters."
        actions={(banner) => (
          <BannerRowActions
            banner={banner}
            onEdit={() => setFormState({ kind: 'edit', id: banner.id })}
            onDeactivate={() => setDeactivating(banner)}
          />
        )}
      />

      <BannerFormDialog state={formState} onClose={() => setFormState(null)} />
      <HomeDeactivateDialog
        entityLabel="banner"
        row={
          deactivating
            ? {
                id: deactivating.id,
                updatedAt: deactivating.updatedAt,
                label: deactivating.title ?? deactivating.mediaType,
              }
            : null
        }
        onConfirm={deactivate.mutateAsync}
        onClose={() => setDeactivating(null)}
      />
    </div>
  );
}

function BannerThumb({ banner }: { banner: HomeBanner }) {
  const [broken, setBroken] = React.useState(false);
  const src = banner.mediaType === 'video' ? banner.thumbnailUrl : banner.mediaUrl;
  if (!src || broken) {
    return (
      <div
        aria-hidden="true"
        className="size-10 rounded-md border bg-muted"
        title="No preview"
      />
    );
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

function BannerRowActions({
  banner,
  onEdit,
  onDeactivate,
}: {
  banner: HomeBanner;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const update = useUpdateHomeBanner();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: banner.id,
        changes: { isActive: true },
        expectedUpdatedAt: banner.updatedAt,
      });
      notify.success('Banner reactivated');
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          () => undefined,
          'This banner changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(error, 'Could not reactivate this banner.');
      }
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      {banner.isActive ? (
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
