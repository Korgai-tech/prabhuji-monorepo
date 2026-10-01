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

/**
 * The Aarti deactivate (soft-delete) confirm dialog (TAM-91 §(f)) — one generic
 * dialog reused by items, categories and sections (mirrors the taxonomy
 * exemplar, parameterised because Aarti has three entities).
 *
 * It says what it DOES plainly, is labelled "Deactivate" (NEVER "Delete"), and
 * the row survives with `isActive = false` (reactivation is a plain `PATCH
 * { isActive: true }` on the row). The confirm carries the row's `updatedAt`
 * precondition (ADR C3); a 409 becomes a `notify.conflict` toast, reached via
 * `isConflictError` because a row action is not an entity form.
 */
export function DeactivateDialog({
  open,
  title,
  label,
  children,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** Dialog heading, e.g. `Deactivate “morning-aarti”?`. */
  title: string;
  /** Used in the toast, e.g. `morning-aarti`. */
  label: string;
  /** The plain-language explanation of what deactivation does. */
  children: React.ReactNode;
  /** Runs the DELETE (carrying `updatedAt`); MUST reject on failure. */
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      notify.success(`${label} deactivated`);
      onClose();
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          onClose,
          'This row changed since you opened the list — reload and try again.',
        );
        onClose();
      } else {
        notify.error(error, 'Could not deactivate this row.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-2 text-left">{children}</div>
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
