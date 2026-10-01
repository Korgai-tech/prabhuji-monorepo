import { ApiError } from '@/lib/api-error';

/**
 * Turn a CREATE-time duplicate conflict into a NON-conflict `ApiError` so
 * `<EntityForm>` surfaces the server's real message (e.g. "A homepage section of
 * type … already exists") rather than its generic "modified by someone else"
 * concurrency UX. Mirrors the taxonomy exemplar's `rethrowSlugConflict`.
 *
 * TAM-92 returns 409 with `SLUG_CONFLICT` (categories, items) or
 * `SECTION_TYPE_CONFLICT` (sections) — both are the SAME status as a stale write
 * but a DIFFERENT failure. (True inline attachment to the offending field needs
 * a per-field error hook in `<EntityForm>` — a TAM-86 enhancement, not a
 * per-module fork.)
 */
const DUPLICATE_CODES = new Set(['SLUG_CONFLICT', 'SECTION_TYPE_CONFLICT']);

export function rethrowDuplicateConflict(error: unknown): never {
  if (error instanceof ApiError && error.errorCode && DUPLICATE_CODES.has(error.errorCode)) {
    throw new ApiError(error.message, 422, error.errorCode);
  }
  throw error;
}
