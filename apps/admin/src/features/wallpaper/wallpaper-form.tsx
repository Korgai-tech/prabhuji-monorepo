import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { EntityForm, type EntityFormField } from '@/components/entity-form/entity-form';
import { mediaField, IMAGE_TYPES, VIDEO_TYPES } from '@/components/media';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ApiError, errorMessage } from '@/lib/api-error';
import { adminKeys } from '@/lib/query-keys';

import {
  useCreateWallpaper,
  useUpdateWallpaper,
  useWallpaper,
  type WallpaperCreateBody,
  type WallpaperDetail,
  type WallpaperPatchBody,
} from './use-wallpapers';
import {
  WallpaperFormSchema,
  WALLPAPER_MEDIA_TYPES,
  type WallpaperFormValues,
  type WallpaperMediaTypeValue,
} from './wallpaper-schema';
import {
  deitySelectField,
  focalPointField,
  languagesField,
  safeAreaField,
  stringListField,
} from './wallpaper-fields';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  The wallpaper create/edit form — the CONDITIONAL `<EntityForm>` composition
 *  (TAM-97 §(c)). Copied from the deity exemplar (TAM-89) and extended for the
 *  `mediaType` discrimination.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── mediaType is create-only, and the form is DISCRIMINATED, not disabled ─────
 *  A `static` wallpaper has no meaningful video slot; a `live` one adds the
 *  video/live-asset slots. So the fields for the OTHER type are NOT rendered
 *  (§#PATH_DECISION), never merely disabled. On CREATE the editor picks
 *  `mediaType` from
 *  a selector OUTSIDE the form; changing it REMOUNTS `<EntityForm>` (`key`) with
 *  the correct field set. On EDIT `mediaType` is fixed (TAM-96 rejects it in
 *  PATCH — a flip silently invalidates the uploaded asset set), shown read-only
 *  with an explanation that offers "create a new one" instead.
 *
 * ── Five media uploads, each its own TAM-84 registry triple ───────────────────
 *  Under `{module:'wallpaper', entity:'wallpaper'}`: thumbnailUrl, previewImageUrl,
 *  fallbackStaticThumbnailUrl (images, 10 MB) and previewVideoUrl,
 *  liveWallpaperAssetUrl (video/mp4, 200 MB). `<MediaUploadField>` shows real
 *  progress on the 200 MB uploads. `liveWallpaperPackage` and `iconKey` are NOT
 *  uploads. `setCount` is shown read-only and NEVER submitted.
 *
 * ── Send only what changed (§#EXPORT_CRITICAL) ───────────────────────────────
 *  Five media fields = maximum exposure to the seeded-URL bug: an untouched
 *  (possibly seeded) URL is never re-sent. `slug`/`mediaType`/`setCount` are
 *  never in a PATCH.
 */

export type WallpaperFormState =
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | null;

// The five media-field renders — explicit `accept` because the client registry
// mirror in media-constraints.ts predates these triples (server allowlist is
// authoritative). Field names match TAM-84's `wallpaper.wallpaper.*` keys.
const THUMBNAIL = mediaField({ module: 'wallpaper', entity: 'wallpaper', field: 'thumbnailUrl', accept: IMAGE_TYPES });
const PREVIEW_IMAGE = mediaField({ module: 'wallpaper', entity: 'wallpaper', field: 'previewImageUrl', accept: IMAGE_TYPES });
const FALLBACK_THUMB = mediaField({ module: 'wallpaper', entity: 'wallpaper', field: 'fallbackStaticThumbnailUrl', accept: IMAGE_TYPES });
const PREVIEW_VIDEO = mediaField({ module: 'wallpaper', entity: 'wallpaper', field: 'previewVideoUrl', accept: VIDEO_TYPES });
const LIVE_ASSET = mediaField({ module: 'wallpaper', entity: 'wallpaper', field: 'liveWallpaperAssetUrl', accept: VIDEO_TYPES });

const DEITY_FIELD = deitySelectField();
const LANGUAGES_FIELD = languagesField();
const ANDROID_VERSIONS_FIELD = stringListField('e.g. 13');
const FOCAL_FIELD = focalPointField();
const SAFE_AREA_FIELD = safeAreaField();

export function WallpaperFormDialog({
  state,
  onClose,
}: {
  state: WallpaperFormState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditWallpaper id={state.id} onClose={onClose} />
        ) : (
          <CreateWallpaper onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Create ───────────────────────────────────────────────────────────────────

function emptyValues(mediaType: WallpaperMediaTypeValue): WallpaperFormValues {
  return {
    slug: '',
    title: '',
    mediaType,
    deitySlug: '',
    languages: [],
    thumbnailUrl: '',
    previewImageUrl: '',
    previewVideoUrl: '',
    liveWallpaperAssetUrl: '',
    liveWallpaperPackage: '',
    fallbackStaticThumbnailUrl: '',
    supportedAndroidVersions: [],
    altText: '',
    dominantColor: '',
    focalPoint: null,
    safeAreaMetadata: null,
    isActive: true,
  };
}

function CreateWallpaper({ onClose }: { onClose: () => void }) {
  const create = useCreateWallpaper();
  const [mediaType, setMediaType] = React.useState<WallpaperMediaTypeValue>('static');

  return (
    <>
      <DialogHeader>
        <DialogTitle>New wallpaper</DialogTitle>
        <DialogDescription>
          Choose the media type first — it decides which asset slots apply and
          cannot be changed after creation.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1">
        <label htmlFor="new-wallpaper-media-type" className="text-sm font-medium">
          Media type
        </label>
        <Select
          id="new-wallpaper-media-type"
          className="w-48"
          value={mediaType}
          onChange={(event) => setMediaType(event.target.value as WallpaperMediaTypeValue)}
        >
          {WALLPAPER_MEDIA_TYPES.map((type) => (
            <option key={type} value={type}>
              {type === 'static' ? 'Static' : 'Live'}
            </option>
          ))}
        </Select>
      </div>

      {/* REMOUNT when the media type flips so the discriminated field set (and
          its snapshot defaultValues) rebinds. */}
      <EntityForm<WallpaperFormValues>
        key={mediaType}
        mode="create"
        entityLabel="Wallpaper"
        schema={WallpaperFormSchema}
        defaultValues={emptyValues(mediaType)}
        fields={buildFields({ mode: 'create', mediaType })}
        onSubmit={(values) =>
          create.mutateAsync(toCreateBody(values)).catch(rethrowSlugConflict)
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

// ── Edit ─────────────────────────────────────────────────────────────────────

function EditWallpaper({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: wallpaper, isLoading, isError, error } = useWallpaper(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit wallpaper</DialogTitle>
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

  if (isError || !wallpaper) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit wallpaper</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this wallpaper</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{wallpaper.title}”</DialogTitle>
        <DialogDescription>
          Set count: <strong>{wallpaper.setCount}</strong> (read-only — it backs
          the Trending row and is never editable).
        </DialogDescription>
      </DialogHeader>

      {/* REMOUNT on `updatedAt` so the form rebinds to fresh data after an
          invalidation — `<EntityForm>` snapshots `defaultValues` on mount. */}
      <EditWallpaperForm key={wallpaper.updatedAt} wallpaper={wallpaper} onClose={onClose} />
    </>
  );
}

function EditWallpaperForm({
  wallpaper,
  onClose,
}: {
  wallpaper: WallpaperDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const update = useUpdateWallpaper();
  const initial = React.useMemo(() => detailToValues(wallpaper), [wallpaper]);

  return (
    <EntityForm<WallpaperFormValues>
      mode="edit"
      entityLabel="Wallpaper"
      schema={WallpaperFormSchema}
      updatedAt={wallpaper.updatedAt}
      defaultValues={initial}
      fields={buildFields({ mode: 'edit', mediaType: wallpaper.mediaType })}
      onSubmit={(values) =>
        update.mutateAsync({
          id: wallpaper.id,
          changes: diffChanges(initial, values),
          expectedUpdatedAt: values.updatedAt as string,
        })
      }
      onSuccess={onClose}
      onConflict={() => {
        void qc.invalidateQueries({ queryKey: adminKeys.detail('wallpaper', wallpaper.id) });
      }}
      onCancel={onClose}
    />
  );
}

// ── Field set (discriminated on mediaType) ────────────────────────────────────

function buildFields({
  mode,
  mediaType,
}: {
  mode: 'create' | 'edit';
  mediaType: WallpaperMediaTypeValue;
}): EntityFormField<WallpaperFormValues>[] {
  const fields: EntityFormField<WallpaperFormValues>[] = [
    {
      name: 'slug',
      label: 'Slug',
      type: 'text',
      required: mode === 'create',
      disabled: mode === 'edit',
      placeholder: 'ganesh-sunrise',
      description:
        mode === 'edit'
          ? 'Slug is a permanent reference key and cannot be changed.'
          : 'Lowercase letters, numbers and single hyphens. Permanent.',
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
        { label: 'Static', value: 'static' },
        { label: 'Live', value: 'live' },
      ],
      description:
        'Media type cannot be changed — it decides the asset set. To switch, create a new wallpaper.',
    });
  }

  fields.push(
    { name: 'thumbnailUrl', label: 'Thumbnail', type: 'custom', required: true, render: THUMBNAIL },
    { name: 'previewImageUrl', label: 'Preview image', type: 'custom', required: true, render: PREVIEW_IMAGE },
  );

  if (mediaType === 'live') {
    fields.push(
      {
        name: 'previewVideoUrl',
        label: 'Preview video',
        type: 'custom',
        required: true,
        render: PREVIEW_VIDEO,
        description: 'Looping preview clip (MP4, up to 200 MB).',
      },
      {
        name: 'liveWallpaperAssetUrl',
        label: 'Live wallpaper asset',
        type: 'custom',
        render: LIVE_ASSET,
        description: 'The device-set live asset (MP4, up to 200 MB). Optional if a package is set.',
      },
      {
        name: 'liveWallpaperPackage',
        label: 'Live wallpaper package',
        type: 'text',
        placeholder: 'com.example.wallpaper',
        description: 'An Android package name — NOT an upload.',
      },
      {
        name: 'fallbackStaticThumbnailUrl',
        label: 'Fallback static thumbnail',
        type: 'custom',
        render: FALLBACK_THUMB,
        description: 'Shown where the live wallpaper cannot play.',
      },
      {
        name: 'supportedAndroidVersions',
        label: 'Supported Android versions',
        type: 'custom',
        render: ANDROID_VERSIONS_FIELD,
      },
    );
  }

  fields.push(
    {
      name: 'deitySlug',
      label: 'Deity',
      type: 'custom',
      render: DEITY_FIELD,
      description: 'Choose a deity to tag this wallpaper, or leave as all-deity.',
    },
    {
      name: 'languages',
      label: 'Languages',
      type: 'custom',
      render: LANGUAGES_FIELD,
      description: 'Leave all unchecked for an all-language wallpaper.',
    },
    { name: 'altText', label: 'Alt text', type: 'text' },
    { name: 'dominantColor', label: 'Dominant colour', type: 'text', placeholder: '#1a2b3c' },
    { name: 'focalPoint', label: 'Focal point', type: 'custom', render: FOCAL_FIELD },
    { name: 'safeAreaMetadata', label: 'Safe-area insets', type: 'custom', render: SAFE_AREA_FIELD },
    { name: 'isActive', label: 'Active', type: 'switch' },
  );

  return fields;
}

// ── Payload builders ──────────────────────────────────────────────────────────

function toCreateBody(v: WallpaperFormValues): WallpaperCreateBody {
  const body: WallpaperCreateBody = {
    slug: v.slug,
    title: v.title.trim(),
    mediaType: v.mediaType,
    deitySlug: v.deitySlug === '' ? null : v.deitySlug,
    languages: v.languages,
    thumbnailUrl: v.thumbnailUrl,
    previewImageUrl: v.previewImageUrl,
    isActive: v.isActive,
  };
  if (v.altText.trim() !== '') body.altText = v.altText.trim();
  if (v.dominantColor !== '') body.dominantColor = v.dominantColor;
  if (v.focalPoint) body.focalPoint = v.focalPoint;
  if (v.safeAreaMetadata) body.safeAreaMetadata = v.safeAreaMetadata;

  if (v.mediaType === 'live') {
    body.previewVideoUrl = v.previewVideoUrl;
    if (v.liveWallpaperAssetUrl !== '') body.liveWallpaperAssetUrl = v.liveWallpaperAssetUrl;
    if (v.liveWallpaperPackage.trim() !== '') body.liveWallpaperPackage = v.liveWallpaperPackage.trim();
    if (v.fallbackStaticThumbnailUrl !== '') body.fallbackStaticThumbnailUrl = v.fallbackStaticThumbnailUrl;
    if (v.supportedAndroidVersions.length > 0) body.supportedAndroidVersions = v.supportedAndroidVersions;
  }
  return body;
}

function detailToValues(d: WallpaperDetail): WallpaperFormValues {
  return {
    slug: d.slug,
    title: d.title,
    mediaType: d.mediaType,
    deitySlug: d.deitySlug ?? '',
    languages: d.languages as WallpaperFormValues['languages'],
    thumbnailUrl: d.thumbnailUrl,
    previewImageUrl: d.previewImageUrl,
    previewVideoUrl: d.previewVideoUrl ?? '',
    liveWallpaperAssetUrl: d.liveWallpaperAssetUrl ?? '',
    liveWallpaperPackage: d.liveWallpaperPackage ?? '',
    fallbackStaticThumbnailUrl: d.fallbackStaticThumbnailUrl ?? '',
    supportedAndroidVersions: d.supportedAndroidVersions,
    altText: d.altText ?? '',
    dominantColor: d.dominantColor ?? '',
    focalPoint: d.focalPoint,
    safeAreaMetadata: d.safeAreaMetadata,
    isActive: d.isActive,
  };
}

/** SEND ONLY WHAT CHANGED (§#EXPORT_CRITICAL). Compares the submitted values to
 *  the loaded snapshot; an untouched (possibly seeded) media URL is never sent.
 *  Cleared optionals become `null`. `slug`/`mediaType`/`setCount` are never here. */
function diffChanges(
  initial: WallpaperFormValues,
  v: WallpaperFormValues,
): Omit<WallpaperPatchBody, 'expectedUpdatedAt'> {
  const c: Omit<WallpaperPatchBody, 'expectedUpdatedAt'> = {};
  if (v.title.trim() !== initial.title) c.title = v.title.trim();
  if (v.deitySlug !== initial.deitySlug) c.deitySlug = v.deitySlug === '' ? null : v.deitySlug;
  if (!sameArray(v.languages, initial.languages)) c.languages = v.languages;
  if (v.thumbnailUrl !== initial.thumbnailUrl) c.thumbnailUrl = v.thumbnailUrl;
  if (v.previewImageUrl !== initial.previewImageUrl) c.previewImageUrl = v.previewImageUrl;
  if (v.previewVideoUrl !== initial.previewVideoUrl)
    c.previewVideoUrl = v.previewVideoUrl === '' ? null : v.previewVideoUrl;
  if (v.liveWallpaperAssetUrl !== initial.liveWallpaperAssetUrl)
    c.liveWallpaperAssetUrl = v.liveWallpaperAssetUrl === '' ? null : v.liveWallpaperAssetUrl;
  if (v.fallbackStaticThumbnailUrl !== initial.fallbackStaticThumbnailUrl)
    c.fallbackStaticThumbnailUrl =
      v.fallbackStaticThumbnailUrl === '' ? null : v.fallbackStaticThumbnailUrl;
  if (v.liveWallpaperPackage !== initial.liveWallpaperPackage)
    c.liveWallpaperPackage = v.liveWallpaperPackage.trim() === '' ? null : v.liveWallpaperPackage.trim();
  if (v.altText !== initial.altText) c.altText = v.altText.trim() === '' ? null : v.altText.trim();
  if (v.dominantColor !== initial.dominantColor)
    c.dominantColor = v.dominantColor === '' ? null : v.dominantColor;
  if (!sameArray(v.supportedAndroidVersions, initial.supportedAndroidVersions))
    c.supportedAndroidVersions = v.supportedAndroidVersions;
  if (!sameJson(v.focalPoint, initial.focalPoint)) c.focalPoint = v.focalPoint;
  if (!sameJson(v.safeAreaMetadata, initial.safeAreaMetadata))
    c.safeAreaMetadata = v.safeAreaMetadata;
  if (v.isActive !== initial.isActive) c.isActive = v.isActive;
  return c;
}

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A create-time 409 `SLUG_CONFLICT` → a non-conflict `ApiError` so `<EntityForm>`
 *  surfaces the server's duplicate-slug message rather than its concurrency UX. */
function rethrowSlugConflict(error: unknown): never {
  if (error instanceof ApiError && error.errorCode === 'SLUG_CONFLICT') {
    throw new ApiError(error.message, 422, error.errorCode);
  }
  throw error;
}
