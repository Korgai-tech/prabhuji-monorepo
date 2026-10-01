import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useDeities,
  useUpdateDeity,
  type DeityListItem,
} from './use-deities';
import { DeityFormDialog, type DeityFormState } from './deity-form';
import { DeactivateDialog } from './deactivate-dialog';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Deities list — THE EXEMPLAR `<DataTable>` composition (TAM-89 §(a)).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The FIRST of ~20 admin list/form views; the eight sibling module UIs copy this
 * exact shape. What to copy:
 *
 *  1. `useDataTableState(...)` owns page/sort/filter; `useDeities(table.state)`
 *     turns it into a SERVER-paginated request (`{items,total,page,pageSize}`);
 *     `<DataTable>` renders it and reports state changes back. No client-side
 *     slicing (that was only `use-users.ts`'s legacy-endpoint concession).
 *  2. A column is sortable ONLY with a `sortField` on TAM-88's allowlist
 *     (`slug | sortOrder | active | createdAt | updatedAt`) — the UI must never
 *     offer a sort the API 400s on.
 *  3. Filters (`q`, `active`) are declared as `filterFields`; `<DataTable>`
 *     writes them into `state.filters`, `toListQuery` forwards them.
 *  4. Row actions open dialogs the page owns (create/edit form, deactivate
 *     confirm) — the table stays presentational.
 *
 * NOTE (§#PLAN_UNCERTAINTY): the LIST endpoint returns no translations (a
 * deliberate N+1 avoidance), so the "Name" column shows the slug — TAM-57's
 * documented public fallback. Per-locale names are edited on the detail view.
 */
export function DeitiesPage() {
  const table = useDataTableState({ sort: 'sortOrder', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useDeities(table.state);

  const [formState, setFormState] = React.useState<DeityFormState>(null);
  const [deactivating, setDeactivating] = React.useState<DeityListItem | null>(null);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Deities</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The cross-module taxonomy root. Five modules — Aarti, Mantras,
          Ringtones, Wallpapers and Status — tag content against a deity’s slug.
          Deactivating a deity hides it from the app’s filters without deleting
          anything.
        </p>
      </div>

      <DataTable<DeityListItem>
        caption="All deities"
        columns={[
          {
            id: 'icon',
            header: 'Icon',
            headerClassName: 'w-0',
            cell: (deity) => <DeityIcon deity={deity} />,
          },
          {
            id: 'slug',
            header: 'Slug',
            sortField: 'slug',
            cell: (deity) => <code className="text-xs">{deity.slug}</code>,
          },
          {
            id: 'name',
            header: 'Name',
            // The list endpoint carries no translations — fall back to the slug
            // (TAM-57). Full per-locale names are on the edit view.
            cell: (deity) => (
              <span className="text-muted-foreground">{deity.slug}</span>
            ),
          },
          {
            id: 'sortOrder',
            header: 'Sort order',
            sortField: 'sortOrder',
            cell: (deity) => deity.sortOrder,
          },
          {
            id: 'active',
            header: 'Status',
            sortField: 'active',
            cell: (deity) => (
              <Badge variant={deity.active ? 'default' : 'muted'}>
                {deity.active ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
          {
            id: 'updatedAt',
            header: 'Updated',
            sortField: 'updatedAt',
            cell: (deity) => (
              <time
                dateTime={deity.updatedAt}
                className="text-xs text-muted-foreground"
              >
                {new Date(deity.updatedAt).toLocaleDateString()}
              </time>
            ),
          },
        ]}
        filterFields={[
          { id: 'q', label: 'Search', type: 'text', placeholder: 'Search slug…' },
          {
            id: 'active',
            label: 'Status',
            type: 'select',
            options: [
              { label: 'Active', value: 'true' },
              { label: 'Inactive', value: 'false' },
            ],
          },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New deity
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(deity) => deity.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No deities match these filters."
        actions={(deity) => (
          <DeityRowActions
            deity={deity}
            onEdit={() => setFormState({ kind: 'edit', id: deity.id })}
            onDeactivate={() => setDeactivating(deity)}
          />
        )}
      />

      <DeityFormDialog state={formState} onClose={() => setFormState(null)} />
      <DeactivateDialog deity={deactivating} onClose={() => setDeactivating(null)} />
    </div>
  );
}

/** The icon thumbnail. Seeded rows carry picsum URLs never uploaded through us —
 *  a self-evident "not done yet" marker; they are shown, never rejected on read
 *  (§(c)). A broken/missing icon degrades to a neutral placeholder. */
function DeityIcon({ deity }: { deity: DeityListItem }) {
  const [broken, setBroken] = React.useState(false);
  if (!deity.iconUrl || broken) {
    return (
      <div
        aria-hidden="true"
        className="size-8 rounded-md border bg-muted"
        title="No icon"
      />
    );
  }
  return (
    <img
      src={deity.iconUrl}
      alt=""
      className="size-8 rounded-md border object-cover"
      onError={() => setBroken(true)}
    />
  );
}

/** Edit + (Deactivate | Reactivate). Reactivate is a plain `PATCH { active:true }`
 *  carrying the row's `updatedAt` — the action is visibly reversible (§(e)). */
function DeityRowActions({
  deity,
  onEdit,
  onDeactivate,
}: {
  deity: DeityListItem;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const update = useUpdateDeity();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: deity.id,
        changes: { active: true },
        expectedUpdatedAt: deity.updatedAt,
      });
      notify.success(`${deity.slug} reactivated`);
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          () => undefined,
          'This deity changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(error, 'Could not reactivate this deity.');
      }
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      {deity.active ? (
        <Button variant="ghost" size="sm" onClick={onDeactivate}>
          <PowerOffIcon aria-hidden="true" />
          Deactivate
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={update.isPending}
          onClick={() => void reactivate()}
        >
          <PowerIcon aria-hidden="true" />
          Reactivate
        </Button>
      )}
    </div>
  );
}
