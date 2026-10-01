import { useQueryClient } from '@tanstack/react-query';

import { EntityForm } from '@/components/entity-form/entity-form';
import type { EntityFormField } from '@/components/entity-form/entity-form';
import { mediaField, IMAGE_TYPES, AUDIO_TYPES } from '@/components/media';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api-error';
import { adminKeys } from '@/lib/query-keys';

import {
  useAartiItem,
  useCreateItem,
  useUpdateItem,
  type ItemDetail,
  type LanguageCode,
} from './use-aarti';
import { ItemFormSchema, nullableText, type ItemFormValues } from './aarti-schema';
import { deitySelectField, languagesField } from './fields';
import { CategoryTagsEditor } from './category-tags-editor';
import { rethrowCreateConflict } from './rethrow-create-conflict';

/**
 * The Aarti item create/edit form (TAM-91 §(b)).
 *
 *  - `slug` is create-only; on edit it is disabled and never PATCHed.
 *  - `coverImageUrl` (image) + `audioStreamUrl` (audio/mpeg, 50 MB) upload via
 *    `<MediaUploadField>`. `audioStreamUrl` is shown IN FULL to the admin — that
 *    is intended (ADR C1); admin reads are ungated.
 *  - `deitySlug` is a SINGLE deity picker; `languages` is a multiselect over the
 *    8 codes (empty = all) — the two fields unique to this content model (TAM-108).
 *  - `playCount` is server-authoritative — shown as READ-ONLY TEXT on the edit
 *    view (not an input) and NEVER submitted (§(b), #EXPORT_CRITICAL).
 *  - `categoryTags` save via a SEPARATE `PUT` on the edit view (set-semantics).
 *  - On edit, only CHANGED fields are PATCHed — a seeded SoundHelix/picsum URL
 *    re-sent unchanged fails `validateOwnedUrl` (§#EXPORT_CRITICAL, worst here).
 */

export type ItemFormState = { kind: 'create' } | { kind: 'edit'; id: string } | null;

const COVER_FIELD = mediaField({
  module: 'aarti',
  entity: 'audioItem',
  field: 'coverImageUrl',
  accept: IMAGE_TYPES,
});
const AUDIO_FIELD = mediaField({
  module: 'aarti',
  entity: 'audioItem',
  field: 'audioStreamUrl',
  accept: AUDIO_TYPES,
});
const DEITY_FIELD = deitySelectField();
const LANGUAGES_FIELD = languagesField();

export function ItemFormDialog({
  state,
  onClose,
}: {
  state: ItemFormState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditItem id={state.id} onClose={onClose} />
        ) : (
          <CreateItem onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateItem({ onClose }: { onClose: () => void }) {
  const create = useCreateItem();

  return (
    <>
      <DialogHeader>
        <DialogTitle>New audio item</DialogTitle>
        <DialogDescription>
          Upload the cover art and audio, pick a deity, and choose the languages
          it is available in (leave all unchecked for “all languages”). Category
          tags are added after saving.
        </DialogDescription>
      </DialogHeader>

      <EntityForm<ItemFormValues>
        mode="create"
        entityLabel="Item"
        schema={ItemFormSchema}
        defaultValues={{
          slug: '',
          title: '',
          coverImageUrl: '',
          audioStreamUrl: '',
          singerName: '',
          composerNames: '',
          deitySlug: '',
          languages: [],
          description: '',
          publishedAt: '',
          isFeatured: false,
          isPrabhujiOriginal: false,
          isActive: true,
        }}
        fields={ITEM_FIELDS}
        onSubmit={(values) =>
          create
            .mutateAsync({
              slug: values.slug,
              title: values.title,
              coverImageUrl: values.coverImageUrl,
              audioStreamUrl: values.audioStreamUrl,
              singerName: nullableText(values.singerName),
              composerNames: nullableText(values.composerNames),
              deitySlug: values.deitySlug,
              languages: values.languages,
              description: nullableText(values.description),
              publishedAt: nullableText(values.publishedAt),
              isFeatured: values.isFeatured,
              isPrabhujiOriginal: values.isPrabhujiOriginal,
              isActive: values.isActive,
            })
            .catch(rethrowCreateConflict)
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditItem({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: item, isLoading, isError, error } = useAartiItem(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit item</DialogTitle>
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
          <DialogTitle>Edit item</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this item</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{item.title}”</DialogTitle>
        <DialogDescription>
          The audio URL is shown in full — that is intended; admin reads are not
          Pro-gated. The play count is read-only.
        </DialogDescription>
      </DialogHeader>

      {/* READ-ONLY, server-authoritative — text, never an input; never submitted. */}
      <p className="text-sm text-muted-foreground">
        Play count:{' '}
        <span className="font-medium text-foreground">{item.playCount.toLocaleString()}</span>
      </p>

      {/* REMOUNT on `updatedAt` so the form rebinds to fresh data. */}
      <EditItemForm key={item.updatedAt} item={item} onClose={onClose} />

      <div className="border-t pt-4">
        <CategoryTagsEditor key={item.updatedAt} item={item} />
      </div>
    </>
  );
}

function EditItemForm({ item, onClose }: { item: ItemDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const update = useUpdateItem();

  return (
    <EntityForm<ItemFormValues>
      mode="edit"
      entityLabel="Item"
      schema={ItemFormSchema}
      updatedAt={item.updatedAt}
      defaultValues={{
        slug: item.slug,
        title: item.title,
        coverImageUrl: item.coverImageUrl,
        audioStreamUrl: item.audioStreamUrl,
        singerName: item.singerName ?? '',
        composerNames: item.composerNames ?? '',
        deitySlug: item.deitySlug ?? '',
        languages: item.languages as LanguageCode[],
        description: item.description ?? '',
        publishedAt: item.publishedAt ?? '',
        isFeatured: item.isFeatured,
        isPrabhujiOriginal: item.isPrabhujiOriginal,
        isActive: item.isActive,
      }}
      fields={ITEM_FIELDS.map((field) =>
        field.name === 'slug'
          ? {
              ...field,
              disabled: true,
              description: 'The slug is a permanent reference key and cannot be changed.',
            }
          : field,
      )}
      // SEND ONLY WHAT CHANGED (§#EXPORT_CRITICAL) — never re-send an untouched
      // (possibly seeded) media URL, never send `slug` or `playCount`.
      onSubmit={(values) => {
        const changes: {
          title?: string;
          coverImageUrl?: string;
          audioStreamUrl?: string;
          singerName?: string | null;
          composerNames?: string | null;
          deitySlug?: string;
          languages?: LanguageCode[];
          description?: string | null;
          publishedAt?: string | null;
          isFeatured?: boolean;
          isPrabhujiOriginal?: boolean;
          isActive?: boolean;
        } = {};
        if (values.title !== item.title) changes.title = values.title;
        if (values.coverImageUrl !== item.coverImageUrl)
          changes.coverImageUrl = values.coverImageUrl;
        if (values.audioStreamUrl !== item.audioStreamUrl)
          changes.audioStreamUrl = values.audioStreamUrl;
        if (nullableText(values.singerName) !== (item.singerName ?? null))
          changes.singerName = nullableText(values.singerName);
        if (nullableText(values.composerNames) !== (item.composerNames ?? null))
          changes.composerNames = nullableText(values.composerNames);
        if (values.deitySlug !== (item.deitySlug ?? '')) changes.deitySlug = values.deitySlug;
        if (!sameCodes(values.languages, item.languages)) changes.languages = values.languages;
        if (nullableText(values.description) !== (item.description ?? null))
          changes.description = nullableText(values.description);
        if (nullableText(values.publishedAt) !== (item.publishedAt ?? null))
          changes.publishedAt = nullableText(values.publishedAt);
        if (values.isFeatured !== item.isFeatured) changes.isFeatured = values.isFeatured;
        if (values.isPrabhujiOriginal !== item.isPrabhujiOriginal)
          changes.isPrabhujiOriginal = values.isPrabhujiOriginal;
        if (values.isActive !== item.isActive) changes.isActive = values.isActive;
        return update.mutateAsync({
          id: item.id,
          changes,
          expectedUpdatedAt: values.updatedAt as string,
        });
      }}
      onSuccess={onClose}
      onConflict={() => {
        void qc.invalidateQueries({ queryKey: adminKeys.detail('aarti-item', item.id) });
      }}
      onCancel={onClose}
    />
  );
}

/** Order-independent equality for the languages array. */
function sameCodes(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((code) => set.has(code));
}

const ITEM_FIELDS = [
  {
    name: 'slug',
    label: 'Slug',
    type: 'text',
    required: true,
    placeholder: 'ganesh-aarti',
    description:
      'Lowercase letters, numbers and single hyphens. Permanent — cannot be changed after creation.',
  },
  { name: 'title', label: 'Title', type: 'text', required: true },
  {
    name: 'coverImageUrl',
    label: 'Cover image',
    type: 'custom',
    required: true,
    render: COVER_FIELD,
  },
  {
    name: 'audioStreamUrl',
    label: 'Audio (MP3)',
    type: 'custom',
    required: true,
    render: AUDIO_FIELD,
    description: 'Shown in full to admins; the Pro gate applies only to the app’s users.',
  },
  { name: 'singerName', label: 'Singer', type: 'text' },
  { name: 'composerNames', label: 'Composer(s)', type: 'text' },
  {
    name: 'deitySlug',
    label: 'Deity',
    type: 'custom',
    required: true,
    render: DEITY_FIELD,
    description: 'Pick one deity. Deactivated deities are shown, marked “inactive”.',
  },
  {
    name: 'languages',
    label: 'Languages',
    type: 'custom',
    render: LANGUAGES_FIELD,
    description: 'Leave all unchecked for “all languages”.',
  },
  { name: 'description', label: 'Description', type: 'textarea' },
  {
    name: 'publishedAt',
    label: 'Published at',
    type: 'text',
    placeholder: '2026-01-01T00:00:00.000Z',
    description: 'ISO 8601 timestamp. Leave blank if unpublished.',
  },
  { name: 'isFeatured', label: 'Featured', type: 'switch' },
  { name: 'isPrabhujiOriginal', label: 'Prabhuji original', type: 'switch' },
  { name: 'isActive', label: 'Active', type: 'switch' },
] satisfies EntityFormField<ItemFormValues>[];
