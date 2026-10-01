import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EntityForm } from '@/components/entity-form/entity-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreateUser } from './use-users';
import { CreateUserSchema, type CreateUserInput } from './create-user-schema';

/**
 * `/users/new` — creating a user, on its own route.
 *
 * It used to be a card permanently mounted above the list, which put a form the
 * editor needs occasionally in front of the list they came for on every visit.
 *
 * A ROUTE rather than the `<DeityFormDialog>` modal the module pages use: those
 * dialogs do create AND edit of the row you clicked, so they belong next to the
 * table. There is no user edit — this is a one-way form — and a route gives it a
 * linkable URL and the browser Back button for free.
 */
export function CreateUserPage() {
  const navigate = useNavigate();
  const createUser = useCreateUser();

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link to="/users">
            <ArrowLeftIcon aria-hidden="true" />
            All users
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">New user</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create a user</CardTitle>
          <CardDescription>
            The new account is a normal user — role is never a client input, so
            this can only ever create a non-admin (TAM-82). It will appear in the
            list; admin accounts never do.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntityForm<CreateUserInput>
            mode="create"
            entityLabel="User"
            schema={CreateUserSchema}
            defaultValues={{ email: '', name: '', password: '' }}
            fields={[
              { name: 'email', label: 'Email', type: 'email', required: true },
              { name: 'name', label: 'Name', type: 'text', required: true },
              {
                name: 'password',
                label: 'Password',
                type: 'password',
                required: true,
                description: 'At least 8 characters.',
              },
            ]}
            // `mutateAsync` REJECTS on failure — that rejection is what drives
            // the error toast and the no-reset-on-failure behaviour. Awaiting it
            // is also what keeps the navigation on the SUCCESS path only: a
            // failed create stays here with the editor's input intact.
            onSubmit={async (values) => {
              await createUser.mutateAsync(values);
              // The hook already invalidated the list, so it refetches behind us.
              void navigate('/users');
            }}
            onCancel={() => void navigate('/users')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
