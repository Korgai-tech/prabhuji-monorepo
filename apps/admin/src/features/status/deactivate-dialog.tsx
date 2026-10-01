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
 * The status deactivate (soft-delete) confirm dialog (TAM-99 §(f)) — shared by the
 * StatusItem lists.
 *
 * It says what it DOES: the row survives with `isActive = false` and it is
 * reversible; it is labelled "Deactivate", NEVER "Delete" (there is no hard delete
 * of a status row anywhere in this UI). The confirm carries the row's `updatedAt`
 * precondition (ADR C3); a 409 becomes a `notify.conflict` toast (the row moved
 * under the editor), reached via `isConflictError` because a row action is not an
 * `<EntityForm>`.
 */
export function StatusDeactivateDialog({
  open,
  label,
  description,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** The row's business key, e.g. its slug/key — shown in the title. */
  label: string;
  description: React.ReactNode;
  busy: boolean;
  /** Resolves on success; rejects with an `ApiError` (409 → conflict toast). */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = React.useState(false);

  async function confirm() {
    setPending(true);
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
      setPending(false);
    }
  }

  const disabled = busy || pending;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate “{label}”?</DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-2 text-left">{description}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={disabled} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={disabled}
            onClick={() => void confirm()}
          >
            {disabled ? 'Deactivating…' : 'Deactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
