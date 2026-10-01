import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';
import { toListQuery, type DataTableState } from '@/components/data-table/use-data-table-state';
import { api } from '../../lib/api';
import { unwrap } from '../../lib/api-result';
import { adminKeys } from '../../lib/query-keys';

/**
 * THE REFERENCE FEATURE HOOK. Nine module UI tickets copy this shape:
 *
 *  - all server state through TanStack Query — never `useEffect` + `fetch`;
 *  - all HTTP through `lib/api.ts` (the ONLY entry point);
 *  - `unwrap()` to pull `data.data` out of the `{success,message,data}` envelope
 *    and throw an `ApiError` carrying the status + `errorCode` on failure —
 *    that status is what lets `<EntityForm>` recognise a 409 `STALE_WRITE`;
 *  - keys from `adminKeys` (`['admin','<entity>', …]`), so one prefix
 *    invalidates every page/sort/filter of the list;
 *  - the list keyed on the FULL `DataTableState` and `toListQuery(state)` as the
 *    querystring, so page / sort / filter changes are just cache keys.
 */
// ── Types, DERIVED from the generated client (never hand-written) ────────────

type UsersPath = paths['/admin/users'];

/** The `{items,total,page,pageSize}` page. */
export type AdminUserPage =
  UsersPath['get']['responses'][200]['content']['application/json']['data'];

/**
 * One row — always a NON-admin account (the API excludes admins, so there is no
 * `role` field). `email` is null for phone accounts (`loginType: 'otp'`), every
 * mobile-app user, because they authenticate with an OTP and have no email at
 * all; `phoneNumber` is null for the email-login accounts.
 */
export type AdminUser = AdminUserPage['items'][number];

/**
 * `/admin/users` paginates, sorts and filters SERVER-SIDE (ADR C2) — it returns
 * `{items,total,page,pageSize}`. `q` is one search box matched against phone,
 * email and name. Admin accounts are never returned, so `total` is the count of
 * app users.
 */
export function useUsers(state: DataTableState) {
  return useQuery<AdminUserPage>({
    queryKey: adminKeys.list('users', state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/users', { params: { query: toListQuery(state) } }),
        'Failed to load users',
      ),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; name: string; password: string }) =>
      unwrap(api.POST('/auth/register', { body: input }), 'Failed to create user'),
    // Prefix invalidation: matches every `['admin','users', …]` query.
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.entity('users') }),
  });
}
