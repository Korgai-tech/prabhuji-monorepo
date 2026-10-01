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

import { useDeactivateDeity, type DeityListItem } from './use-deities';

/**
 * The deactivate (soft-delete) confirm dialog (TAM-89 §(e)).
 *
 * It says what it DOES — the row survives with `active = false`, tagged content
 * keeps its tag, and it is reversible — and it is labelled "Deactivate", NEVER
 * "Delete". There is no hard delete of a deity anywhere in this UI
 * (#EXPORT_CRITICAL); reactivation is a plain `PATCH { active: true }` on the
 * row, so the action is visibly reversible.
 *
 * The confirm carries the row's `updatedAt` precondition (ADR C3); a 409 is a
 * `notify.conflict` toast (the row moved under the editor) — the same rule
 * `<EntityForm>` applies, reached here via `isConflictError` because a row
 * action is not an entity form.
 */
export function DeactivateDialog({
  deity,
  onClose,
}: {
  /** The row to deactivate, or `null` when the dialog is closed. */
  deity: DeityListItem | null;
  onClose: () => void;
}) {
  const deactivate = useDeactivateDeity();
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    if (!deity) return;
    setBusy(true);
    try {
      await deactivate.mutateAsync({
        id: deity.id,
        expectedUpdatedAt: deity.updatedAt,
      });
      notify.success(`${deity.slug} deactivated`);
      onClose();
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          onClose,
          'This deity changed since you opened this list — reload and try again.',
        );
        onClose();
      } else {
        notify.error(error, 'Could not deactivate this deity.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={deity !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate “{deity?.slug}”?</DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-2 text-left">
              <p>
                The deity is hidden from the app’s filters across Aarti, Mantras,
                Ringtones, Wallpapers and Status. It is not deleted.
              </p>
              <p>
                Any content already tagged with this deity keeps its tag, and you
                can reactivate it at any time from its row.
              </p>
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
