import { useQueryClient } from '@tanstack/react-query';

import {
  EntityForm,
  type EntityFormField,
} from '@/components/entity-form/entity-form';
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
  useCreateMantraItem,
  useMantraItem,
  useUpdateMantraItem,
  useSetMantraCategoryTags,
  type MantraItemDetail,
  type MantraItemChanges,
} from './use-mantra-items';
import { useMantraCategoryOptions } from './use-mantra-categories';
import { useDeityOptions } from './use-deity-options';
import { MantraItemFormSchema, type MantraItemFormValues, MANTRA_TYPE_OPTIONS } from './mantra-schemas';
import {
  languagesField,
  categoriesField,
  type CategoryOption,
} from './item-fields';
import { rethrowDuplicateConflict } from './conflict';

/**
 * Mantra audio-item create/edit form — the module's richest `<EntityForm>`.
 * Mirrors the taxonomy EXEMPLAR plus module specifics:
 *
 *  - two `<MediaUploadField>` uploads (artwork image 10 MB, audio MP3 50 MB);
 *  - `mantraText` / `transliterationText` are `<textarea>` and NEVER trimmed or
 *    normalized (AC (c)) — the value round-trips byte-for-byte;
 *  - `type` is a select (`mantra | stuti`), never free text;
 *  - a SINGLE nullable `deitySlug` picked from the deity list (never typed);
 *  - a MULTI `languages[]` checkbox group (empty = all);
 *  - category tags saved via TAM-92's PUT set-semantics after the item write;
 *  - `playCount` is a server counter — shown read-only on edit, NEVER submitted.
 */

export type MantraItemFormState =
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | null;

const ARTWORK_FIELD = mediaField({
  module: 'mantras',
  entity: 'mantraAudioItem',
  field: 'artworkUrl',
  accept: IMAGE_TYPES,
});
const AUDIO_FIELD = mediaField({
  module: 'mantras',
  entity: 'mantraAudioItem',
  field: 'audioUrl',
  accept: AUDIO_TYPES,
});

export function MantraItemFormDialog({
  state,
  onClose,
}: {
  state: MantraItemFormState;
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

/** Build the field config. Deity options come from the picker (never typed). */
function buildFields(
  mode: 'create' | 'edit',
  deityOptions: { value: string; label: string }[],
  categoryOptions: CategoryOption[],
): EntityFormField<MantraItemFormValues>[] {
  return [
    {
      name: 'slug',
      label: 'Slug',
      type: 'text',
      required: mode === 'create',
      disabled: mode === 'edit',
      placeholder: 'gayatri-mantra',
      description:
        mode === 'edit'
          ? 'Slug is referenced by the app and cannot be changed.'
          : 'Lowercase letters, numbers and single hyphens. Permanent.',
    },
    { name: 'title', label: 'Title', type: 'text', required: true },
    {
      name: 'type',
      label: 'Type',
      type: 'select',
      required: true,
      placeholder: 'Select a type…',
      options: MANTRA_TYPE_OPTIONS,
    },
    {
      name: 'artworkUrl',
      label: 'Artwork',
      type: 'custom',
      required: true,
      render: ARTWORK_FIELD,
      description: 'PNG, WEBP or JPEG, up to 10 MB.',
    },
    {
      name: 'audioUrl',
      label: 'Audio',
      type: 'custom',
      required: true,
      render: AUDIO_FIELD,
      description:
        'MP3, up to 50 MB. The URL is a public CDN link — the Pro flag controls who is TOLD the URL, not who can fetch it.',
    },
    {
      name: 'mantraText',
      label: 'Mantra text (Devanagari)',
      type: 'textarea',
      required: true,
      description:
        'Scripture — line breaks, blank lines and spacing are preserved exactly as entered.',
    },
    {
      name: 'transliterationText',
      label: 'Transliteration',
      type: 'textarea',
      description: 'Optional. Whitespace is preserved.',
    },
    {
      name: 'deitySlug',
      label: 'Deity',
      type: 'select',
      placeholder: '— No deity —',
      options: deityOptions,
      description: 'Pick from the deity list — a typed slug has no reference and vanishes from filters.',
    },
    {
      name: 'languages',
      label: 'Languages',
      type: 'custom',
      render: languagesField(),
      description: 'Leave all unchecked to make it available in every language.',
    },
    {
      name: 'categories',
      label: 'Categories',
      type: 'custom',
      render: categoriesField(categoryOptions),
    },
    { name: 'singerName', label: 'Singer', type: 'text' },
    { name: 'composerName', label: 'Composer', type: 'text' },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'isFeatured', label: 'Featured', type: 'switch' },
    { name: 'isActive', label: 'Active', type: 'switch' },
  ];
}

/** `null`-safe map from a form string to the `| null` the API body wants. */
function orNull(value: string): string | null {
  return value === '' ? null : value;
}

function useOptions() {
  const deities = useDeityOptions();
  const categories = useMantraCategoryOptions();
  const deityOptions = (deities.data ?? []).map((d) => ({ value: d.slug, label: d.label }));
  const categoryOptions: CategoryOption[] = (categories.data?.items ?? []).map((c) => ({
    id: c.id,
    label: c.isActive ? c.displayName : `${c.displayName} (inactive)`,
  }));
  return {
    deityOptions,
    categoryOptions,
    isLoading: deities.isLoading || categories.isLoading,
  };
}

function CreateItem({ onClose }: { onClose: () => void }) {
  const create = useCreateMantraItem();
  const setTags = useSetMantraCategoryTags();
  const { deityOptions, categoryOptions, isLoading } = useOptions();

  if (isLoading) return <FormSkeleton title="New mantra item" />;

  return (
    <>
      <DialogHeader>
        <DialogTitle>New mantra item</DialogTitle>
        <DialogDescription>
          The slug is a permanent reference key. Upload artwork and audio, then
          enter the mantra text — its whitespace is preserved exactly.
        </DialogDescription>
      </DialogHeader>

      <EntityForm<MantraItemFormValues>
        mode="create"
        entityLabel="Item"
        schema={MantraItemFormSchema}
        defaultValues={{
          slug: '',
          title: '',
          type: 'mantra',
          artworkUrl: '',
          audioUrl: '',
          singerName: '',
          composerName: '',
          mantraText: '',
          transliterationText: '',
          deitySlug: '',
          languages: [],
          categories: [],
          description: '',
          isFeatured: false,
          isActive: true,
        }}
        fields={buildFields('create', deityOptions, categoryOptions)}
        onSubmit={async (values) => {
          const created = await create
            .mutateAsync({
              slug: values.slug,
              title: values.title,
              type: values.type,
              artworkUrl: values.artworkUrl,
              audioUrl: values.audioUrl,
              singerName: orNull(values.singerName),
              composerName: orNull(values.composerName),
              // Scripture — submitted verbatim, NO trim/normalize (AC (c)).
              mantraText: values.mantraText,
              transliterationText: orNull(values.transliterationText),
              deitySlug: orNull(values.deitySlug),
              languages: values.languages,
              description: orNull(values.description),
              deepLinkUrl: null,
              publishedAt: null,
              isFeatured: values.isFeatured,
              isActive: values.isActive,
            })
            .catch(rethrowDuplicateConflict);
          if (values.categories.length > 0) {
            await setTags.mutateAsync({ id: created.id, categoryIds: values.categories });
          }
          return created;
        }}
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditItem({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: item, isLoading, isError, error } = useMantraItem(id);
  const options = useOptions();

  if (isLoading || options.isLoading) return <FormSkeleton title="Edit mantra item" />;

  if (isError || !item) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit mantra item</DialogTitle>
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
          Play count: {item.playCount.toLocaleString()} (read-only). Category tags
          save via set-semantics.
        </DialogDescription>
      </DialogHeader>
      {/* REMOUNT on `updatedAt` so the form rebinds after an invalidation. */}
      <EditItemForm
        key={item.updatedAt}
        item={item}
        deityOptions={options.deityOptions}
        categoryOptions={options.categoryOptions}
        onClose={onClose}
      />
    </>
  );
}

function EditItemForm({
  item,
  deityOptions,
  categoryOptions,
  onClose,
}: {
  item: MantraItemDetail;
  deityOptions: { value: string; label: string }[];
  categoryOptions: CategoryOption[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const update = useUpdateMantraItem();
  const setTags = useSetMantraCategoryTags();

  const initialCategories = [...item.categoryIds].sort();

  return (
    <EntityForm<MantraItemFormValues>
      mode="edit"
      entityLabel="Item"
      schema={MantraItemFormSchema}
      updatedAt={item.updatedAt}
      defaultValues={{
        slug: item.slug,
        title: item.title,
        type: item.type,
        artworkUrl: item.artworkUrl,
        audioUrl: item.audioUrl,
        singerName: item.singerName ?? '',
        composerName: item.composerName ?? '',
        mantraText: item.mantraText,
        transliterationText: item.transliterationText ?? '',
        deitySlug: item.deitySlug ?? '',
        languages: item.languages as MantraItemFormValues['languages'],
        categories: item.categoryIds,
        description: item.description ?? '',
        isFeatured: item.isFeatured,
        isActive: item.isActive,
      }}
      fields={buildFields('edit', deityOptions, categoryOptions)}
      // SEND ONLY WHAT CHANGED — a re-sent seeded audioUrl fails validateOwnedUrl
      // (§#EXPORT_CRITICAL). Never send slug; never send playCount.
      onSubmit={async (values) => {
        const changes: MantraItemChanges = {};
        if (values.title !== item.title) changes.title = values.title;
        if (values.type !== item.type) changes.type = values.type;
        if (values.artworkUrl !== item.artworkUrl) changes.artworkUrl = values.artworkUrl;
        if (values.audioUrl !== item.audioUrl) changes.audioUrl = values.audioUrl;
        if (orNull(values.singerName) !== (item.singerName ?? null))
          changes.singerName = orNull(values.singerName);
        if (orNull(values.composerName) !== (item.composerName ?? null))
          changes.composerName = orNull(values.composerName);
        // Byte-exact comparison — no trim (AC (c)).
        if (values.mantraText !== item.mantraText) changes.mantraText = values.mantraText;
        if (orNull(values.transliterationText) !== (item.transliterationText ?? null))
          changes.transliterationText = orNull(values.transliterationText);
        if (orNull(values.deitySlug) !== (item.deitySlug ?? null))
          changes.deitySlug = orNull(values.deitySlug);
        if (!sameSet(values.languages, item.languages))
          changes.languages = values.languages;
        if (orNull(values.description) !== (item.description ?? null))
          changes.description = orNull(values.description);
        if (values.isFeatured !== item.isFeatured) changes.isFeatured = values.isFeatured;
        if (values.isActive !== item.isActive) changes.isActive = values.isActive;

        if (Object.keys(changes).length > 0) {
          await update.mutateAsync({
            id: item.id,
            changes,
            expectedUpdatedAt: values.updatedAt as string,
          });
        }
        // Category tags — a separate PUT set-semantics write (whole array).
        const nextCategories = [...values.categories].sort();
        if (!sameSet(nextCategories, initialCategories)) {
          await setTags.mutateAsync({ id: item.id, categoryIds: values.categories });
        }
      }}
      onSuccess={onClose}
      onConflict={() => {
        void qc.invalidateQueries({ queryKey: adminKeys.detail('mantra-item', item.id) });
      }}
      onCancel={onClose}
    />
  );
}

/** Order-insensitive set equality for the multiselect arrays. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((value) => set.has(value));
}

function FormSkeleton({ title }: { title: string }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
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
