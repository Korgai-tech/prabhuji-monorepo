import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { EntityForm, type EntityFormField, type EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';
import { mediaField, IMAGE_TYPES, VIDEO_TYPES } from '@/components/media';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ApiError, errorMessage } from '@/lib/api-error';
import { adminKeys } from '@/lib/query-keys';

import {
  useCreateStatusItem,
  useStatusItem,
  useUpdateStatusItem,
  type StatusItemCreateBody,
  type StatusItemDetail,
  type StatusItemPatchBody,
} from './use-status-items';
import {
  StatusItemFormSchema,
  DEFAULT_SAFE_AREA,
  type StatusItemFormValues,
  type LanguageCode,
} from './status-schema';
import { safeAreaField } from './safe-area-field';
import { languageMultiSelect } from './language-multiselect';
import { deitySelect } from './deity-select';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  The StatusItem create/edit form — a TAM-97-shaped conditional `<EntityForm>`.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `mediaType` DISCRIMINATES the form (§(c), #PATH_DECISION):
 *   - it is create-only — chosen once (the Media-type selector on create), and
 *     read-only with an explanation on edit (the API rejects it in `PATCH` because
 *     a flip silently invalidates the uploaded assets);
 *   - the fields for the OTHER type are NOT RENDERED (not merely disabled): an
 *     `image` shows `imageUrl`; a `video` shows `videoUrl`.
 *
 * Three DISTINCT upload triples under `{module:"status", entity:"status-item"}`
 * (`imageUrl` / `videoUrl` / `thumbnailUrl`, TAM-84). `accept` is passed explicitly
 * because these fields are not in the media-constraints registry.
 *
 * The `overlaySafeArea` preview needs a SIBLING field's value (the uploaded image),
 * which a `type: 'custom'` render cannot see. So this component holds the preview
 * URL in state, wraps the relevant upload field's `onChange` to also update it, and
 * closes it into the safe-area field's render — the whole reason the safe area is
 * built here and not as a standalone field.
 */

export type StatusItemFormState =
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | null;

type MediaType = 'image' | 'video';

export function StatusItemFormDialog({
  state,
  onClose,
}: {
  state: StatusItemFormState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditStatusItem id={state.id} onClose={onClose} />
        ) : (
          <CreateStatusItem onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Field config, shared by create + edit ────────────────────────────────────

/** Wrap an upload field so a successful upload also updates the preview URL. */
function previewUpload(
  config: { field: 'imageUrl' | 'thumbnailUrl' | 'videoUrl'; accept: readonly string[] },
  onPreview: (url: string) => void,
) {
  const base = mediaField({
    module: 'status',
    entity: 'statusItem',
    field: config.field,
    accept: config.accept,
  });
  return function renderWithPreview(props: EntityFormFieldRenderProps) {
    return base({
      ...props,
      onChange: (value: unknown) => {
        props.onChange(value);
        onPreview(typeof value === 'string' ? value : '');
      },
    });
  };
}

function buildItemFields(opts: {
  mode: 'create' | 'edit';
  mediaType: MediaType;
  previewUrl: string;
  setPreviewUrl: (url: string) => void;
}): EntityFormField<StatusItemFormValues>[] {
  const { mode, mediaType, previewUrl, setPreviewUrl } = opts;
  const isImage = mediaType === 'image';
  const previewLabel = isImage ? 'image' : 'video thumbnail';

  const fields: EntityFormField<StatusItemFormValues>[] = [
    {
      name: 'slug',
      label: 'Slug',
      type: 'text',
      required: mode === 'create',
      disabled: mode === 'edit',
      placeholder: 'diwali-ganesh',
      description:
        mode === 'edit'
          ? 'Slug is a permanent reference key and cannot be changed.'
          : 'Lowercase letters, numbers and single hyphens. Permanent — cannot be changed later.',
    },
    { name: 'title', label: 'Title', type: 'text', required: true },
  ];

  if (mode === 'edit') {
    fields.push({
      name: 'mediaType',
      label: 'Media type',
      type: 'select',
      disabled: true,
      options: [
        { label: 'Image', value: 'image' },
        { label: 'Video', value: 'video' },
      ],
      description:
        'Media type is fixed after creation — changing it would invalidate the uploaded assets. Create a new status to change type.',
    });
  }

  // thumbnailUrl is always required (the free feed card art). For a VIDEO item it is
  // also the safe-area preview canvas (a video frame is not fetchable client-side).
  fields.push({
    name: 'thumbnailUrl',
    label: 'Thumbnail',
    type: 'custom',
    required: true,
    description: 'Shown as the feed card. Images only, max 10 MB.',
    render: isImage
      ? mediaField({ module: 'status', entity: 'statusItem', field: 'thumbnailUrl', accept: IMAGE_TYPES })
      : previewUpload({ field: 'thumbnailUrl', accept: IMAGE_TYPES }, setPreviewUrl),
  });

  if (isImage) {
    fields.push({
      name: 'imageUrl',
      label: 'Image',
      type: 'custom',
      required: true,
      description: 'The full status image. Images only, max 10 MB.',
      render: previewUpload({ field: 'imageUrl', accept: IMAGE_TYPES }, setPreviewUrl),
    });
  } else {
    fields.push({
      name: 'videoUrl',
      label: 'Video',
      type: 'custom',
      required: true,
      description: 'MP4 only, max 200 MB.',
      render: mediaField({ module: 'status', entity: 'statusItem', field: 'videoUrl', accept: VIDEO_TYPES }),
    });
  }

  fields.push(
    {
      name: 'deitySlug',
      label: 'Deity',
      type: 'custom',
      required: true,
      description: 'The status is tagged to one deity. Chosen from the taxonomy list.',
      render: deitySelect,
    },
    {
      name: 'languages',
      label: 'Languages',
      type: 'custom',
      render: languageMultiSelect,
    },
    {
      name: 'overlaySafeArea',
      label: 'Overlay safe area',
      type: 'custom',
      required: true,
      description:
        'Where the user’s name overlay may sit when this status is shared. Keep it clear of the deity’s face.',
      render: safeAreaField({ previewUrl: previewUrl || undefined, previewLabel }),
    },
    {
      name: 'shareCaption',
      label: 'Share caption',
      type: 'textarea',
      description: 'Optional caption suggested when a user shares this status.',
    },
    { name: 'isActive', label: 'Active', type: 'switch' },
  );

  return fields;
}

// ── Create ────────────────────────────────────────────────────────────────

function CreateStatusItem({ onClose }: { onClose: () => void }) {
  const create = useCreateStatusItem();
  const [mediaType, setMediaType] = React.useState<MediaType>('image');
  const [previewUrl, setPreviewUrl] = React.useState('');

  const fields = buildItemFields({ mode: 'create', mediaType, previewUrl, setPreviewUrl });

  return (
    <>
      <DialogHeader>
        <DialogTitle>New status</DialogTitle>
        <DialogDescription>
          Choose the media type first — it is permanent. The safe-area preview updates
          as you set the insets.
        </DialogDescription>
      </DialogHeader>

      <div className="grid max-w-2xl gap-1.5">
        <Label htmlFor="status-media-type">Media type</Label>
        <Select
          id="status-media-type"
          value={mediaType}
          onChange={(event) => {
            setMediaType(event.target.value as MediaType);
            setPreviewUrl('');
          }}
        >
          <option value="image">Image</option>
          <option value="video">Video</option>
        </Select>
        <p className="text-sm text-muted-foreground">
          Cannot be changed after creation — it determines which assets are required.
        </p>
      </div>

      {/* Remount when the media type changes so the required uploads reset cleanly. */}
      <EntityForm<StatusItemFormValues>
        key={mediaType}
        mode="create"
        entityLabel="Status"
        schema={StatusItemFormSchema}
        defaultValues={{
          slug: '',
          title: '',
          mediaType,
          deitySlug: '',
          languages: [],
          imageUrl: '',
          videoUrl: '',
          thumbnailUrl: '',
          overlaySafeArea: DEFAULT_SAFE_AREA,
          shareCaption: '',
          isActive: true,
        }}
        fields={fields}
        onSubmit={(values) => create.mutateAsync(toCreateBody(values)).catch(rethrowSlugConflict)}
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function toCreateBody(values: StatusItemFormValues): StatusItemCreateBody {
  const base: StatusItemCreateBody = {
    slug: values.slug,
    title: values.title,
    mediaType: values.mediaType,
    deitySlug: values.deitySlug,
    languages: values.languages,
    thumbnailUrl: values.thumbnailUrl,
    overlaySafeArea: values.overlaySafeArea,
    isActive: values.isActive,
  };
  if (values.mediaType === 'image') {
    base.imageUrl = values.imageUrl;
  } else {
    base.videoUrl = values.videoUrl;
  }
  if (values.shareCaption !== '') base.shareCaption = values.shareCaption;
  return base;
}

// ── Edit ──────────────────────────────────────────────────────────────────

function EditStatusItem({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: item, isLoading, isError, error } = useStatusItem(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit status</DialogTitle>
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

  if (isError || !item) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit status</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this status</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{item.slug}”</DialogTitle>
        <DialogDescription>
          Update the media, tags and overlay safe area. Only changed fields are saved.
        </DialogDescription>
      </DialogHeader>
      {/* REMOUNT on `updatedAt` so the form rebinds to fresh data after an invalidation. */}
      <EditStatusItemForm key={item.updatedAt} item={item} onClose={onClose} />
    </>
  );
}

function EditStatusItemForm({ item, onClose }: { item: StatusItemDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const update = useUpdateStatusItem();
  const mediaType: MediaType = item.mediaType;

  const initialPreview = mediaType === 'image' ? item.imageUrl ?? '' : item.thumbnailUrl;
  const [previewUrl, setPreviewUrl] = React.useState(initialPreview);

  const fields = buildItemFields({ mode: 'edit', mediaType, previewUrl, setPreviewUrl });

  return (
    <EntityForm<StatusItemFormValues>
      mode="edit"
      entityLabel="Status"
      schema={StatusItemFormSchema}
      updatedAt={item.updatedAt}
      defaultValues={{
        slug: item.slug,
        title: item.title,
        mediaType,
        deitySlug: item.deitySlug ?? '',
        languages: (item.languages as LanguageCode[]) ?? [],
        imageUrl: item.imageUrl ?? '',
        videoUrl: item.videoUrl ?? '',
        thumbnailUrl: item.thumbnailUrl,
        overlaySafeArea: item.overlaySafeArea,
        shareCaption: item.shareCaption ?? '',
        isActive: item.isActive,
      }}
      fields={fields}
      // SEND ONLY WHAT CHANGED — never re-send an untouched (possibly seeded) media
      // URL (it fails `validateOwnedUrl`), never send `slug`/`mediaType` (immutable).
      onSubmit={(values) =>
        update.mutateAsync({
          id: item.id,
          changes: diffItem(values, item),
          expectedUpdatedAt: values.updatedAt as string,
        })
      }
      onSuccess={onClose}
      onConflict={() => {
        void qc.invalidateQueries({ queryKey: adminKeys.detail('status-item', item.id) });
      }}
      onCancel={onClose}
    />
  );
}

type ItemChanges = Omit<StatusItemPatchBody, 'expectedUpdatedAt'>;

function nullify(value: string): string | null {
  return value === '' ? null : value;
}

function diffItem(values: StatusItemFormValues, item: StatusItemDetail): ItemChanges {
  const changes: ItemChanges = {};

  if (values.title !== item.title) changes.title = values.title;
  if (values.thumbnailUrl !== item.thumbnailUrl) changes.thumbnailUrl = values.thumbnailUrl;

  if (values.mediaType === 'image') {
    if (values.imageUrl !== (item.imageUrl ?? '')) changes.imageUrl = values.imageUrl;
  } else {
    if (values.videoUrl !== (item.videoUrl ?? '')) changes.videoUrl = values.videoUrl;
  }

  if (values.deitySlug !== (item.deitySlug ?? '')) changes.deitySlug = values.deitySlug;

  if (JSON.stringify(values.languages) !== JSON.stringify(item.languages)) {
    changes.languages = values.languages;
  }
  if (JSON.stringify(values.overlaySafeArea) !== JSON.stringify(item.overlaySafeArea)) {
    changes.overlaySafeArea = values.overlaySafeArea;
  }

  const caption = nullify(values.shareCaption);
  if (caption !== (item.shareCaption ?? null)) changes.shareCaption = caption;

  if (values.isActive !== item.isActive) changes.isActive = values.isActive;

  return changes;
}

/** A create-time duplicate slug is a 409; re-throw non-conflict so `<EntityForm>`
 *  shows the server's real "slug already exists" message, not its concurrency UX. */
function rethrowSlugConflict(error: unknown): never {
  if (error instanceof ApiError && error.isConflict) {
    throw new ApiError(error.message, 422, error.errorCode);
  }
  throw error;
}
