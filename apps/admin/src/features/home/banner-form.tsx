import * as React from 'react';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';

import { EntityForm, type EntityFormField } from '@/components/entity-form/entity-form';
import { mediaField } from '@/components/media';
import {
  translationsField,
  translationsSchema,
  translationsChanged,
} from '@/components/translations';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api-error';
import { adminKeys } from '@/lib/query-keys';

import {
  useCreateHomeBanner,
  useHomeBanner,
  useUpdateHomeBanner,
  type HomeBannerDetail,
  type HomeBannerPatchChanges,
  type HomeBannerTranslation,
} from './use-home-banners';
import { IMAGE_TYPES, VIDEO_TYPES, MEDIA_TYPE_OPTIONS } from './home-constants';
import {
  DestinationSchema,
  destinationField,
  destinationFromRow,
  destinationToNullable,
  resolveProDiscovery,
  EMPTY_DESTINATION,
  type DestinationFieldValue,
} from './destination-field';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Banner create/edit form (TAM-105 §(c)) — `mediaType`-CONDITIONAL.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `mediaType` shapes the form (image → `mediaUrl` only; video → `mediaUrl` +
 * a REQUIRED `thumbnailUrl` still) and is CREATE-ONLY (TAM-104 rejects it in
 * PATCH). Because `<EntityForm>`'s field list cannot react to its own internal
 * values, `mediaType` is owned OUTSIDE the form (a select on create, read-only
 * text on edit) and the `<EntityForm>` is REMOUNTED (`key`) when it changes so
 * its fields + schema rebind. On edit that only fires if `mediaType` were to
 * change, which it never does — it is immutable.
 *
 * SEND ONLY CHANGED FIELDS on edit (seeded media URLs fail `validateOwnedUrl`);
 * `updatedAt` is merged by `<EntityForm mode="edit">` and forwarded as the ADR
 * C3 precondition; the 409 path is handled once inside `<EntityForm>`.
 */

type MediaType = 'image' | 'video';

interface BannerFormValues extends Record<string, unknown> {
  title: string;
  mediaUrl: string;
  thumbnailUrl: string;
  destination: DestinationFieldValue;
  sortOrder: number;
  isActive: boolean;
  translations: HomeBannerTranslation[];
}

function bannerSchema(mediaType: MediaType): z.ZodType<BannerFormValues> {
  return z.object({
    title: z.string(),
    mediaUrl: z.string().url('Upload the banner media to continue'),
    thumbnailUrl:
      mediaType === 'video'
        ? z.string().url('A video banner needs a thumbnail still')
        : z.string(),
    destination: DestinationSchema,
    sortOrder: z.number().int('Whole numbers only'),
    isActive: z.boolean(),
    translations: translationsSchema({
      title: z.string().trim().min(1, 'Title is required').max(200),
    }),
  });
}

/** Map a loaded banner's translations into the form value shape. */
function bannerTranslations(b: HomeBannerDetail): HomeBannerTranslation[] {
  return b.translations.map((t) => ({ locale: t.locale, title: t.title }));
}

function bannerFields(mediaType: MediaType): EntityFormField<BannerFormValues>[] {
  const fields: EntityFormField<BannerFormValues>[] = [
    { name: 'title', label: 'Title', type: 'text', placeholder: 'Optional heading' },
    {
      name: 'mediaUrl',
      label: mediaType === 'video' ? 'Video (MP4)' : 'Image',
      type: 'custom',
      required: true,
      render: mediaField({
        module: 'home',
        entity: 'homeBanner',
        field: 'mediaUrl',
        accept: mediaType === 'video' ? VIDEO_TYPES : IMAGE_TYPES,
      }),
    },
  ];

  if (mediaType === 'video') {
    fields.push({
      name: 'thumbnailUrl',
      label: 'Thumbnail still',
      type: 'custom',
      required: true,
      description: 'The still shown before the video plays.',
      render: mediaField({
        module: 'home',
        entity: 'homeBanner',
        field: 'thumbnailUrl',
        accept: IMAGE_TYPES,
      }),
    });
  }

  fields.push(
    {
      name: 'destination',
      label: 'Destination',
      type: 'custom',
      description: 'Where the banner sends the user. Keys, never URLs.',
      render: destinationField({ withProDiscovery: true }),
    },
    {
      name: 'sortOrder',
      label: 'Sort order',
      type: 'number',
      description: 'Lower numbers appear first.',
    },
    { name: 'isActive', label: 'Active', type: 'switch' },
    {
      name: 'translations',
      label: 'Title translations',
      type: 'custom',
      render: translationsField({
        fields: [{ name: 'title', label: 'Title', required: true, maxLength: 200 }],
        title: 'Title translations',
      }),
    },
  );
  return fields;
}

export type BannerFormState = { kind: 'create' } | { kind: 'edit'; id: string } | null;

export function BannerFormDialog({
  state,
  onClose,
}: {
  state: BannerFormState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditBanner id={state.id} onClose={onClose} />
        ) : (
          <CreateBanner onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateBanner({ onClose }: { onClose: () => void }) {
  const create = useCreateHomeBanner();
  const [mediaType, setMediaType] = React.useState<MediaType>('image');

  return (
    <>
      <DialogHeader>
        <DialogTitle>New banner</DialogTitle>
        <DialogDescription>
          Media type is permanent — it cannot be changed after creation.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="banner-media-type">Media type</Label>
        <Select
          id="banner-media-type"
          value={mediaType}
          onChange={(event) => setMediaType(event.target.value as MediaType)}
        >
          {MEDIA_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {/* REMOUNT on mediaType so the fields + schema rebind. */}
      <EntityForm<BannerFormValues>
        key={mediaType}
        mode="create"
        entityLabel="Banner"
        schema={bannerSchema(mediaType)}
        defaultValues={{
          title: '',
          mediaUrl: '',
          thumbnailUrl: '',
          destination: EMPTY_DESTINATION,
          sortOrder: 0,
          isActive: true,
          translations: [],
        }}
        fields={bannerFields(mediaType)}
        onSubmit={(values) =>
          create.mutateAsync({
            mediaType,
            mediaUrl: values.mediaUrl,
            thumbnailUrl: mediaType === 'video' ? values.thumbnailUrl : null,
            title: values.title.trim() === '' ? null : values.title,
            ...destinationToNullable(values.destination),
            isProFeatureDiscovery: resolveProDiscovery(values.destination),
            sortOrder: values.sortOrder,
            isActive: values.isActive,
            translations: values.translations,
          })
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditBanner({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: banner, isLoading, isError, error } = useHomeBanner(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit banner</DialogTitle>
          <DialogDescription>Loading…</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </>
    );
  }

  if (isError || !banner) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit banner</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this banner</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit banner</DialogTitle>
        <DialogDescription>
          Media type ({banner.mediaType}) is fixed — create a new banner to change it.
        </DialogDescription>
      </DialogHeader>
      {/* REMOUNT on `updatedAt` so the form rebinds to fresh data after an invalidation. */}
      <EditBannerForm key={banner.updatedAt} banner={banner} onClose={onClose} />
    </>
  );
}

function EditBannerForm({ banner, onClose }: { banner: HomeBannerDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const update = useUpdateHomeBanner();
  const mediaType = banner.mediaType;

  return (
    <EntityForm<BannerFormValues>
      mode="edit"
      entityLabel="Banner"
      schema={bannerSchema(mediaType)}
      updatedAt={banner.updatedAt}
      defaultValues={{
        title: banner.title ?? '',
        mediaUrl: banner.mediaUrl,
        thumbnailUrl: banner.thumbnailUrl ?? '',
        destination: destinationFromRow({
          type: banner.destinationType,
          value: banner.destinationValue,
          isProFeatureDiscovery: banner.isProFeatureDiscovery,
        }),
        sortOrder: banner.sortOrder,
        isActive: banner.isActive,
        translations: bannerTranslations(banner),
      }}
      fields={bannerFields(mediaType)}
      onSubmit={(values) => {
        const changes: HomeBannerPatchChanges = {};
        const nextTitle = values.title.trim() === '' ? null : values.title;
        if (nextTitle !== banner.title) changes.title = nextTitle;
        if (translationsChanged(values.translations, bannerTranslations(banner)))
          changes.translations = values.translations;
        if (values.mediaUrl !== banner.mediaUrl) changes.mediaUrl = values.mediaUrl;
        if (mediaType === 'video' && values.thumbnailUrl !== banner.thumbnailUrl) {
          changes.thumbnailUrl = values.thumbnailUrl;
        }
        const dest = destinationToNullable(values.destination);
        if (dest.destinationType !== banner.destinationType) {
          changes.destinationType = dest.destinationType;
        }
        if (dest.destinationValue !== banner.destinationValue) {
          changes.destinationValue = dest.destinationValue;
        }
        const nextPro = resolveProDiscovery(values.destination);
        if (nextPro !== banner.isProFeatureDiscovery) {
          changes.isProFeatureDiscovery = nextPro;
        }
        if (values.sortOrder !== banner.sortOrder) changes.sortOrder = values.sortOrder;
        if (values.isActive !== banner.isActive) changes.isActive = values.isActive;
        return update.mutateAsync({
          id: banner.id,
          changes,
          expectedUpdatedAt: values.updatedAt as string,
        });
      }}
      onSuccess={onClose}
      onConflict={() => {
        void qc.invalidateQueries({ queryKey: adminKeys.detail('home-banner', banner.id) });
      }}
      onCancel={onClose}
    />
  );
}
