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
 * The shared Home deactivate (soft-delete) confirm dialog (TAM-105 §(g)).
 *
 * It is "Deactivate", NEVER "Delete": the row survives with `isActive = false`
 * and is reversible via "Reactivate" on its row. The confirm carries the row's
 * `updatedAt` precondition (ADR C3); a 409 → `notify.conflict` (the row moved
 * under the editor), reached via `isConflictError` because a row action is not
 * an `<EntityForm>`.
 *
 * Generic over the three list entities: the page owns the mutation hook and
 * passes its `mutateAsync` as `onConfirm`.
 */
export interface DeactivateRow {
  id: string;
  updatedAt: string;
  /** Human label for the confirm copy (title / label / key). */
  label: string;
}

export function HomeDeactivateDialog({
  entityLabel,
  row,
  onConfirm,
  onClose,
}: {
  /** Lowercase noun, e.g. `"banner"`. */
  entityLabel: string;
  row: DeactivateRow | null;
  onConfirm: (args: { id: string; expectedUpdatedAt: string }) => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    if (!row) return;
    setBusy(true);
    try {
      await onConfirm({ id: row.id, expectedUpdatedAt: row.updatedAt });
      notify.success(`${entityLabel[0].toUpperCase()}${entityLabel.slice(1)} deactivated`);
      onClose();
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          onClose,
          `This ${entityLabel} changed since you opened this list — reload and try again.`,
        );
        onClose();
      } else {
        notify.error(error, `Could not deactivate this ${entityLabel}.`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate “{row?.label}”?</DialogTitle>
          <DialogDescription>
            It is hidden from the app’s home screen but not deleted — you can
            reactivate it at any time from its row.
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
