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
 * The deactivate (soft-delete) confirm dialog, shared by all three Mantras
 * lists — mirrors the taxonomy EXEMPLAR (`features/taxonomy/deactivate-dialog`).
 *
 * It is labelled "Deactivate", NEVER "Delete": the row survives with
 * `isActive = false` and can be reactivated from its row (#EXPORT_CRITICAL).
 * The confirm carries the row's `updatedAt` precondition (ADR C3); a 409 is a
 * `notify.conflict` toast — the same rule `<EntityForm>` applies, reached here
 * via `isConflictError` because a row action is not an entity form.
 */
export function DeactivateDialog({
  open,
  label,
  body,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** The row's human name for the heading, e.g. its slug or title. */
  label: string;
  /** What deactivating this row does, in plain words. */
  body: React.ReactNode;
  /** Runs the soft-delete mutation. Rejects on failure so the 409 path can fire. */
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
          'This row changed since you opened this list — reload and try again.',
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
          <DialogTitle>Deactivate “{label}”?</DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-2 text-left">{body}</div>
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
