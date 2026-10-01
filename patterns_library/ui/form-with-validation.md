# Pattern: Form with Client-Side Validation (Admin SPA)

> Repo-specific pattern (monorepo-boilerplate). Source of truth: `apps/admin/src/features/users/users-page.tsx`, `apps/admin/src/features/auth/login-page.tsx`, `apps/admin/src/features/users/use-users.ts`.

## Use Case

Any admin form that creates or updates data (React 19 + Vite SPA). The shape is: controlled `useState` inputs → Zod check on submit → TanStack Query mutation through the typed API client (`src/lib/api.ts`). There is **no react-hook-form and no shadcn `<Form>` primitive** in this app — do not add them for a single form.

Server-side Zod (`apps/api/src/core/<mod>/routes/<mod>.schemas.ts`) is **authoritative**; client-side validation only gives fast feedback and must mirror the server schema (here: `RegisterBody` — email, name min 1, password min 8).

## 1. Mutation Hook (feature hook, as-is in the repo)

```typescript
// apps/admin/src/features/users/use-users.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; name: string; password: string }) => {
      const { data, error } = await api.POST('/auth/register', { body: input });
      if (error || !data?.success) throw new Error('Failed to create user');
      return data.data; // envelope is {success, message, data}
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
```

Never hand-roll `fetch` — `api` (openapi-fetch from `@repo/api-client`) injects the Bearer token and handles 401 → `/login`. If the path/type is missing on `api.POST`, regenerate the client (contract codegen chain), don't cast.

## 2. Client Schema (extension — not yet in the boilerplate)

Zod v4 is already a workspace dependency. Mirror the server schema; keep messages user-facing:

```typescript
// apps/admin/src/features/users/create-user-schema.ts
import { z } from 'zod';

// EXTENSION: mirrors apps/api RegisterBody (auth.schemas.ts). Keep in sync.
export const CreateUserSchema = z.object({
  email: z.string().email('Enter a valid email'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
```

## 3. Form Component (controlled state + validate on submit)

The boilerplate form (`users-page.tsx`) submits directly; this adds the `safeParse` gate and field errors. Error display follows `login-page.tsx` (`text-sm text-red-600`).

```typescript
// apps/admin/src/features/users/users-page.tsx (form portion)
import { useState } from 'react';
import { useCreateUser } from './use-users';
import { Button } from '../../components/ui/button';
import { CreateUserSchema, type CreateUserInput } from './create-user-schema';

export function CreateUserForm() {
  const createUser = useCreateUser();
  const [form, setForm] = useState<CreateUserInput>({ email: '', name: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof CreateUserInput, string>>>({});

  return (
    <form
      className="mb-6 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = CreateUserSchema.safeParse(form);
        if (!parsed.success) {
          setErrors(Object.fromEntries(
            parsed.error.issues.map((i) => [i.path[0], i.message]),
          ));
          return;
        }
        setErrors({});
        createUser.mutate(parsed.data, {
          onSuccess: () => setForm({ email: '', name: '', password: '' }),
        });
      }}
    >
      <label htmlFor="email" className="text-sm font-medium">Email</label>
      <input
        id="email"
        className="border rounded p-2"
        type="email"
        value={form.email}
        aria-describedby="email-error"
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      {errors.email && (
        <p id="email-error" role="alert" className="text-sm text-red-600">{errors.email}</p>
      )}
      {/* name + password fields: same shape */}

      {createUser.isError && (
        <p role="alert" className="text-sm text-red-600">{createUser.error.message}</p>
      )}
      <Button type="submit" disabled={createUser.isPending}>
        {createUser.isPending ? 'Saving…' : 'Create'}
      </Button>
    </form>
  );
}
```

## Checklist

1. [ ] All HTTP via `src/lib/api.ts`; unwrap the `{success, message, data}` envelope (`data.data`)
2. [ ] Client schema mirrors the server's Zod schema — server validation stays authoritative; surface the server `message` on failure
3. [ ] Mutation invalidates the list query key on success (`['users']`)
4. [ ] Submit button disabled while `isPending`; form reset in `onSuccess`, not before
5. [ ] Every input has a `<label htmlFor>`; errors use `role="alert"` + `aria-describedby`
6. [ ] Tailwind classes only (no inline styles); primitives from `src/components/ui/`
7. [ ] Colocated test (`*.test.tsx`) covering validation errors and successful submit

## Related

- [Data Table](./data-table.md) — the listing the mutation invalidates
- [Zod Validation API](../api/zod-validation-api.md) — the authoritative server-side schemas
- [Input Sanitization](../security/input-sanitization.md) — defense-in-depth on the server boundary
