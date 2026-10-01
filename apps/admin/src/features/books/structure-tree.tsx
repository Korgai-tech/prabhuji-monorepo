import * as React from 'react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MusicIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api-error';
import { notify } from '@/lib/toast';

import { useBookSubBooks, useUpdateSubBook, type BookSubBook } from './use-book-sub-books';
import { useBookChapters, useUpdateChapter, type BookChapter } from './use-book-chapters';
import { SubBookFormDialog, type SubBookFormState } from './sub-book-form';
import { ChapterFormDialog, type ChapterFormState } from './chapter-form';
import { DeleteChapterDialog, DeleteSubBookDialog } from './delete-dialogs';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  The book STRUCTURE editor (a `major_book` only). Sub-books (ordered), each
 *  holding its chapters (ordered), PLUS chapters hanging directly off the book.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A nested list with indentation + up/down buttons — dependency-free, no
 * tree/DnD library (§#PLAN_UNCERTAINTY). Reorder swaps the `order` of two
 * adjacent siblings (scoped to their parent). Every "Add chapter" button carries
 * the parent it belongs to (a sub-book id, or `null` for the book) so a
 * chapter's parent is FIXED by where you clicked — never a cross-book picker
 * (§#EXPORT_CRITICAL).
 *
 * This component is NEVER rendered for a `direct_scripture` — that hierarchy has
 * no sub-books and no chapters, so the "Add …" buttons simply do not exist for it.
 */
const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

export function StructureTree({ contentId }: { contentId: string }) {
  const subBooksQuery = useBookSubBooks(contentId);
  const chaptersQuery = useBookChapters(contentId);
  const updateSubBook = useUpdateSubBook();
  const updateChapter = useUpdateChapter();

  const [subBookForm, setSubBookForm] = React.useState<SubBookFormState>(null);
  const [chapterForm, setChapterForm] = React.useState<ChapterFormState>(null);
  const [deletingSubBook, setDeletingSubBook] = React.useState<BookSubBook | null>(null);
  const [deletingChapter, setDeletingChapter] = React.useState<BookChapter | null>(null);

  const isLoading = subBooksQuery.isLoading || chaptersQuery.isLoading;
  const isError = subBooksQuery.isError || chaptersQuery.isError;

  const subBooks = React.useMemo(
    () => [...(subBooksQuery.data?.items ?? [])].sort(byOrder),
    [subBooksQuery.data],
  );
  const chapters = React.useMemo(
    () => chaptersQuery.data?.items ?? [],
    [chaptersQuery.data],
  );

  const directChapters = React.useMemo(
    () => chapters.filter((c) => c.subBookId == null).sort(byOrder),
    [chapters],
  );
  const chaptersBySubBook = React.useMemo(() => {
    const map = new Map<string, BookChapter[]>();
    for (const sb of subBooks) {
      map.set(
        sb.id,
        chapters.filter((c) => c.subBookId === sb.id).sort(byOrder),
      );
    }
    return map;
  }, [subBooks, chapters]);

  /** Swap the `order` of two adjacent siblings (both PATCHes carry updatedAt). */
  async function swapOrder(
    a: { id: string; order: number; updatedAt: string },
    b: { id: string; order: number; updatedAt: string },
    kind: 'sub-book' | 'chapter',
  ) {
    try {
      if (kind === 'sub-book') {
        await updateSubBook.mutateAsync({
          id: a.id,
          changes: { order: b.order },
          expectedUpdatedAt: a.updatedAt,
        });
        await updateSubBook.mutateAsync({
          id: b.id,
          changes: { order: a.order },
          expectedUpdatedAt: b.updatedAt,
        });
      } else {
        await updateChapter.mutateAsync({
          id: a.id,
          changes: { order: b.order },
          expectedUpdatedAt: a.updatedAt,
        });
        await updateChapter.mutateAsync({
          id: b.id,
          changes: { order: a.order },
          expectedUpdatedAt: b.updatedAt,
        });
      }
    } catch (error) {
      notify.error(error, 'Could not reorder — reload and try again.');
    }
  }

  function moveSubBook(index: number, dir: -1 | 1) {
    const target = subBooks[index + dir];
    if (target) void swapOrder(subBooks[index], target, 'sub-book');
  }

  function moveChapter(list: BookChapter[], index: number, dir: -1 | 1) {
    const target = list[index + dir];
    if (target) void swapOrder(list[index], target, 'chapter');
  }

  if (isLoading) {
    return (
      <div className="grid gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load this book’s structure</AlertTitle>
        <AlertDescription>
          {errorMessage(
            subBooksQuery.error ?? chaptersQuery.error,
            'Please reload and try again.',
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section className="grid gap-4" aria-labelledby="book-structure-heading">
      <div className="flex items-center justify-between">
        <h2 id="book-structure-heading" className="text-lg font-semibold">
          Structure
        </h2>
        <Button size="sm" onClick={() => setSubBookForm({ kind: 'create' })}>
          <PlusIcon aria-hidden="true" />
          Add sub-book
        </Button>
      </div>

      {subBooks.length === 0 && directChapters.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sub-books or chapters yet. Add a sub-book to group chapters, or add a
          chapter directly under the book.
        </p>
      ) : null}

      {/* Sub-books, each with its own chapters. */}
      <ul className="grid gap-3">
        {subBooks.map((subBook, index) => {
          const subChapters = chaptersBySubBook.get(subBook.id) ?? [];
          return (
            <li key={subBook.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{subBook.title}</span>
                <code className="text-xs text-muted-foreground">{subBook.slug}</code>
                <Badge variant="muted">
                  {subBook.chapterCount} chapter{subBook.chapterCount === 1 ? '' : 's'}
                </Badge>
                <div className="ml-auto flex items-center gap-1">
                  <ReorderButtons
                    label={subBook.title}
                    canUp={index > 0}
                    canDown={index < subBooks.length - 1}
                    onUp={() => moveSubBook(index, -1)}
                    onDown={() => moveSubBook(index, 1)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSubBookForm({ kind: 'edit', subBook })}
                  >
                    <PencilIcon aria-hidden="true" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingSubBook(subBook)}
                  >
                    <Trash2Icon aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              </div>

              <ChapterList
                chapters={subChapters}
                onEdit={(chapter) => setChapterForm({ kind: 'edit', chapter })}
                onDelete={(chapter) => setDeletingChapter(chapter)}
                onMove={(i, dir) => moveChapter(subChapters, i, dir)}
              />

              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setChapterForm({ kind: 'create', subBookId: subBook.id })}
              >
                <PlusIcon aria-hidden="true" />
                Add chapter to this sub-book
              </Button>
            </li>
          );
        })}
      </ul>

      {/* Chapters directly under the book (no sub-book). */}
      <div className="rounded-lg border border-dashed p-3">
        <h3 className="text-sm font-semibold">Chapters directly under the book</h3>
        <ChapterList
          chapters={directChapters}
          onEdit={(chapter) => setChapterForm({ kind: 'edit', chapter })}
          onDelete={(chapter) => setDeletingChapter(chapter)}
          onMove={(i, dir) => moveChapter(directChapters, i, dir)}
        />
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => setChapterForm({ kind: 'create', subBookId: null })}
        >
          <PlusIcon aria-hidden="true" />
          Add chapter under the book
        </Button>
      </div>

      <SubBookFormDialog
        state={subBookForm}
        contentId={contentId}
        onClose={() => setSubBookForm(null)}
      />
      <ChapterFormDialog
        state={chapterForm}
        contentId={contentId}
        onClose={() => setChapterForm(null)}
      />
      <DeleteSubBookDialog
        subBook={deletingSubBook}
        onClose={() => setDeletingSubBook(null)}
      />
      <DeleteChapterDialog
        chapter={deletingChapter}
        onClose={() => setDeletingChapter(null)}
      />
    </section>
  );
}

function ChapterList({
  chapters,
  onEdit,
  onDelete,
  onMove,
}: {
  chapters: BookChapter[];
  onEdit: (chapter: BookChapter) => void;
  onDelete: (chapter: BookChapter) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  if (chapters.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">No chapters yet.</p>;
  }
  return (
    <ul className="mt-2 grid gap-1">
      {chapters.map((chapter, index) => (
        <li
          key={chapter.id}
          className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-2 py-1"
        >
          <span className="text-sm">{chapter.title}</span>
          <code className="text-xs text-muted-foreground">{chapter.slug}</code>
          {chapter.audioUrl ? (
            <MusicIcon aria-label="Has audio" className="size-3 text-muted-foreground" />
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <ReorderButtons
              label={chapter.title}
              canUp={index > 0}
              canDown={index < chapters.length - 1}
              onUp={() => onMove(index, -1)}
              onDown={() => onMove(index, 1)}
            />
            <Button variant="ghost" size="sm" onClick={() => onEdit(chapter)}>
              <PencilIcon aria-hidden="true" />
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(chapter)}>
              <Trash2Icon aria-hidden="true" />
              Delete
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReorderButtons({
  label,
  canUp,
  canDown,
  onUp,
  onDown,
}: {
  label: string;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        disabled={!canUp}
        aria-label={`Move ${label} up`}
        onClick={onUp}
      >
        <ChevronUpIcon aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={!canDown}
        aria-label={`Move ${label} down`}
        onClick={onDown}
      >
        <ChevronDownIcon aria-hidden="true" />
      </Button>
    </>
  );
}
