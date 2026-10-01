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

import { useDeactivateRingtone, type RingtoneListItem } from './use-ringtones';

/**
 * The deactivate (soft-delete) confirm dialog (TAM-95 §(f)).
 *
 * It says what it DOES — the row survives with `isActive = false` and is
 * reversible — and is labelled "Deactivate", NEVER "Delete". There is no hard
 * delete of a ringtone anywhere in this UI (#EXPORT_CRITICAL); reactivation is a
 * plain `PATCH { isActive: true }` on the row.
 *
 * The confirm carries the row's `updatedAt` precondition (ADR C3); a 409 is a
 * `notify.conflict` toast (the row moved under the editor) — the same rule
 * `<EntityForm>` applies, reached here via `isConflictError` because a row
 * action is not an entity form.
 */
export function DeactivateDialog({
  ringtone,
  onClose,
}: {
  /** The row to deactivate, or `null` when the dialog is closed. */
  ringtone: RingtoneListItem | null;
  onClose: () => void;
}) {
  const deactivate = useDeactivateRingtone();
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    if (!ringtone) return;
    setBusy(true);
    try {
      await deactivate.mutateAsync({
        id: ringtone.id,
        expectedUpdatedAt: ringtone.updatedAt,
      });
      notify.success(`${ringtone.title} deactivated`);
      onClose();
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          onClose,
          'This ringtone changed since you opened this list — reload and try again.',
        );
        onClose();
      } else {
        notify.error(error, 'Could not deactivate this ringtone.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={ringtone !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate “{ringtone?.title}”?</DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-2 text-left">
              <p>
                The ringtone is hidden from the app’s grid and search. It is not
                deleted, and its media is untouched.
              </p>
              <p>You can reactivate it at any time from its row.</p>
            </div>
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
