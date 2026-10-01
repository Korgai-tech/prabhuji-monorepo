import { useQueryClient } from '@tanstack/react-query';

import { EntityForm } from '@/components/entity-form/entity-form';
import { mediaField, IMAGE_TYPES } from '@/components/media';
import { translationsField, translationsChanged } from '@/components/translations';
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
  useCreateMantraCategory,
  useMantraCategory,
  useUpdateMantraCategory,
  type MantraCategoryChanges,
  type MantraCategoryDetail,
} from './use-mantra-categories';
import {
  MantraCategoryFormSchema,
  type MantraCategoryFormValues,
} from './mantra-schemas';
import { rethrowDuplicateConflict } from './conflict';

/**
 * Mantra category create/edit form — an `<EntityForm>` composition mirroring the
 * taxonomy EXEMPLAR (`features/taxonomy/deity-form.tsx`). `slug` is create-only
 * (immutable business key); `imageUrl` uploads via `<MediaUploadField>`; edit
 * REMOUNTS on `updatedAt` and PATCHes only changed fields.
 */

export type MantraCategoryFormState =
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | null;

// TAM-84 registry: `mantras.mantraCategory.imageUrl` → images, 10 MB. `accept`
// is passed explicitly (the client mirror in media-constraints.ts is not this
// module's to edit from a worktree).
const IMAGE_FIELD = mediaField({
  module: 'mantras',
  entity: 'mantraCategory',
  field: 'imageUrl',
  accept: IMAGE_TYPES,
});

export function MantraCategoryFormDialog({
  state,
  onClose,
}: {
  state: MantraCategoryFormState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditCategory id={state.id} onClose={onClose} />
        ) : (
          <CreateCategory onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

const FIELDS = (mode: 'create' | 'edit') =>
  [
    {
      name: 'slug' as const,
      label: 'Slug',
      type: 'text' as const,
      required: mode === 'create',
      disabled: mode === 'edit',
      placeholder: 'morning-mantras',
      description:
        mode === 'edit'
          ? 'Slug is referenced by the app and cannot be changed.'
          : 'Lowercase letters, numbers and single hyphens. Permanent — cannot be changed later.',
    },
    { name: 'displayName' as const, label: 'Display name', type: 'text' as const, required: true },
    {
      name: 'imageUrl' as const,
      label: 'Image',
      type: 'custom' as const,
      render: IMAGE_FIELD,
      description: 'PNG, WEBP or JPEG, up to 10 MB. Optional.',
    },
    {
      name: 'backgroundColorToken' as const,
      label: 'Background colour token',
      type: 'text' as const,
      placeholder: 'e.g. saffron-100',
      description: 'A design token name (optional).',
    },
    {
      name: 'sortOrder' as const,
      label: 'Sort order',
      type: 'number' as const,
      description: 'Lower numbers appear first.',
    },
    { name: 'isActive' as const, label: 'Active', type: 'switch' as const },
    {
      name: 'translations' as const,
      label: 'Display name translations',
      type: 'custom' as const,
      render: translationsField({
        fields: [{ name: 'displayName', label: 'Display name', required: true, maxLength: 200 }],
        title: 'Display name translations',
      }),
    },
  ];

/** Map a loaded category's translations into the form value shape. */
function categoryTranslations(
  c: MantraCategoryDetail,
): MantraCategoryFormValues['translations'] {
  return c.translations.map((t) => ({ locale: t.locale, displayName: t.displayName }));
}

function CreateCategory({ onClose }: { onClose: () => void }) {
  const create = useCreateMantraCategory();

  return (
    <>
      <DialogHeader>
        <DialogTitle>New mantra category</DialogTitle>
        <DialogDescription>
          The slug is a permanent reference key. Choose it carefully; it cannot be
          changed later.
        </DialogDescription>
      </DialogHeader>

      <EntityForm<MantraCategoryFormValues>
        mode="create"
        entityLabel="Category"
        schema={MantraCategoryFormSchema}
        defaultValues={{
          slug: '',
          displayName: '',
          imageUrl: '',
          backgroundColorToken: '',
          sortOrder: 0,
          isActive: true,
          translations: [],
        }}
        fields={FIELDS('create')}
        onSubmit={(values) =>
          create
            .mutateAsync({
              slug: values.slug,
              displayName: values.displayName,
              imageUrl: values.imageUrl === '' ? null : values.imageUrl,
              backgroundColorToken:
                values.backgroundColorToken === '' ? null : values.backgroundColorToken,
              sortOrder: values.sortOrder,
              isActive: values.isActive,
              translations: values.translations,
            })
            .catch(rethrowDuplicateConflict)
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditCategory({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: category, isLoading, isError, error } = useMantraCategory(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit category</DialogTitle>
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

  if (isError || !category) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit category</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this category</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{category.slug}”</DialogTitle>
        <DialogDescription>Update the image, name, ordering and status.</DialogDescription>
      </DialogHeader>
      {/* REMOUNT on `updatedAt` so the form rebinds to fresh data after an
          invalidation — `<EntityForm>` snapshots `defaultValues` on mount. */}
      <EditCategoryForm key={category.updatedAt} category={category} onClose={onClose} />
    </>
  );
}

function EditCategoryForm({
  category,
  onClose,
}: {
  category: MantraCategoryDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const update = useUpdateMantraCategory();

  return (
    <EntityForm<MantraCategoryFormValues>
      mode="edit"
      entityLabel="Category"
      schema={MantraCategoryFormSchema}
      updatedAt={category.updatedAt}
      defaultValues={{
        slug: category.slug,
        displayName: category.displayName,
        imageUrl: category.imageUrl ?? '',
        backgroundColorToken: category.backgroundColorToken ?? '',
        sortOrder: category.sortOrder,
        isActive: category.isActive,
        translations: categoryTranslations(category),
      }}
      fields={FIELDS('edit')}
      // SEND ONLY WHAT CHANGED — never re-send an untouched (possibly seeded)
      // imageUrl; never send slug (§#EXPORT_CRITICAL).
      onSubmit={(values) => {
        const changes: MantraCategoryChanges = {};
        if (values.displayName !== category.displayName)
          changes.displayName = values.displayName;
        const nextImage = values.imageUrl === '' ? null : values.imageUrl;
        if (nextImage !== (category.imageUrl ?? null)) changes.imageUrl = nextImage;
        const nextToken =
          values.backgroundColorToken === '' ? null : values.backgroundColorToken;
        if (nextToken !== (category.backgroundColorToken ?? null))
          changes.backgroundColorToken = nextToken;
        if (values.sortOrder !== category.sortOrder) changes.sortOrder = values.sortOrder;
        if (values.isActive !== category.isActive) changes.isActive = values.isActive;
        if (translationsChanged(values.translations, categoryTranslations(category)))
          changes.translations = values.translations;
        return update.mutateAsync({
          id: category.id,
          changes,
          expectedUpdatedAt: values.updatedAt as string,
        });
      }}
      onSuccess={onClose}
      onConflict={() => {
        void qc.invalidateQueries({ queryKey: adminKeys.detail('mantra-category', category.id) });
      }}
      onCancel={onClose}
    />
  );
}
