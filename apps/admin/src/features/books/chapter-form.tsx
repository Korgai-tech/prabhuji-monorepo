import { EntityForm } from '@/components/entity-form/entity-form';
import { mediaField, AUDIO_TYPES } from '@/components/media';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api-error';

import {
  useCreateChapter,
  useUpdateChapter,
  type BookChapter,
  type ChapterChanges,
} from './use-book-chapters';
import { ChapterFormSchema, type ChapterFormValues } from './book-schema';

/**
 * Chapter create/edit dialog. Its parent is FIXED by where it was opened in the
 * tree — `contentId` always, and `subBookId` (a sub-book or `null` for a chapter
 * directly under the book). There is NO parent picker (§#EXPORT_CRITICAL): a
 * chapter can never be created against another book's sub-book.
 *
 * `bodyText` is Devanagari scripture — a plain `<textarea>`, required, and NEVER
 * trimmed/normalised. `audioUrl` is OPTIONAL (audio/mpeg, 50 MB); empty means the
 * app hides "Listen Audio". Audio exists ONLY on chapters (r7).
 */
export type ChapterFormState =
  | { kind: 'create'; subBookId: string | null }
  | { kind: 'edit'; chapter: BookChapter }
  | null;

const AUDIO_FIELD = mediaField({
  module: 'books',
  entity: 'bookChapter',
  field: 'audioUrl',
  accept: AUDIO_TYPES,
});

export function ChapterFormDialog({
  state,
  contentId,
  onClose,
}: {
  state: ChapterFormState;
  contentId: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditChapter chapter={state.chapter} onClose={onClose} />
        ) : state?.kind === 'create' ? (
          <CreateChapter
            contentId={contentId}
            subBookId={state.subBookId}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateChapter({
  contentId,
  subBookId,
  onClose,
}: {
  contentId: string;
  subBookId: string | null;
  onClose: () => void;
}) {
  const create = useCreateChapter();
  return (
    <>
      <DialogHeader>
        <DialogTitle>New chapter</DialogTitle>
        <DialogDescription>
          {subBookId
            ? 'This chapter is added inside the selected sub-book.'
            : 'This chapter is added directly under the book.'}{' '}
          Its slug is permanent.
        </DialogDescription>
      </DialogHeader>
      <EntityForm<ChapterFormValues>
        mode="create"
        entityLabel="Chapter"
        schema={ChapterFormSchema}
        defaultValues={{ slug: '', title: '', order: 0, bodyText: '', audioUrl: '' }}
        fields={chapterFields('create')}
        onSubmit={(values) =>
          create
            .mutateAsync({
              contentId,
              subBookId,
              slug: values.slug,
              title: values.title,
              order: values.order,
              bodyText: values.bodyText,
              ...(values.audioUrl !== '' ? { audioUrl: values.audioUrl } : {}),
            })
            .catch(rethrowSlugConflict)
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditChapter({ chapter, onClose }: { chapter: BookChapter; onClose: () => void }) {
  const update = useUpdateChapter();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{chapter.title}”</DialogTitle>
        <DialogDescription>
          Update the chapter’s text, order and optional audio.
        </DialogDescription>
      </DialogHeader>
      <EntityForm<ChapterFormValues>
        key={chapter.updatedAt}
        mode="edit"
        entityLabel="Chapter"
        schema={ChapterFormSchema}
        updatedAt={chapter.updatedAt}
        defaultValues={{
          slug: chapter.slug,
          title: chapter.title,
          order: chapter.order,
          bodyText: chapter.bodyText,
          audioUrl: chapter.audioUrl ?? '',
        }}
        fields={chapterFields('edit')}
        onSubmit={(values) => {
          const changes: ChapterChanges = {};
          if (values.title !== chapter.title) changes.title = values.title;
          if (values.order !== chapter.order) changes.order = values.order;
          // Scripture — exact round-trip, never normalised.
          if (values.bodyText !== chapter.bodyText) changes.bodyText = values.bodyText;
          const nextAudio = values.audioUrl === '' ? null : values.audioUrl;
          if (nextAudio !== (chapter.audioUrl ?? null)) changes.audioUrl = nextAudio;
          return update.mutateAsync({
            id: chapter.id,
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

function chapterFields(mode: 'create' | 'edit') {
  return [
    {
      name: 'slug' as const,
      label: 'Slug',
      type: 'text' as const,
      required: mode === 'create',
      disabled: mode === 'edit',
      placeholder: 'chapter-1',
      description:
        mode === 'edit'
          ? 'Slug is permanent and cannot be changed.'
          : 'Lowercase letters, numbers and single hyphens. Permanent.',
    },
    { name: 'title' as const, label: 'Title', type: 'text' as const, required: true },
    {
      name: 'order' as const,
      label: 'Order',
      type: 'number' as const,
      description: 'Lower numbers appear first within this parent.',
    },
    {
      name: 'bodyText' as const,
      label: 'Chapter text',
      type: 'textarea' as const,
      required: true,
      className: 'min-h-[16rem]',
      description:
        'Plain Devanagari text rendered as-is by the app. Spacing, blank lines and line breaks are preserved exactly.',
    },
    {
      name: 'audioUrl' as const,
      label: 'Audio (optional)',
      type: 'custom' as const,
      render: AUDIO_FIELD,
      description:
        'Optional MP3, up to 50 MB. Leave empty to hide "Listen Audio" in the app. Note: the audio file is a public link and is not protected by the Pro flag.',
    },
  ];
}

function rethrowSlugConflict(error: unknown): never {
  if (error instanceof ApiError && error.errorCode === 'SLUG_CONFLICT') {
    throw new ApiError(error.message, 422, error.errorCode);
  }
  throw error;
}
