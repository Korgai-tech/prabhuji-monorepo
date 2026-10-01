import * as React from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { EntityForm } from '@/components/entity-form/entity-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useCreateTestUser,
  useTestUsers,
  type TestUserResult,
  type TestUserRow,
} from './use-test-users';
import { TestUserFormSchema, type TestUserFormInput } from './test-user-schema';

const DEFAULTS: TestUserFormInput = { phoneNumber: '', premium: false, bucket: '', note: '' };

/**
 * `/test-users` — create a QA account (TAM-187).
 *
 * Not under `/users`: the sidebar `NavLink` matches by prefix, so a child path
 * there would light up Users alongside it.
 */
export function TestUsersPage() {
  const createTestUser = useCreateTestUser();
  const [last, setLast] = React.useState<TestUserResult | null>(null);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Test users</h1>

      <Card>
        <CardHeader>
          <CardTitle>Create a test user</CardTitle>
          <CardDescription>
            The account logs in on the app with this environment&apos;s fixed test OTP — no SMS
            is sent. A number that already belongs to a real user is refused. Submitting an
            existing test user&apos;s number again updates its premium state and bucket.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntityForm<TestUserFormInput>
            mode="create"
            entityLabel="Test user"
            submitLabel="Save test user"
            schema={TestUserFormSchema}
            defaultValues={DEFAULTS}
            fields={[
              {
                name: 'phoneNumber',
                label: 'Mobile number',
                type: 'text',
                required: true,
                placeholder: '9876543210',
                description: '10 digits, +91 is implied.',
              },
              {
                name: 'premium',
                label: 'Premium',
                type: 'switch',
                description: 'On: lifetime complimentary Pro. Off: free user.',
              },
              {
                name: 'bucket',
                label: 'A/B bucket',
                type: 'number',
                placeholder: '0 – 999',
                description: 'Pins the user to this bucket on the A/B testing service. Leave empty for none.',
              },
              {
                name: 'note',
                label: 'Note',
                type: 'text',
                description: 'Optional — stored with the bucket assignment.',
              },
            ]}
            onSubmit={async (values) => {
              const result = await createTestUser.mutateAsync({
                phoneCountryCode: '+91',
                phoneNumber: values.phoneNumber,
                premium: values.premium,
                bucket: values.bucket === '' ? null : values.bucket,
                ...(values.note.trim() ? { note: values.note.trim() } : {}),
              });
              setLast(result);
              return result;
            }}
          />
        </CardContent>
      </Card>

      {last && <TestUserResultCard result={last} />}

      <TestUsersTable />
    </div>
  );
}

function TestUsersTable() {
  const table = useDataTableState({ pageSize: 25 });
  const { data, isLoading, isFetching, isError, error, refetch } = useTestUsers(table.state);

  return (
    <DataTable<TestUserRow>
      caption="All test users"
      filterFields={[{ id: 'q', label: 'Search', type: 'text', placeholder: 'Phone number' }]}
      columns={[
        {
          id: 'phone',
          header: 'Phone',
          cell: (user) => `${user.phoneCountryCode ?? ''} ${user.phoneNumber ?? ''}`.trim(),
        },
        {
          id: 'premium',
          header: 'Plan',
          // Entitled right now — the same answer the app's Pro gates get.
          cell: (user) =>
            user.premium ? (
              <Badge>{user.complimentary ? 'Premium (granted)' : 'Premium'}</Badge>
            ) : (
              <Badge variant="secondary">Free</Badge>
            ),
        },
        {
          id: 'bucket',
          header: 'A/B bucket',
          cell: (user) =>
            user.bucket === null ? <span className="text-muted-foreground">None</span> : user.bucket,
        },
        {
          id: 'firstLoginAt',
          header: 'First login',
          cell: (user) =>
            user.firstLoginAt ? (
              formatTimestamp(user.firstLoginAt)
            ) : (
              <span className="text-muted-foreground">Never</span>
            ),
        },
        { id: 'createdAt', header: 'Created', cell: (user) => formatTimestamp(user.createdAt) },
        {
          id: 'id',
          header: 'User ID',
          cell: (user) => <code className="text-xs text-muted-foreground">{user.userId}</code>,
        },
      ]}
      rows={data?.items}
      total={data?.total}
      getRowId={(user) => user.userId}
      state={table.state}
      onStateChange={table.setState}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      error={error}
      onRetry={() => void refetch()}
      emptyMessage="No test users yet."
    />
  );
}

/** ISO-8601 → the viewer's locale. */
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function TestUserResultCard({ result }: { result: TestUserResult }) {
  const { bucket } = result;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {result.phoneCountryCode} {result.phoneNumber} {result.created ? 'created' : 'updated'}
        </CardTitle>
        <CardDescription className="font-mono text-xs">{result.userId}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant={result.premium ? 'default' : 'secondary'}>
            {result.premium ? 'Premium' : 'Free'}
          </Badge>
          {bucket.requested === null ? (
            <Badge variant="outline">No bucket</Badge>
          ) : (
            <Badge variant={bucket.assigned ? 'default' : 'destructive'}>
              Bucket {bucket.requested} {bucket.assigned ? 'assigned' : 'not assigned'}
            </Badge>
          )}
        </div>
        {bucket.error && (
          <Alert variant="destructive">
            <AlertTitle>The bucket was not assigned</AlertTitle>
            <AlertDescription>
              {bucket.error}. The user and premium state were saved — submit the same number
              again to retry.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
