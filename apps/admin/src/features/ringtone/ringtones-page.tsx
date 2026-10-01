import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';

import { CardThumb } from '@/components/data-table/card-thumb';
import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isConflictError, notify } from '@/lib/toast';

import {
  useRingtones,
  useUpdateRingtone,
  useDeityOptions,
  type RingtoneListItem,
} from './use-ringtones';
import { RingtoneFormDialog, type RingtoneFormState } from './ringtone-form';
import { DeactivateDialog } from './deactivate-dialog';
import { RINGTONE_LANGUAGES, languageLabel } from './ringtone-schema';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Ringtones list — a copy of the deity `<DataTable>` exemplar (TAM-95 §(b)).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The list thumbnail uses `thumbnailImageUrl` — the FREE field — the only image
 * on the row (§(b), #EXPORT_CRITICAL: the free grid shows only the free image).
 * `playCount`/`setCount` are read-only text columns.
 *
 * Sort is offered ONLY on TAM-94's allowlist
 * (`title | playCount | setCount | isActive | createdAt | updatedAt`).
 * Filters are `q`, `isActive`, `deitySlug`, `language` and `tag`.
 */
export function RingtonesPage() {
  const table = useDataTableState({ sort: 'updatedAt', order: 'desc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useRingtones(table.state);
  const { data: deityData } = useDeityOptions();

  const [formState, setFormState] = React.useState<RingtoneFormState>(null);
  const [deactivating, setDeactivating] = React.useState<RingtoneListItem | null>(null);

  const deityFilterOptions = (deityData?.items ?? []).map((deity) => ({
    label: deity.active ? deity.slug : `${deity.slug} (inactive)`,
    value: deity.slug,
  }));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Ringtones</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The ringtone catalogue. The thumbnail is free — shown to everyone in the
          grid and search — while the audio is Pro-only. Deactivating a ringtone
          hides it without deleting anything.
        </p>
      </div>

      <DataTable<RingtoneListItem>
        caption="All ringtones"
        columns={[
          {
            id: 'thumbnail',
            header: 'Thumbnail',
            headerClassName: 'w-0',
            // The FREE field — the only image on the row (§(b), #EXPORT_CRITICAL).
            cell: (ringtone) => <RingtoneThumbnail ringtone={ringtone} />,
          },
          {
            id: 'title',
            header: 'Title',
            sortField: 'title',
            cell: (ringtone) => <span className="font-medium">{ringtone.title}</span>,
          },
          {
            id: 'slug',
            header: 'Slug',
            cell: (ringtone) => <code className="text-xs">{ringtone.slug}</code>,
          },
          {
            id: 'deity',
            header: 'Deity',
            cell: (ringtone) => (
              <span className="text-muted-foreground">{ringtone.deitySlug}</span>
            ),
          },
          {
            id: 'playCount',
            header: 'Plays',
            sortField: 'playCount',
            // Read-only text (§(b), TAM-94 AC (e)) — never editable.
            cell: (ringtone) => <span className="tabular-nums">{ringtone.playCount}</span>,
          },
          {
            id: 'setCount',
            header: 'Sets',
            sortField: 'setCount',
            cell: (ringtone) => <span className="tabular-nums">{ringtone.setCount}</span>,
          },
          {
            id: 'language',
            header: 'Languages',
            cell: (ringtone) =>
              ringtone.languages.length === 0 ? (
                <span className="text-xs text-muted-foreground">All</span>
              ) : (
                <span className="text-xs">
                  {ringtone.languages.map((code) => languageLabel(code).split(' ')[0]).join(', ')}
                </span>
              ),
          },
          {
            id: 'isActive',
            header: 'Status',
            sortField: 'isActive',
            cell: (ringtone) => (
              <Badge variant={ringtone.isActive ? 'default' : 'muted'}>
                {ringtone.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
          {
            id: 'updatedAt',
            header: 'Updated',
            sortField: 'updatedAt',
            cell: (ringtone) => (
              <time dateTime={ringtone.updatedAt} className="text-xs text-muted-foreground">
                {new Date(ringtone.updatedAt).toLocaleDateString()}
              </time>
            ),
          },
        ]}
        filterFields={[
          { id: 'q', label: 'Search', type: 'text', placeholder: 'Search title or slug…' },
          {
            id: 'isActive',
            label: 'Status',
            type: 'select',
            options: [
              { label: 'Active', value: 'true' },
              { label: 'Inactive', value: 'false' },
            ],
          },
          {
            id: 'deitySlug',
            label: 'Deity',
            type: 'select',
            options: deityFilterOptions,
          },
          {
            id: 'language',
            label: 'Language',
            type: 'select',
            options: RINGTONE_LANGUAGES.map((lang) => ({ label: lang.label, value: lang.value })),
          },
          { id: 'tag', label: 'Tag', type: 'text', placeholder: 'Filter by tag…' },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New ringtone
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(ringtone) => ringtone.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No ringtones match these filters."
        renderCard={(ringtone) => (
          <RingtoneCard
            ringtone={ringtone}
            onEdit={() => setFormState({ kind: 'edit', id: ringtone.id })}
            onDeactivate={() => setDeactivating(ringtone)}
          />
        )}
        actions={(ringtone) => (
          <RingtoneRowActions
            ringtone={ringtone}
            onEdit={() => setFormState({ kind: 'edit', id: ringtone.id })}
            onDeactivate={() => setDeactivating(ringtone)}
          />
        )}
      />

      <RingtoneFormDialog state={formState} onClose={() => setFormState(null)} />
      <DeactivateDialog ringtone={deactivating} onClose={() => setDeactivating(null)} />
    </div>
  );
}

/** The FREE thumbnail — the only image on the row. Seeded rows carry picsum URLs
 *  never uploaded through us — shown, never rejected on read; a broken/missing
 *  image degrades to a neutral placeholder (§(b)). */
function RingtoneThumbnail({ ringtone }: { ringtone: RingtoneListItem }) {
  const [broken, setBroken] = React.useState(false);
  if (!ringtone.thumbnailImageUrl || broken) {
    return (
      <div
        aria-hidden="true"
        className="size-8 rounded-md border bg-muted"
        title="No thumbnail"
      />
    );
  }
  return (
    <img
      src={ringtone.thumbnailImageUrl}
      alt=""
      className="size-8 rounded-md border object-cover"
      onError={() => setBroken(true)}
    />
  );
}

/** Grid-view card: the FREE thumbnail at a size you can actually judge (§(b),
 *  #EXPORT_CRITICAL — still the only image shown), its title + deity, and the two
 *  controls the visual pass needs. The rest stays in the table view. */
function RingtoneCard({
  ringtone,
  onEdit,
  onDeactivate,
}: {
  ringtone: RingtoneListItem;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  return (
    <div className="grid gap-2">
      <CardThumb
        src={ringtone.thumbnailImageUrl}
        title={ringtone.title}
        aspect="aspect-square"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium" title={ringtone.title}>
          {ringtone.title}
        </span>
        <Badge variant="outline">{ringtone.deitySlug}</Badge>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
          <PencilIcon aria-hidden="true" />
          Edit
        </Button>
        <ActivationButton
          ringtone={ringtone}
          onDeactivate={onDeactivate}
          variant="outline"
          className="flex-1"
        />
      </div>
    </div>
  );
}

/** Edit + (Deactivate | Reactivate). */
function RingtoneRowActions({
  ringtone,
  onEdit,
  onDeactivate,
}: {
  ringtone: RingtoneListItem;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      <ActivationButton ringtone={ringtone} onDeactivate={onDeactivate} />
    </div>
  );
}

/** Deactivate (→ confirm dialog) | Reactivate (a plain `PATCH { isActive:true }`
 *  carrying the row's `updatedAt` — visibly reversible, §(f)). Shared by the table
 *  row and the grid card so both toggle identically. */
function ActivationButton({
  ringtone,
  onDeactivate,
  className,
  variant = 'ghost',
}: {
  ringtone: RingtoneListItem;
  onDeactivate: () => void;
  className?: string;
  variant?: 'ghost' | 'outline';
}) {
  const update = useUpdateRingtone();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: ringtone.id,
        changes: { isActive: true },
        expectedUpdatedAt: ringtone.updatedAt,
      });
      notify.success(`${ringtone.title} reactivated`);
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(
          () => undefined,
          'This ringtone changed since you opened this list — reload and try again.',
        );
      } else {
        notify.error(error, 'Could not reactivate this ringtone.');
      }
    }
  }

  return ringtone.isActive ? (
    <Button variant={variant} size="sm" className={className} onClick={onDeactivate}>
      <PowerOffIcon aria-hidden="true" />
      Deactivate
    </Button>
  ) : (
    <Button
      variant={variant}
      size="sm"
      className={className}
      disabled={update.isPending}
      onClick={() => void reactivate()}
    >
      <PowerIcon aria-hidden="true" />
      Reactivate
    </Button>
  );
}
