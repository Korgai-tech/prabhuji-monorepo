import { EntityForm } from '@/components/entity-form/entity-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api-error';

import {
  useCreateSubBook,
  useUpdateSubBook,
  type BookSubBook,
  type SubBookChanges,
} from './use-book-sub-books';
import { SubBookFormSchema, type SubBookFormValues } from './book-schema';

/**
 * Sub-book (kanda) create/edit dialog. Always scoped to ONE book — `contentId`
 * comes from the tree it was opened in, never a picker (§#EXPORT_CRITICAL). A
 * sub-book only exists under a `major_book`.
 */
export type SubBookFormState =
  | { kind: 'create' }
  | { kind: 'edit'; subBook: BookSubBook }
  | null;

export function SubBookFormDialog({
  state,
  contentId,
  onClose,
}: {
  state: SubBookFormState;
  contentId: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-xl">
        {state?.kind === 'edit' ? (
          <EditSubBook subBook={state.subBook} onClose={onClose} />
        ) : (
          <CreateSubBook contentId={contentId} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateSubBook({ contentId, onClose }: { contentId: string; onClose: () => void }) {
  const create = useCreateSubBook();
  return (
    <>
      <DialogHeader>
        <DialogTitle>New sub-book</DialogTitle>
        <DialogDescription>
          A sub-book (kanda) groups chapters within this book. Its slug is
          permanent.
        </DialogDescription>
      </DialogHeader>
      <EntityForm<SubBookFormValues>
        mode="create"
        entityLabel="Sub-book"
        schema={SubBookFormSchema}
        defaultValues={{ slug: '', title: '', order: 0 }}
        fields={[
          {
            name: 'slug',
            label: 'Slug',
            type: 'text',
            required: true,
            placeholder: 'bala-kanda',
            description: 'Lowercase letters, numbers and single hyphens. Permanent.',
          },
          { name: 'title', label: 'Title', type: 'text', required: true },
          {
            name: 'order',
            label: 'Order',
            type: 'number',
            description: 'Lower numbers appear first within the book.',
          },
        ]}
        onSubmit={(values) =>
          create
            .mutateAsync({
              contentId,
              slug: values.slug,
              title: values.title,
              order: values.order,
            })
            .catch(rethrowSlugConflict)
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditSubBook({ subBook, onClose }: { subBook: BookSubBook; onClose: () => void }) {
  const update = useUpdateSubBook();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{subBook.title}”</DialogTitle>
        <DialogDescription>Update the sub-book’s title and order.</DialogDescription>
      </DialogHeader>
      <EntityForm<SubBookFormValues>
        key={subBook.updatedAt}
        mode="edit"
        entityLabel="Sub-book"
        schema={SubBookFormSchema}
        updatedAt={subBook.updatedAt}
        defaultValues={{ slug: subBook.slug, title: subBook.title, order: subBook.order }}
        fields={[
          {
            name: 'slug',
            label: 'Slug',
            type: 'text',
            disabled: true,
            description: 'Slug is permanent and cannot be changed.',
          },
          { name: 'title', label: 'Title', type: 'text', required: true },
          { name: 'order', label: 'Order', type: 'number' },
        ]}
        onSubmit={(values) => {
          const changes: SubBookChanges = {};
          if (values.title !== subBook.title) changes.title = values.title;
          if (values.order !== subBook.order) changes.order = values.order;
          return update.mutateAsync({
            id: subBook.id,
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

function rethrowSlugConflict(error: unknown): never {
  if (error instanceof ApiError && error.errorCode === 'SLUG_CONFLICT') {
    throw new ApiError(error.message, 422, error.errorCode);
  }
  throw error;
}
