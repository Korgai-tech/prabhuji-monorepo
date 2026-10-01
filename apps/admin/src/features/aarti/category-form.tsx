import { useQueryClient } from '@tanstack/react-query';

import { EntityForm } from '@/components/entity-form/entity-form';
import type { EntityFormField } from '@/components/entity-form/entity-form';
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
  useAartiCategory,
  useCreateCategory,
  useUpdateCategory,
  type CategoryDetail,
} from './use-aarti';
import {
  CategoryFormSchema,
  nullableText,
  type CategoryFormValues,
} from './aarti-schema';
import { rethrowCreateConflict } from './rethrow-create-conflict';

/**
 * The Aarti category create/edit form — a copy of the TAM-89 deity form.
 * `slug` is create-only (immutable business key). On edit the form is REMOUNTED
 * with `key={category.updatedAt}` so it rebinds to fresh data after an
 * invalidation, and only CHANGED fields are PATCHed (a seeded picsum `imageUrl`
 * re-sent unchanged fails `validateOwnedUrl`; §#EXPORT_CRITICAL).
 */

export type CategoryFormState = { kind: 'create' } | { kind: 'edit'; id: string } | null;

const IMAGE_FIELD = mediaField({
  module: 'aarti',
  entity: 'audioCategory',
  field: 'imageUrl',
  accept: IMAGE_TYPES,
});

export function CategoryFormDialog({
  state,
  onClose,
}: {
  state: CategoryFormState;
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

function CreateCategory({ onClose }: { onClose: () => void }) {
  const create = useCreateCategory();

  return (
    <>
      <DialogHeader>
        <DialogTitle>New category</DialogTitle>
        <DialogDescription>
          The slug is a permanent reference key — choose it carefully, it cannot
          be changed later.
        </DialogDescription>
      </DialogHeader>

      <EntityForm<CategoryFormValues>
        mode="create"
        entityLabel="Category"
        schema={CategoryFormSchema}
        defaultValues={{
          slug: '',
          name: '',
          imageUrl: '',
          description: '',
          displayColor: '',
          sortOrder: 0,
          isActive: true,
          translations: [],
        }}
        fields={CATEGORY_FIELDS}
        onSubmit={(values) =>
          create
            .mutateAsync({
              slug: values.slug,
              name: values.name,
              imageUrl: values.imageUrl,
              description: nullableText(values.description),
              displayColor: nullableText(values.displayColor),
              sortOrder: values.sortOrder,
              isActive: values.isActive,
              translations: values.translations,
            })
            .catch(rethrowCreateConflict)
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditCategory({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: category, isLoading, isError, error } = useAartiCategory(id);

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
        <DialogTitle>Edit “{category.name}”</DialogTitle>
        <DialogDescription>
          Update the image, ordering and status. The slug cannot be changed.
        </DialogDescription>
      </DialogHeader>
      {/* REMOUNT on `updatedAt` so the form rebinds to fresh data. */}
      <EditCategoryForm key={category.updatedAt} category={category} onClose={onClose} />
    </>
  );
}

function EditCategoryForm({
  category,
  onClose,
}: {
  category: CategoryDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const update = useUpdateCategory();

  return (
    <EntityForm<CategoryFormValues>
      mode="edit"
      entityLabel="Category"
      schema={CategoryFormSchema}
      updatedAt={category.updatedAt}
      defaultValues={{
        slug: category.slug,
        name: category.name,
        imageUrl: category.imageUrl ?? '',
        description: category.description ?? '',
        displayColor: category.displayColor ?? '',
        sortOrder: category.sortOrder,
        isActive: category.isActive,
        translations: categoryTranslations(category),
      }}
      fields={CATEGORY_FIELDS.map((field) =>
        field.name === 'slug'
          ? {
              ...field,
              disabled: true,
              description: 'The slug is a permanent reference key and cannot be changed.',
            }
          : field,
      )}
      // SEND ONLY WHAT CHANGED — never re-send an untouched (possibly seeded)
      // imageUrl, never send slug (§#EXPORT_CRITICAL).
      onSubmit={(values) => {
        const changes: {
          name?: string;
          imageUrl?: string;
          description?: string | null;
          displayColor?: string | null;
          sortOrder?: number;
          isActive?: boolean;
          translations?: CategoryFormValues['translations'];
        } = {};
        if (values.name !== category.name) changes.name = values.name;
        if (values.imageUrl !== (category.imageUrl ?? '')) changes.imageUrl = values.imageUrl;
        if (nullableText(values.description) !== (category.description ?? null))
          changes.description = nullableText(values.description);
        if (nullableText(values.displayColor) !== (category.displayColor ?? null))
          changes.displayColor = nullableText(values.displayColor);
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
        void qc.invalidateQueries({ queryKey: adminKeys.detail('aarti-category', category.id) });
      }}
      onCancel={onClose}
    />
  );
}

const CATEGORY_FIELDS = [
  {
    name: 'slug',
    label: 'Slug',
    type: 'text',
    required: true,
    placeholder: 'morning-aartis',
    description:
      'Lowercase letters, numbers and single hyphens. Permanent — cannot be changed after creation.',
  },
  { name: 'name', label: 'Name', type: 'text', required: true },
  {
    name: 'imageUrl',
    label: 'Image',
    type: 'custom',
    required: true,
    render: IMAGE_FIELD,
  },
  { name: 'description', label: 'Description', type: 'textarea' },
  {
    name: 'displayColor',
    label: 'Display colour',
    type: 'text',
    placeholder: '#FF8800',
    description: 'Optional accent colour used by the app for this category.',
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
    label: 'Name translations',
    type: 'custom',
    render: translationsField({
      fields: [
        { name: 'name', label: 'Name', required: true, maxLength: 200 },
        { name: 'description', label: 'Description', multiline: true, maxLength: 2000 },
      ],
      title: 'Name translations',
    }),
  },
] satisfies EntityFormField<CategoryFormValues>[];

/** Map a loaded category's translations into the form value shape. */
function categoryTranslations(c: CategoryDetail): CategoryFormValues['translations'] {
  return c.translations.map((t) => ({
    locale: t.locale,
    name: t.name,
    description: t.description ?? '',
  }));
}
