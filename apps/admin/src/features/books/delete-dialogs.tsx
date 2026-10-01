import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { isConflictError, notify } from '@/lib/toast';

import {
  useDeactivateBookContent,
  type BookContentListItem,
} from './use-book-content';
import { useDeactivateSection, type BookSection } from './use-book-sections';
import { useDeleteSubBook, type BookSubBook } from './use-book-sub-books';
import { useDeleteChapter, type BookChapter } from './use-book-chapters';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Books delete/deactivate confirms — the wording is LOAD-BEARING and DIFFERS
 *  per entity (TAM-102 AC (g), §#EXPORT_CRITICAL). DO NOT cross-copy:
 *   - BookContent / BookSection → "Deactivate" (soft; the row survives).
 *   - BookSubBook / BookChapter → "Delete"     (hard; permanent, with cascade).
 * ════════════════════════════════════════════════════════════════════════════
 */

// ── Content: DEACTIVATE (soft) ───────────────────────────────────────────────

export function DeactivateContentDialog({
  row,
  onClose,
}: {
  row: BookContentListItem | null;
  onClose: () => void;
}) {
  const deactivate = useDeactivateBookContent();
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    if (!row) return;
    setBusy(true);
    try {
      await deactivate.mutateAsync({ id: row.id, expectedUpdatedAt: row.updatedAt });
      notify.success(`${row.title} deactivated`);
      onClose();
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(onClose, 'This book changed since you opened it — reload and try again.');
        onClose();
      } else {
        notify.error(error, 'Could not deactivate this book.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate “{row?.title}”?</DialogTitle>
          <DialogDescription>
            The book is hidden from the app. It is <strong>not deleted</strong> —
            its chapters and text are kept, and you can reactivate it at any time
            from its row.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Deactivating…' : 'Deactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Section: DEACTIVATE (soft) ───────────────────────────────────────────────

export function DeactivateSectionDialog({
  row,
  onClose,
}: {
  row: BookSection | null;
  onClose: () => void;
}) {
  const deactivate = useDeactivateSection();
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    if (!row) return;
    setBusy(true);
    try {
      await deactivate.mutateAsync({ id: row.id, expectedUpdatedAt: row.updatedAt });
      notify.success(`${row.title} deactivated`);
      onClose();
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(onClose, 'This section changed since you opened it — reload and try again.');
        onClose();
      } else {
        notify.error(error, 'Could not deactivate this section.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate “{row?.title}”?</DialogTitle>
          <DialogDescription>
            The section is hidden from the app’s home screen. It is{' '}
            <strong>not deleted</strong> and can be reactivated from its row.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Deactivating…' : 'Deactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-book: DELETE (hard, CASCADES to chapters) ────────────────────────────

/**
 * The ticket's most consequential warning (§#EXPORT_CRITICAL): deleting a
 * sub-book PERMANENTLY destroys its chapters. The dialog names the exact count
 * from the sub-book's `chapterCount` — "…and its 14 chapters" — because
 * "are you sure?" is not informed consent.
 */
export function DeleteSubBookDialog({
  subBook,
  onClose,
}: {
  subBook: BookSubBook | null;
  onClose: () => void;
}) {
  const remove = useDeleteSubBook();
  const [busy, setBusy] = React.useState(false);
  const count = subBook?.chapterCount ?? 0;

  async function confirm() {
    if (!subBook) return;
    setBusy(true);
    try {
      await remove.mutateAsync({ id: subBook.id, expectedUpdatedAt: subBook.updatedAt });
      notify.success(
        count > 0
          ? `Sub-book and ${count} chapter${count === 1 ? '' : 's'} deleted`
          : 'Sub-book deleted',
      );
      onClose();
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(onClose, 'This sub-book changed since you opened it — reload and try again.');
        onClose();
      } else {
        notify.error(error, 'Could not delete this sub-book.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={subBook !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{subBook?.title}”?</DialogTitle>
          <DialogDescription>
            {count > 0 ? (
              <>
                This will <strong>permanently delete</strong> this sub-book and its{' '}
                <strong>
                  {count} chapter{count === 1 ? '' : 's'}
                </strong>
                . This cannot be undone.
              </>
            ) : (
              <>
                This will <strong>permanently delete</strong> this sub-book. This
                cannot be undone.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Chapter: DELETE (hard) ───────────────────────────────────────────────────

export function DeleteChapterDialog({
  chapter,
  onClose,
}: {
  chapter: BookChapter | null;
  onClose: () => void;
}) {
  const remove = useDeleteChapter();
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    if (!chapter) return;
    setBusy(true);
    try {
      await remove.mutateAsync({ id: chapter.id, expectedUpdatedAt: chapter.updatedAt });
      notify.success('Chapter deleted');
      onClose();
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(onClose, 'This chapter changed since you opened it — reload and try again.');
        onClose();
      } else {
        notify.error(error, 'Could not delete this chapter.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={chapter !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{chapter?.title}”?</DialogTitle>
          <DialogDescription>
            This chapter and its text{chapter?.audioUrl ? ' and audio link' : ''} will
            be <strong>permanently removed</strong>. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
