import type { paths } from '@repo/api-client';
import { api } from '../lib/api';
import { ApiError, toApiError } from '../lib/api-error';

/**
 * `GET /admin/session` — the admin whoami behind `<AdminRoute>` (TAM-82, ADR D1).
 *
 * The payload type is DERIVED FROM THE GENERATED `paths`, never hand-written: if
 * TAM-82 ever changes the contract, `tsc` breaks here rather than the UI
 * silently reading `undefined`. (`@repo/api-client` exports `paths` but not
 * `components`, so the schema is reached through the operation.)
 */
export type AdminSession =
  paths['/admin/session']['get']['responses'][200]['content']['application/json']['data'];

/**
 * Thrown on 403 — authenticated, but not an admin.
 *
 * `<AdminRoute>` renders the "not authorized" screen for this and must NOT
 * redirect: bouncing a successfully-authenticated non-admin to `/login` is an
 * infinite loop and a lie — their problem is authorization, not identity.
 */
export class NotAuthorizedError extends ApiError {
  constructor(message = 'Your account does not have admin access.') {
    super(message, 403);
    this.name = 'NotAuthorizedError';
  }
}

/**
 * Asks the SERVER whether this token is an admin.
 *
 * Deliberately NOT read from the JWT: there is no role claim in the token by
 * design (ADR B1) — a 1h token would leave a demoted admin fully admin for an
 * hour, and this repo has no revocation infra. `/admin/session` is self-gating:
 *   200 = admin · 403 = authenticated non-admin · 401 = no/expired token
 * (401 is handled globally by `lib/api.ts`'s interceptor → `/login`; it is
 * deliberately not duplicated here).
 *
 * Fails closed: anything that is not a 200 throws, and `<AdminRoute>` renders no
 * children unless this resolves.
 */
export async function fetchAdminSession(): Promise<AdminSession> {
  const { data, error, response } = await api.GET('/admin/session');

  if (response.status === 403) {
    throw new NotAuthorizedError(
      toApiError(error, response, 'Your account does not have admin access.').message,
    );
  }
  if (error || !data?.success) {
    throw toApiError(error, response, 'Could not verify your admin access.');
  }

  return data.data;
}
