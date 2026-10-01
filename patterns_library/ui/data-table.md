# Pattern: Data Table (Listing + Pagination, Admin SPA)

> Repo-specific pattern (monorepo-boilerplate). Source of truth: `apps/admin/src/features/users/users-page.tsx`, `apps/admin/src/features/users/use-users.ts`.

## Use Case

Any admin listing page (React 19 + Vite SPA): TanStack Query hook → loading/empty/error states → a plain Tailwind-styled `<table>`. There is **no TanStack Table and no shadcn `<Table>` primitive** in this app — a semantic `<table>` with Tailwind classes is the accepted shape. Don't add a table library for simple lists.

## 1. Query Hook (feature hook, as-is in the repo)

```typescript
// apps/admin/src/features/users/use-users.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface AdminUser {
  id: string;
  email: string;
}

export function useUsers() {
  return useQuery<AdminUser[]>({
    queryKey: ['users'], // list key; mutations invalidate exactly this
    queryFn: async () => {
      const { data, error } = await api.GET('/auth/users');
      if (error || !data?.success) throw new Error('Failed to load users');
      return data.data; // envelope is {success, message, data}
    },
  });
}
```

No `useEffect` fetching, no hand-rolled `fetch` — `api` (openapi-fetch) handles the Bearer token and 401 → `/login`.

## 2. Table Component

The repo's page handles `isLoading`; the empty and error branches below are minimal additions:

```typescript
// apps/admin/src/features/users/users-page.tsx (table portion)
import { useUsers } from './use-users';

export function UsersTable() {
  const { data: users, isLoading, isError, error } = useUsers();

  if (isLoading) return <p>Loading…</p>;
  if (isError)
    return <p role="alert" className="text-sm text-red-600">{error.message}</p>;
  if (!users?.length)
    return <p className="text-sm text-gray-500">No users yet.</p>;

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className="border-b p-2 text-left">ID</th>
          <th className="border-b p-2 text-left">Email</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
            <td className="border-b p-2">{u.id}</td>
            <td className="border-b p-2">{u.email}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Row actions (edit/delete) are `<Button variant="ghost" size="sm">` from `src/components/ui/button` in a trailing cell, wired to a mutation hook that invalidates `['users']`.

## 3. Pagination (extension — not yet in the boilerplate)

`GET /auth/users` currently returns the full array (no query params). For small datasets, slice client-side with `useState<number>` for the page. When a dataset outgrows that, paginate server-side:

```typescript
// EXTENSION: requires adding page/pageSize querystring Zod schema to the API
// route and regenerating the client (contract codegen chain) first.
import { keepPreviousData, useQuery } from '@tanstack/react-query';

export function useUsersPage(page: number, pageSize = 20) {
  return useQuery({
    // Convention: list key first, then a params object.
    // invalidateQueries({ queryKey: ['users'] }) still matches every page.
    queryKey: ['users', { page, pageSize }],
    queryFn: async () => {
      const { data, error } = await api.GET('/auth/users', {
        params: { query: { page, pageSize } },
      });
      if (error || !data?.success) throw new Error('Failed to load users');
      return data.data;
    },
    placeholderData: keepPreviousData, // no flash while the next page loads
  });
}
```

Pager UI: two `<Button variant="outline" size="sm">` controls; disable "Previous" at `page === 1` and "Next" when the returned page is short (or via a `total` field once the API provides one).

## Checklist

1. [ ] Server state via a feature query hook (`src/features/<feature>/use-<feature>.ts`) — never `useEffect` + `fetch`
2. [ ] Envelope unwrapped (`data.data`); errors thrown so TanStack Query owns retry/error state
3. [ ] All three states rendered: loading, error (`role="alert"`), empty
4. [ ] Query key: `['<resource>']` for lists, `['<resource>', { ...params }]` for paged/filtered variants
5. [ ] Mutations that change rows invalidate the list key (prefix match covers paged keys)
6. [ ] Semantic `<table>` with `<th>` headers; Tailwind classes only
7. [ ] Colocated test (`users-page.test.tsx` is the reference) covering loaded rows and loading state

## Related

- [Form with Validation](./form-with-validation.md) — the create/edit form that invalidates this table
- [Zod Validation API](../api/zod-validation-api.md) — add pagination params as a Zod querystring schema
- [Input Sanitization](../security/input-sanitization.md) — allowlist sort columns if you add server-side sorting
