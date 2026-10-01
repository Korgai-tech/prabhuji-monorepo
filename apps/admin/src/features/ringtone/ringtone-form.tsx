import { useQueryClient } from '@tanstack/react-query';

import { EntityForm, type EntityFormField } from '@/components/entity-form/entity-form';
import { mediaField, IMAGE_TYPES } from '@/components/media';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ApiError, errorMessage } from '@/lib/api-error';
import { adminKeys } from '@/lib/query-keys';

import {
  useCreateRingtone,
  useRingtone,
  useUpdateRingtone,
  type RingtoneDetail,
  type RingtoneCreateBody,
  type RingtonePatchChanges,
  type RingtoneLanguage,
} from './use-ringtones';
import { RingtoneFormSchema, type RingtoneFormValues } from './ringtone-schema';
import { deitySelectField } from './deity-select';
import { languageMultiSelectField } from './language-multi-select';
import { tagInputField } from './tag-input';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  The ringtone create/edit form — a copy of the deity `<EntityForm>` exemplar,
 *  extended for the module's TWO media fields in TWO visibility classes.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── The defining requirement (§(c), #EXPORT_CRITICAL) ─────────────────────────
 *  The two media fields are NOT interchangeable and NOTHING about a media picker
 *  makes that obvious, so each is LABELLED IN TEXT with its visibility class
 *  (never colour-only):
 *    - `thumbnailImageUrl` — FREE   → shown to everyone in the grid + search;
 *    - `audioUrl`          — PRO    → nulled for free users.
 *  Each binds to its OWN `(module, entity, field)` triple (TAM-84's registry).
 *
 * ── Deity is a picker, never free text (§(d)) ────────────────────────────────
 *  Single, required, no FK — `<DeitySelect>` renders the admin deity list.
 *
 * ── Arrays on the row (§(e)) ─────────────────────────────────────────────────
 *  `tags` and `searchKeywords` are `string[]` COLUMNS edited as two SEPARATE
 *  `<TagInput>` chips; `languages` is a multi-select. None is a sub-resource.
 *
 * ── Read-only counters (§(c), TAM-94 AC (e)) ─────────────────────────────────
 *  `playCount`/`setCount` are shown as read-only TEXT below the edit form and
 *  are NEVER part of the payload — they are not `<EntityForm>` fields at all.
 *
 * ── Send only what changed (§#EXPORT_CRITICAL) ───────────────────────────────
 *  Edit diffs against the loaded row and PATCHes only moved fields. Re-sending a
 *  seeded media URL fails TAM-84's `validateOwnedUrl`. `slug` is create-only.
 */

export type RingtoneFormState =
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | null;

export function RingtoneFormDialog({
  state,
  onClose,
}: {
  state: RingtoneFormState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditRingtone id={state.id} onClose={onClose} />
        ) : (
          <CreateRingtone onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Media fields, each bound to its OWN triple + a visibility-class label ─────
const THUMBNAIL_FIELD = mediaField({
  module: 'ringtone',
  entity: 'ringtone',
  field: 'thumbnailImageUrl',
  accept: IMAGE_TYPES, // not in the registry mirror — pass the allowlist explicitly
});
const AUDIO_FIELD = mediaField({
  module: 'ringtone',
  entity: 'ringtone',
  field: 'audioUrl',
});

const DEITY_FIELD = deitySelectField();
const LANGUAGES_FIELD = languageMultiSelectField();
const TAGS_FIELD = tagInputField({ placeholder: 'Add a tag and press Enter…' });
const KEYWORDS_FIELD = tagInputField({ placeholder: 'Add a search term and press Enter…' });

/**
 * The fields shared by create + edit, in display order. `slug` is prepended per
 * mode (editable on create, disabled on edit) by the caller.
 */
const CONTENT_FIELDS: EntityFormField<RingtoneFormValues>[] = [
  { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'Ganesh Aarti Ringtone' },
  {
    name: 'deitySlug',
    label: 'Deity',
    type: 'custom',
    required: true,
    render: DEITY_FIELD,
    description: 'Pick from the deity list — never type a slug. Inactive deities are marked.',
  },
  {
    name: 'thumbnailImageUrl',
    label: 'Thumbnail image',
    type: 'custom',
    required: true,
    render: THUMBNAIL_FIELD,
    description: 'Shown to everyone in the grid and search (free).',
  },
  {
    name: 'audioUrl',
    label: 'Audio',
    type: 'custom',
    required: true,
    render: AUDIO_FIELD,
    description: 'Pro only — hidden from free users. MP3, up to 50 MB.',
  },
  {
    name: 'tags',
    label: 'Tags',
    type: 'custom',
    render: TAGS_FIELD,
    description: 'Free-text tags. Trimmed and de-duplicated as you add them.',
  },
  {
    name: 'searchKeywords',
    label: 'Search keywords',
    type: 'custom',
    render: KEYWORDS_FIELD,
    description: 'Curated search terms — distinct from tags. Trimmed and de-duplicated.',
  },
  {
    name: 'languages',
    label: 'Languages',
    type: 'custom',
    render: LANGUAGES_FIELD,
    description: 'Select the languages this ringtone belongs to. None = shown in all.',
  },
  { name: 'artistOrSource', label: 'Artist / source', type: 'text' },
  { name: 'deepLinkUrl', label: 'Deep link URL', type: 'url', placeholder: 'https://…' },
  { name: 'altText', label: 'Alt text', type: 'text' },
  { name: 'shareTitle', label: 'Share title', type: 'text' },
  { name: 'shareDescription', label: 'Share description', type: 'textarea' },
  { name: 'isActive', label: 'Active', type: 'switch' },
];

/** The form's empty defaults — every media/array/nullable field starts blank. */
const EMPTY_VALUES: RingtoneFormValues = {
  slug: '',
  title: '',
  deitySlug: '',
  thumbnailImageUrl: '',
  audioUrl: '',
  tags: [],
  searchKeywords: [],
  languages: [],
  artistOrSource: '',
  deepLinkUrl: '',
  altText: '',
  shareTitle: '',
  shareDescription: '',
  isActive: true,
};

function CreateRingtone({ onClose }: { onClose: () => void }) {
  const create = useCreateRingtone();

  return (
    <>
      <DialogHeader>
        <DialogTitle>New ringtone</DialogTitle>
        <DialogDescription>
          Upload two media files — a free thumbnail and Pro audio. The slug is a
          permanent reference key and cannot be changed later.
        </DialogDescription>
      </DialogHeader>

      <EntityForm<RingtoneFormValues>
        mode="create"
        entityLabel="Ringtone"
        schema={RingtoneFormSchema}
        defaultValues={EMPTY_VALUES}
        fields={[
          {
            name: 'slug',
            label: 'Slug',
            type: 'text',
            required: true,
            placeholder: 'ganesh-aarti',
            description:
              'Lowercase letters, numbers and single hyphens. Permanent — cannot be changed after creation.',
          },
          ...CONTENT_FIELDS,
        ]}
        onSubmit={(values) =>
          create.mutateAsync(toCreateBody(values)).catch(rethrowSlugConflict)
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditRingtone({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: ringtone, isLoading, isError, error } = useRingtone(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit ringtone</DialogTitle>
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

  if (isError || !ringtone) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit ringtone</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this ringtone</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{ringtone.title}”</DialogTitle>
        <DialogDescription>
          The audio is Pro-only; the thumbnail is shown to everyone. Only changed
          fields are saved.
        </DialogDescription>
      </DialogHeader>

      {/* Read-only, server-authoritative counters — displayed, NEVER submitted. */}
      <ReadOnlyCounters ringtone={ringtone} />

      {/* REMOUNT on `updatedAt` so the form rebinds to fresh data after an
          invalidation — `<EntityForm>` snapshots `defaultValues` on mount. */}
      <EditRingtoneForm key={ringtone.updatedAt} ringtone={ringtone} onClose={onClose} />
    </>
  );
}

function ReadOnlyCounters({ ringtone }: { ringtone: RingtoneDetail }) {
  return (
    <dl className="flex gap-6 rounded-md border bg-muted/40 px-4 py-3 text-sm">
      <div className="grid gap-0.5">
        <dt className="text-xs text-muted-foreground">Play count</dt>
        <dd className="font-medium tabular-nums">{ringtone.playCount}</dd>
      </div>
      <div className="grid gap-0.5">
        <dt className="text-xs text-muted-foreground">Set count</dt>
        <dd className="font-medium tabular-nums">{ringtone.setCount}</dd>
      </div>
      <p className="ml-auto self-center text-xs text-muted-foreground">
        Engagement counters — read-only.
      </p>
    </dl>
  );
}

function EditRingtoneForm({
  ringtone,
  onClose,
}: {
  ringtone: RingtoneDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const update = useUpdateRingtone();

  return (
    <EntityForm<RingtoneFormValues>
      mode="edit"
      entityLabel="Ringtone"
      schema={RingtoneFormSchema}
      updatedAt={ringtone.updatedAt}
      defaultValues={toFormValues(ringtone)}
      fields={[
        {
          name: 'slug',
          label: 'Slug',
          type: 'text',
          disabled: true,
          description: 'Slug is a permanent reference key and cannot be changed.',
        },
        ...CONTENT_FIELDS,
      ]}
      // SEND ONLY WHAT CHANGED — never re-send an untouched (possibly seeded)
      // media URL, never send slug or the counters (§#EXPORT_CRITICAL).
      onSubmit={(values) => {
        const changes = diffChanges(ringtone, values);
        return update.mutateAsync({
          id: ringtone.id,
          changes,
          expectedUpdatedAt: values.updatedAt as string,
        });
      }}
      onSuccess={onClose}
      onConflict={() => {
        void qc.invalidateQueries({ queryKey: adminKeys.detail('ringtone', ringtone.id) });
      }}
      onCancel={onClose}
    />
  );
}

// ── Value mapping helpers ─────────────────────────────────────────────────────

/** Empty text ⇒ `null` for the API's nullable optional fields. */
function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** The loaded row → the form's value shape (nullables become empty strings). */
function toFormValues(r: RingtoneDetail): RingtoneFormValues {
  return {
    slug: r.slug,
    title: r.title,
    deitySlug: r.deitySlug,
    thumbnailImageUrl: r.thumbnailImageUrl,
    audioUrl: r.audioUrl,
    tags: r.tags,
    searchKeywords: r.searchKeywords,
    languages: r.languages as RingtoneLanguage[],
    artistOrSource: r.artistOrSource ?? '',
    deepLinkUrl: r.deepLinkUrl ?? '',
    altText: r.altText ?? '',
    shareTitle: r.shareTitle ?? '',
    shareDescription: r.shareDescription ?? '',
    isActive: r.isActive,
  };
}

/** The form's values → the full create body (nullables normalised). */
function toCreateBody(values: RingtoneFormValues): RingtoneCreateBody {
  return {
    slug: values.slug,
    title: values.title.trim(),
    deitySlug: values.deitySlug,
    thumbnailImageUrl: values.thumbnailImageUrl,
    audioUrl: values.audioUrl,
    tags: values.tags,
    searchKeywords: values.searchKeywords,
    languages: values.languages,
    artistOrSource: emptyToNull(values.artistOrSource ?? ''),
    deepLinkUrl: emptyToNull(values.deepLinkUrl ?? ''),
    altText: emptyToNull(values.altText ?? ''),
    shareTitle: emptyToNull(values.shareTitle ?? ''),
    shareDescription: emptyToNull(values.shareDescription ?? ''),
    isActive: values.isActive,
  };
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

/** Diff the edited values against the loaded row; PATCH only what moved. */
function diffChanges(r: RingtoneDetail, values: RingtoneFormValues): RingtonePatchChanges {
  const changes: RingtonePatchChanges = {};
  if (values.title.trim() !== r.title) changes.title = values.title.trim();
  if (values.deitySlug !== r.deitySlug) changes.deitySlug = values.deitySlug;
  if (values.thumbnailImageUrl !== r.thumbnailImageUrl)
    changes.thumbnailImageUrl = values.thumbnailImageUrl;
  if (values.audioUrl !== r.audioUrl) changes.audioUrl = values.audioUrl;
  if (!arraysEqual(values.tags, r.tags)) changes.tags = values.tags;
  if (!arraysEqual(values.searchKeywords, r.searchKeywords))
    changes.searchKeywords = values.searchKeywords;
  if (!arraysEqual(values.languages, r.languages)) changes.languages = values.languages;

  const artistOrSource = emptyToNull(values.artistOrSource ?? '');
  if (artistOrSource !== r.artistOrSource) changes.artistOrSource = artistOrSource;
  const deepLinkUrl = emptyToNull(values.deepLinkUrl ?? '');
  if (deepLinkUrl !== r.deepLinkUrl) changes.deepLinkUrl = deepLinkUrl;
  const altText = emptyToNull(values.altText ?? '');
  if (altText !== r.altText) changes.altText = altText;
  const shareTitle = emptyToNull(values.shareTitle ?? '');
  if (shareTitle !== r.shareTitle) changes.shareTitle = shareTitle;
  const shareDescription = emptyToNull(values.shareDescription ?? '');
  if (shareDescription !== r.shareDescription) changes.shareDescription = shareDescription;

  if (values.isActive !== r.isActive) changes.isActive = values.isActive;
  return changes;
}

/**
 * Turn a create-time 409 `SLUG_CONFLICT` into a non-conflict `ApiError` so
 * `<EntityForm>` surfaces the server's real duplicate-slug message rather than
 * its generic "modified by someone else" concurrency UX (§(b)).
 */
function rethrowSlugConflict(error: unknown): never {
  if (error instanceof ApiError && error.errorCode === 'SLUG_CONFLICT') {
    throw new ApiError(error.message, 422, error.errorCode);
  }
  throw error;
}
