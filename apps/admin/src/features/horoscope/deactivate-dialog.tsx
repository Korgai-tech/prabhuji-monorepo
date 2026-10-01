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
 * The generic "Deactivate" (soft-delete) confirm for the horoscope entities that
 * DEACTIVATE — zodiac signs, modes, step configs (spec §(h)). It writes
 * `enabled = false`, NEVER a hard delete, and says so; the row survives, nothing
 * is deleted, and it is reversible. This module uses `enabled`, not `isActive`
 * (#EXPORT_CRITICAL) — the wording here reflects that.
 *
 * NOTE: daily RESULTS do NOT use this — they genuinely hard-delete (see
 * `delete-result-dialog.tsx`). Do not reuse this wording there.
 *
 * The confirm carries the row's `updatedAt` precondition (ADR C3); a 409 is a
 * `notify.conflict` toast, reached via `isConflictError` (a row action is not an
 * entity form).
 */
export function DeactivateDialog({
  open,
  onClose,
  entityLabel,
  name,
  note,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** e.g. `zodiac sign`, `mode`, `step`. */
  entityLabel: string;
  /** The row's human identity, e.g. its business key. */
  name: string;
  /** Optional extra sentence about side effects (e.g. "result rows untouched"). */
  note?: string;
  onConfirm: () => Promise<unknown>;
}) {
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      notify.success(`${name} deactivated`);
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
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate “{name}”?</DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-2 text-left">
              <p>
                The {entityLabel} is hidden from the app (its <code>enabled</code> flag is set to
                false). It is not deleted, and you can reactivate it at any time from its row.
              </p>
              {note && <p>{note}</p>}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Deactivating…' : 'Deactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
