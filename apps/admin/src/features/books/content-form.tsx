import * as React from 'react';

import { EntityForm, type EntityFormField } from '@/components/entity-form/entity-form';
import { mediaField, IMAGE_TYPES } from '@/components/media';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api-error';

import {
  useCreateBookContent,
  useUpdateBookContent,
  type BookCategory,
  type BookContentChanges,
  type BookContentCreateBody,
  type BookContentDetail,
  type BookContentType,
  type BookLanguage,
} from './use-book-content';
import {
  CATEGORIES,
  CONTENT_TYPES,
  ContentFormSchema,
  contentTypeLabel,
  type ContentFormValues,
} from './book-schema';
import { languagesField } from './languages-field';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Book content create/edit form — the `<EntityForm>` conditional on contentType
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The module's two hierarchies are discriminated by `contentType`, which is
 * IMMUTABLE after create (TAM-102 400s a PATCH that flips it — it would orphan
 * the child structure). So:
 *
 *  - CREATE: the editor FIRST picks the type (a create-only choice made OUTSIDE
 *    the form). The form is then rendered with the fields for THAT type only —
 *    `direct_scripture` gets `contentBody` + `category`; `major_book` gets
 *    neither. `contentType` cannot change once fields are bound; "Change type"
 *    resets the whole create.
 *  - EDIT: `contentType` is shown disabled with an explanation; its value comes
 *    from the loaded row and is never submitted.
 *
 * `slug` is create-only (immutable), and edits SEND ONLY CHANGED FIELDS — a
 * seeded `coverImageUrl` would fail `validateOwnedUrl` if re-sent.
 */

const COVER_FIELD = mediaField({
  module: 'books',
  entity: 'bookContent',
  field: 'coverImageUrl',
  accept: IMAGE_TYPES,
});

/** Build the field config for one contentType + mode. */
function contentFields(
  contentType: BookContentType,
  mode: 'create' | 'edit',
): EntityFormField<ContentFormValues>[] {
  const isScripture = contentType === 'direct_scripture';
  const fields: EntityFormField<ContentFormValues>[] = [
    {
      name: 'slug',
      label: 'Slug',
      type: 'text',
      required: mode === 'create',
      disabled: mode === 'edit',
      placeholder: 'ganesh-chalisa',
      description:
        mode === 'edit'
          ? 'Slug is a permanent reference key and cannot be changed.'
          : 'Lowercase letters, numbers and single hyphens. Permanent — cannot be changed later.',
    },
    {
      name: 'contentType',
      label: 'Content type',
      type: 'select',
      options: CONTENT_TYPES.map((t) => ({ value: t.value, label: t.label })),
      // Chosen before the form on create, immutable on edit — always disabled here.
      disabled: true,
      description:
        'The content type is fixed when the book is created — changing it would orphan its chapters.',
    },
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: true,
      placeholder: 'Ganesh Chalisa',
    },
    {
      name: 'coverImageUrl',
      label: 'Cover image',
      type: 'custom',
      required: true,
      render: COVER_FIELD,
    },
    { name: 'author', label: 'Author', type: 'text', placeholder: 'Optional' },
    {
      name: 'languages',
      label: 'Languages',
      type: 'custom',
      render: languagesField,
      description: 'Leave all unchecked to make this available in every language.',
    },
  ];

  if (isScripture) {
    fields.push(
      {
        name: 'contentBody',
        label: 'Scripture text',
        type: 'textarea',
        required: true,
        className: 'min-h-[16rem]',
        description:
          'Plain Devanagari text rendered as-is by the app. Spacing, blank lines and line breaks are preserved exactly — do not add any formatting.',
      },
      {
        name: 'category',
        label: 'Category',
        type: 'select',
        required: true,
        options: CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
      },
    );
  }

  fields.push(
    {
      name: 'sortOrder',
      label: 'Sort order',
      type: 'number',
      description: 'Lower numbers appear first.',
    },
    { name: 'offlineCacheEligible', label: 'Offline cache eligible', type: 'switch' },
    { name: 'isNewlyAdded', label: 'Show as newly added', type: 'switch' },
  );

  if (mode === 'edit') {
    fields.push({ name: 'active', label: 'Active', type: 'switch' });
  }

  return fields;
}

function createDefaults(contentType: BookContentType): ContentFormValues {
  return {
    slug: '',
    contentType,
    title: '',
    coverImageUrl: '',
    author: '',
    languages: [],
    sortOrder: 0,
    offlineCacheEligible: true,
    isNewlyAdded: false,
    active: true,
    contentBody: '',
    category: '',
  };
}

function editDefaults(row: BookContentDetail): ContentFormValues {
  return {
    slug: row.slug,
    contentType: row.contentType,
    title: row.title,
    coverImageUrl: row.coverImageUrl,
    author: row.author ?? '',
    languages: [...row.languages],
    sortOrder: row.sortOrder,
    offlineCacheEligible: row.offlineCacheEligible,
    isNewlyAdded: row.newlyAddedAt != null,
    active: row.isActive,
    contentBody: row.contentBody ?? '',
    category: row.category ?? '',
  };
}

/** Same language set, order-insensitive. */
function sameLanguages(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((v) => setB.has(v));
}

// ── Create (dialog, from the list) ───────────────────────────────────────────

export function ContentCreateDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [contentType, setContentType] = React.useState<BookContentType | null>(null);

  function close() {
    setContentType(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? close() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New book</DialogTitle>
          <DialogDescription>
            {contentType === null
              ? 'What are you creating? This choice is permanent.'
              : 'The content type cannot be changed after the book is created.'}
          </DialogDescription>
        </DialogHeader>

        {contentType === null ? (
          <div className="grid gap-2">
            {CONTENT_TYPES.map((t) => (
              <Button
                key={t.value}
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => setContentType(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        ) : (
          <CreateContentForm
            contentType={contentType}
            onChangeType={() => setContentType(null)}
            onClose={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateContentForm({
  contentType,
  onChangeType,
  onClose,
}: {
  contentType: BookContentType;
  onChangeType: () => void;
  onClose: () => void;
}) {
  const create = useCreateBookContent();

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span>
          Creating a <strong>{contentTypeLabel(contentType)}</strong>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onChangeType}>
          Change type
        </Button>
      </div>

      <EntityForm<ContentFormValues>
        mode="create"
        entityLabel="Book"
        schema={ContentFormSchema}
        defaultValues={createDefaults(contentType)}
        fields={contentFields(contentType, 'create')}
        onSubmit={(values) => {
          const body: BookContentCreateBody = {
            slug: values.slug,
            contentType: values.contentType,
            title: values.title,
            coverImageUrl: values.coverImageUrl,
            author: values.author === '' ? null : values.author,
            languages: values.languages as BookLanguage[],
            sortOrder: values.sortOrder,
            offlineCacheEligible: values.offlineCacheEligible,
          };
          if (values.contentType === 'direct_scripture') {
            body.contentBody = values.contentBody;
            body.category = values.category as BookCategory;
          }
          if (values.isNewlyAdded) {
            body.newlyAddedAt = new Date().toISOString();
          }
          return create.mutateAsync(body).catch(rethrowSlugConflict);
        }}
        onSuccess={onClose}
        onCancel={onClose}
      />
    </div>
  );
}

// ── Edit (inline on the book detail page) ────────────────────────────────────

export function ContentEditForm({
  row,
  onConflict,
}: {
  row: BookContentDetail;
  onConflict: () => void;
}) {
  const update = useUpdateBookContent();
  const isScripture = row.contentType === 'direct_scripture';

  return (
    <EntityForm<ContentFormValues>
      // Remount on `updatedAt` so the form rebinds to fresh data after a save.
      key={row.updatedAt}
      mode="edit"
      entityLabel="Book"
      schema={ContentFormSchema}
      updatedAt={row.updatedAt}
      defaultValues={editDefaults(row)}
      fields={contentFields(row.contentType, 'edit')}
      onSubmit={(values) => {
        const changes: BookContentChanges = {};
        if (values.title !== row.title) changes.title = values.title;
        if (values.coverImageUrl !== row.coverImageUrl) {
          changes.coverImageUrl = values.coverImageUrl;
        }
        const nextAuthor = values.author === '' ? null : values.author;
        if (nextAuthor !== (row.author ?? null)) changes.author = nextAuthor;
        if (!sameLanguages(values.languages, row.languages)) {
          changes.languages = values.languages as BookLanguage[];
        }
        if (values.sortOrder !== row.sortOrder) changes.sortOrder = values.sortOrder;
        if (values.offlineCacheEligible !== row.offlineCacheEligible) {
          changes.offlineCacheEligible = values.offlineCacheEligible;
        }
        if (values.active !== row.isActive) changes.isActive = values.active;

        // Scripture-only fields; NEVER trimmed/normalised.
        if (isScripture) {
          if (values.contentBody !== (row.contentBody ?? '')) {
            changes.contentBody = values.contentBody;
          }
          if (values.category !== (row.category ?? '')) {
            changes.category = values.category as BookCategory;
          }
        }

        // newlyAddedAt is a timestamp behind a boolean toggle — only emit it when
        // the toggle actually moved, so an unrelated edit doesn't re-stamp it.
        const wasNewlyAdded = row.newlyAddedAt != null;
        if (values.isNewlyAdded !== wasNewlyAdded) {
          changes.newlyAddedAt = values.isNewlyAdded ? new Date().toISOString() : null;
        }

        return update.mutateAsync({
          id: row.id,
          changes,
          expectedUpdatedAt: values.updatedAt as string,
        });
      }}
      onConflict={onConflict}
    />
  );
}

/**
 * A create-time 409 `SLUG_CONFLICT` is NOT a stale write — re-throw it with a
 * non-conflict status so `<EntityForm>` surfaces the server's real duplicate-slug
 * message instead of its generic "modified by someone else" concurrency UX.
 */
function rethrowSlugConflict(error: unknown): never {
  if (error instanceof ApiError && error.errorCode === 'SLUG_CONFLICT') {
    throw new ApiError(error.message, 422, error.errorCode);
  }
  throw error;
}
