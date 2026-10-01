import * as React from 'react';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { z } from 'zod';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { EntityForm } from '@/components/entity-form/entity-form';
import { mediaField, IMAGE_TYPES, VIDEO_TYPES } from '@/components/media';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  useMediaAssets,
  useCreateMediaAsset,
  useUpdateMediaAsset,
  type MediaAsset,
  type MediaAssetChanges,
} from './use-horoscope-media-assets';

/**
 * Media assets (spec §(f)) — the result-screen background video + static
 * fallback. `assetKey` is the create-only business key. There is deliberately NO
 * delete action (TAM-100 exposes none — deleting an asset breaks the result
 * screen with no fallback); editors REPLACE the upload instead (spec §(h)).
 */

const MediaAssetFormSchema = z.object({
  assetKey: z.string().trim().min(1, 'Enter an asset key').max(64, '64 characters or fewer'),
  resultBackgroundVideoUrl: z.string().url('Upload the background video to continue'),
  resultBackgroundStaticFallbackUrl: z.string().url('Upload the static fallback to continue'),
  assetVersion: z.number().int('Whole numbers only'),
});
type MediaAssetFormValues = z.infer<typeof MediaAssetFormSchema>;

const VIDEO_FIELD = mediaField({
  module: 'horoscope',
  entity: 'mediaAsset',
  field: 'resultBackgroundVideoUrl',
  accept: VIDEO_TYPES,
});
const FALLBACK_FIELD = mediaField({
  module: 'horoscope',
  entity: 'mediaAsset',
  field: 'resultBackgroundStaticFallbackUrl',
  accept: IMAGE_TYPES,
});

type FormState = { kind: 'create' } | { kind: 'edit'; asset: MediaAsset } | null;

export function MediaAssetsPage() {
  const table = useDataTableState({ sort: 'assetKey', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useMediaAssets(table.state);
  const [formState, setFormState] = React.useState<FormState>(null);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Media assets</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The background video and static fallback shown behind a daily horoscope. Assets are
          updated in place — there is no delete, because removing one would leave the result screen
          with no background.
        </p>
      </div>

      <DataTable<MediaAsset>
        caption="All media assets"
        columns={[
          {
            id: 'assetKey',
            header: 'Key',
            sortField: 'assetKey',
            cell: (a) => <code className="text-xs">{a.assetKey}</code>,
          },
          {
            id: 'fallback',
            header: 'Fallback',
            headerClassName: 'w-0',
            cell: (a) => <AssetThumb url={a.resultBackgroundStaticFallbackUrl} />,
          },
          { id: 'assetVersion', header: 'Version', sortField: 'assetVersion', cell: (a) => a.assetVersion },
          {
            id: 'updatedAt',
            header: 'Updated',
            sortField: 'updatedAt',
            cell: (a) => (
              <time dateTime={a.updatedAt} className="text-xs text-muted-foreground">
                {new Date(a.updatedAt).toLocaleDateString()}
              </time>
            ),
          },
        ]}
        filterFields={[{ id: 'q', label: 'Search', type: 'text', placeholder: 'Search key…' }]}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New asset
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(a) => a.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No media assets match these filters."
        actions={(a) => (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setFormState({ kind: 'edit', asset: a })}>
              <PencilIcon aria-hidden="true" />
              Edit
            </Button>
          </div>
        )}
      />

      <MediaAssetFormDialog state={formState} onClose={() => setFormState(null)} />
    </div>
  );
}

function AssetThumb({ url }: { url: string }) {
  const [broken, setBroken] = React.useState(false);
  if (!url || broken) {
    return <div aria-hidden="true" className="size-8 rounded-md border bg-muted" title="No image" />;
  }
  return (
    <img
      src={url}
      alt=""
      className="size-8 rounded-md border object-cover"
      onError={() => setBroken(true)}
    />
  );
}

function MediaAssetFormDialog({ state, onClose }: { state: FormState; onClose: () => void }) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditMediaAsset key={state.asset.updatedAt} asset={state.asset} onClose={onClose} />
        ) : (
          <CreateMediaAsset onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

const FIELDS = [
  { name: 'resultBackgroundVideoUrl' as const, label: 'Background video (MP4)', type: 'custom' as const, required: true, render: VIDEO_FIELD },
  { name: 'resultBackgroundStaticFallbackUrl' as const, label: 'Static fallback image', type: 'custom' as const, required: true, render: FALLBACK_FIELD },
  { name: 'assetVersion' as const, label: 'Asset version', type: 'number' as const },
];

function CreateMediaAsset({ onClose }: { onClose: () => void }) {
  const create = useCreateMediaAsset();
  return (
    <>
      <DialogHeader>
        <DialogTitle>New media asset</DialogTitle>
        <DialogDescription>The asset key is a permanent business key.</DialogDescription>
      </DialogHeader>
      <EntityForm<MediaAssetFormValues>
        mode="create"
        entityLabel="Media asset"
        schema={MediaAssetFormSchema}
        defaultValues={{
          assetKey: '',
          resultBackgroundVideoUrl: '',
          resultBackgroundStaticFallbackUrl: '',
          assetVersion: 1,
        }}
        fields={[
          { name: 'assetKey', label: 'Asset key', type: 'text', required: true, description: 'Permanent business key.' },
          ...FIELDS,
        ]}
        onSubmit={(values) =>
          create.mutateAsync({
            assetKey: values.assetKey,
            resultBackgroundVideoUrl: values.resultBackgroundVideoUrl,
            resultBackgroundStaticFallbackUrl: values.resultBackgroundStaticFallbackUrl,
            assetVersion: values.assetVersion,
          })
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditMediaAsset({ asset, onClose }: { asset: MediaAsset; onClose: () => void }) {
  const update = useUpdateMediaAsset();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{asset.assetKey}”</DialogTitle>
        <DialogDescription>The asset key is permanent. Replace an upload to change it.</DialogDescription>
      </DialogHeader>
      <EntityForm<MediaAssetFormValues>
        mode="edit"
        entityLabel="Media asset"
        schema={MediaAssetFormSchema}
        updatedAt={asset.updatedAt}
        defaultValues={{
          assetKey: asset.assetKey,
          resultBackgroundVideoUrl: asset.resultBackgroundVideoUrl,
          resultBackgroundStaticFallbackUrl: asset.resultBackgroundStaticFallbackUrl,
          assetVersion: asset.assetVersion,
        }}
        fields={[{ name: 'assetKey', label: 'Asset key', type: 'text', disabled: true }, ...FIELDS]}
        onSubmit={(values) => {
          const changes: MediaAssetChanges = {};
          if (values.resultBackgroundVideoUrl !== asset.resultBackgroundVideoUrl)
            changes.resultBackgroundVideoUrl = values.resultBackgroundVideoUrl;
          if (values.resultBackgroundStaticFallbackUrl !== asset.resultBackgroundStaticFallbackUrl)
            changes.resultBackgroundStaticFallbackUrl = values.resultBackgroundStaticFallbackUrl;
          if (values.assetVersion !== asset.assetVersion) changes.assetVersion = values.assetVersion;
          return update.mutateAsync({
            id: asset.id,
            changes,
            expectedUpdatedAt: values.updatedAt as string,
          });
        }}
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}
