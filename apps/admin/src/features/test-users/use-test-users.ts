import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { paths } from '@repo/api-client';
import { toListQuery, type DataTableState } from '@/components/data-table/use-data-table-state';
import { api } from '../../lib/api';
import { unwrap } from '../../lib/api-result';
import { adminKeys } from '../../lib/query-keys';

type TestUsersPath = paths['/admin/test-users']['post'];

/** The `{items,total,page,pageSize}` page from `GET /admin/test-users`. */
export type TestUserPage =
  paths['/admin/test-users']['get']['responses'][200]['content']['application/json']['data'];

/** One test user: premium state (entitled now), recorded bucket, first login. */
export type TestUserRow = TestUserPage['items'][number];

/** Server-side paginated; `q` matches part of the phone number. Newest first. */
export function useTestUsers(state: DataTableState) {
  return useQuery<TestUserPage>({
    queryKey: adminKeys.list('test-users', state),
    queryFn: () =>
      unwrap(
        api.GET('/admin/test-users', { params: { query: toListQuery(state) } }),
        'Failed to load test users',
      ),
  });
}

export type CreateTestUserBody = TestUsersPath['requestBody']['content']['application/json'];

/** What the API did: whether it created or updated, and the bucket outcome. */
export type TestUserResult =
  TestUsersPath['responses'][200]['content']['application/json']['data'];

/**
 * `POST /admin/test-users` (TAM-187). Idempotent for a test user — re-submitting
 * a number updates its premium state and bucket, which is how a failed bucket
 * assignment is retried.
 */
export function useCreateTestUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTestUserBody) =>
      unwrap(api.POST('/admin/test-users', { body }), 'Failed to save test user'),
    // Refresh the test-user list, and the Users list, where it is also a row.
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: adminKeys.entity('test-users') }),
        qc.invalidateQueries({ queryKey: adminKeys.entity('users') }),
      ]),
  });
}
