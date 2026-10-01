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

import { useDeleteHoroscopeResult, type HoroscopeResult } from './use-horoscope-results';
import { zodiacLabel } from './constants';

/**
 * The daily-result DELETE confirm — a GENUINE, PERMANENT hard delete (spec §(h),
 * TAM-100's one justified soft-delete exception: dated leaf content, no liveness
 * flag, nothing references it). This is the ONE place in the epic where the word
 * "Delete" is correct, so the copy says the row is permanently removed. Do NOT
 * copy the "Deactivate" wording here, and do NOT copy this wording elsewhere.
 *
 * The confirm carries the row's `updatedAt` precondition (ADR C3); a 409 → a
 * conflict toast.
 */
export function DeleteResultDialog({
  result,
  onClose,
}: {
  result: HoroscopeResult | null;
  onClose: () => void;
}) {
  const remove = useDeleteHoroscopeResult();
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    if (!result) return;
    setBusy(true);
    try {
      await remove.mutateAsync({ id: result.id, expectedUpdatedAt: result.updatedAt });
      notify.success('Daily result deleted');
      onClose();
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          onClose,
          'This result changed since you opened this list — reload and try again.',
        );
        onClose();
      } else {
        notify.error(error, 'Could not delete this result.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={result !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this daily horoscope?</DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-2 text-left">
              <p>
                {result
                  ? `${zodiacLabel(result.zodiacId)} · ${result.dateIst} · ${result.languageCode}`
                  : ''}
              </p>
              <p>
                This <span className="font-medium">permanently removes</span> the row — it is not a
                deactivation and cannot be undone. Author a fresh result for this sign, date and
                language if you need one again.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
