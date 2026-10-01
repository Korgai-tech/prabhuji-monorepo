import { Link } from 'react-router-dom';
import { MessageSquareIcon, PlusIcon } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Button } from '@/components/ui/button';
import { useUsers, type AdminUser } from './use-users';

/**
 * The reference LIST page: `<DataTable>` wired to a feature hook. This is the
 * shape the nine module UI tickets copy.
 *
 * Pagination, sort and the search filter are all SERVER-SIDE (ADR C2): the page
 * hands `table.state` to `useUsers`, which turns it into the querystring, and
 * the API returns `{items,total,page,pageSize}`. It used to slice client-side
 * over an unpaginated array — a whole-table read on every page view — which is
 * no longer the case, so this page is now safe to copy wholesale.
 *
 * Creating a user lives on its own route (`<CreateUserPage>`), reached from the
 * toolbar — the form used to be mounted above this table on every visit.
 */
export function UsersPage() {
  // Newest signups first — the default an editor opening this page wants.
  const table = useDataTableState({ pageSize: 25, sort: 'createdAt', order: 'desc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useUsers(table.state);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
      </div>

      <DataTable<AdminUser>
        caption="All user accounts"
        // `q` matches id, phone, email and name server-side. One box, because
        // the editor has one identifier in hand and does not know which column
        // it lives in — a phone account has no email at all. An id must be
        // pasted WHOLE (the server matches a full UUID exactly).
        filterFields={[
          {
            id: 'q',
            label: 'Search',
            type: 'text',
            placeholder: 'ID, phone, email or name',
          },
        ]}
        columns={[
          {
            id: 'phone',
            header: 'Phone',
            // Email-login (CMS) accounts have no phone; phone accounts have no
            // email. An em dash reads as "not applicable" rather than "missing".
            cell: (user) =>
              user.phoneNumber
                ? `${user.phoneCountryCode ?? ''} ${user.phoneNumber}`.trim()
                : '—',
          },
          {
            id: 'email',
            header: 'Email',
            cell: (user) => user.email ?? '—',
            sortField: 'email',
          },
          { id: 'name', header: 'Name', cell: (user) => user.name ?? '—' },
          {
            id: 'createdAt',
            header: 'Signed up',
            // `sortField: 'createdAt'` is on the API's sort allowlist — the UI
            // must never offer a sort the API 400s on.
            cell: (user) => formatTimestamp(user.createdAt),
            sortField: 'createdAt',
          },
          {
            id: 'phoneVerifiedAt',
            header: 'OTP verified',
            // TAM-154: the row is created when the OTP is REQUESTED, so
            // "Signed up" above is really "asked for a code" and this column is
            // what separates a real user from a lead who never came back.
            // "Not verified" in words, not an em dash — the other columns use a
            // dash for "not applicable", and this is a different, actionable
            // state. Email-login (CMS) accounts have no phone to verify.
            cell: (user) =>
              user.phoneVerifiedAt ? (
                formatTimestamp(user.phoneVerifiedAt)
              ) : user.loginType === 'otp' ? (
                <span className="text-muted-foreground">Not verified</span>
              ) : (
                '—'
              ),
          },
          {
            id: 'id',
            header: 'ID',
            // Full value, not truncated: it is here to be copied into a log
            // search or a support ticket, and half an id is no use for that.
            cell: (user) => (
              <code className="text-xs text-muted-foreground">{user.id}</code>
            ),
          },
          {
            id: 'chat',
            header: '',
            // The chat viewer's only input is a user id, so the id is handed
            // over in the URL rather than left to be copied out of the column
            // above and pasted back in.
            cell: (user) => (
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/chat/history?userId=${user.id}`}>
                  <MessageSquareIcon aria-hidden="true" />
                  Chat
                </Link>
              </Button>
            ),
          },
        ]}
        toolbar={
          <Button size="sm" asChild>
            <Link to="/users/new">
              <PlusIcon aria-hidden="true" />
              New user
            </Link>
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(user) => user.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No users match this search."
      />
    </div>
  );
}

/** ISO-8601 → the viewer's locale. `Intl` is native; no date library here. */
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
