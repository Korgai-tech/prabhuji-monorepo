import { ApiError } from '@/lib/api-error';

/**
 * On CREATE there is no `updatedAt` precondition, so a 409 is never a
 * stale-write — it is a uniqueness conflict (a duplicate `slug` on categories/
 * items, or a duplicate `sectionType` on sections; TAM-91 §(d)). `<EntityForm>`
 * treats every 409 as "modified by someone else", which would mislabel it, so
 * we re-throw a create-time 409 with a non-conflict status: the editor then
 * sees the server's real message ("… already exists") in the form's error
 * banner instead of the concurrency toast.
 *
 * (True inline attachment to the offending field needs a per-field error hook
 * in `<EntityForm>` — a TAM-86 enhancement, not a per-module fork.)
 */
export function rethrowCreateConflict(error: unknown): never {
  if (error instanceof ApiError && error.status === 409) {
    throw new ApiError(error.message, 422, error.errorCode);
  }
  throw error;
}
