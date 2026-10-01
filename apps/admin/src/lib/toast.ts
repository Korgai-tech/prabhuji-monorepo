import { toast } from 'sonner';
import { ApiError, errorMessage } from './api-error';

/**
 * The mutation-feedback surface for the admin panel (ADR D3).
 *
 * THE RULE: **every mutation surfaces its failure.** `PHASE-NOTES.md` flags the
 * original create-user form for firing a mutation and never telling the editor
 * it failed. Do not replicate that 20 more times — success → `notify.success` +
 * `invalidateQueries`; failure → `notify.error`.
 *
 * `<EntityForm>` already does all of this for you. Reach for `notify` directly
 * only for mutations that are not entity forms (row actions, deactivate, …).
 */
export const notify = {
  /** e.g. `notify.success('Deity created')`. */
  success(message: string): void {
    toast.success(message);
  },

  /**
   * Surfaces a failed mutation. Prefers the server's message (`ApiError`
   * carries the API's user-facing copy) and falls back to `fallback`.
   */
  error(error: unknown, fallback = 'Something went wrong'): void {
    toast.error(errorMessage(error, fallback));
  },

  info(message: string): void {
    toast(message);
  },

  /**
   * The 409 `STALE_WRITE` conflict toast (ADR C3): someone else changed this
   * row since it was loaded, so the write was rejected. Offers a reload rather
   * than silently clobbering their edit.
   *
   * Handled once, in `<EntityForm>` — if each module handles it, it will be
   * handled inconsistently or not at all.
   */
  conflict(onReload: () => void, message?: string): void {
    toast.error(message ?? 'Modified by someone else — reload to see the latest.', {
      duration: 10_000,
      action: { label: 'Reload', onClick: onReload },
    });
  },
};

/** True when `error` is a 409 stale-write rejection from an admin write. */
export function isConflictError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.isConflict;
}
