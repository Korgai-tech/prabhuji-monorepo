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
 * The shared deactivate (soft-delete) confirm dialog for wallpapers AND homepage
 * rows (TAM-97 §(g)). It is labelled "Deactivate", NEVER "Delete" — the row
 * survives with `isActive = false` and is reversible (a plain `PATCH
 * { isActive: true }`; §#EXPORT_CRITICAL). The confirm carries the row's
 * `updatedAt` precondition (ADR C3); a 409 is a `notify.conflict` toast reached
 * via `isConflictError` (a row action is not an entity form).
 */

export interface DeactivateTarget {
  id: string;
  label: string;
  updatedAt: string;
}

export function DeactivateDialog({
  target,
  title,
  description,
  conflictMessage,
  successLabel,
  deactivate,
  onClose,
}: {
  target: DeactivateTarget | null;
  title: string;
  description: React.ReactNode;
  conflictMessage: string;
  successLabel: string;
  deactivate: (args: { id: string; expectedUpdatedAt: string }) => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    if (!target) return;
    setBusy(true);
    try {
      await deactivate({ id: target.id, expectedUpdatedAt: target.updatedAt });
      notify.success(`${target.label} ${successLabel}`);
      onClose();
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(onClose, conflictMessage);
        onClose();
      } else {
        notify.error(error, 'Could not deactivate this item.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-2 text-left">{description}</div>
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
