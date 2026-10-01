import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';
import { z } from 'zod';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { EntityForm } from '@/components/entity-form/entity-form';
import { mediaField, IMAGE_TYPES } from '@/components/media';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api-error';
import { isConflictError, notify } from '@/lib/toast';

import {
  useZodiacSigns,
  useZodiacSign,
  useCreateZodiacSign,
  useUpdateZodiacSign,
  useDeactivateZodiacSign,
  type ZodiacSign,
  type ZodiacChanges,
} from './use-zodiac-signs';
import { localeMapField, asLocaleMap, localeMapEquals, type LocaleMap } from './locale-map-field';
import { DeactivateDialog } from './deactivate-dialog';
import { ZODIAC_IDS, HOROSCOPE_LOCALES } from './constants';

/**
 * Zodiac signs (spec §(e)) — the TAM-89 `<DataTable>` + `<EntityForm>`
 * composition, with this module's divergences: the flag is `enabled` (not
 * `active`); `zodiacId` is the fixed-twelve create-only business key;
 * `localizedDisplayName` is a `{locale:text}` map edited by `localeMapField`;
 * `iconAssetUrl` uploads via `<MediaUploadField>`. Deactivate writes
 * `enabled=false`; there is no hard delete.
 */

const localeMap = z.record(z.string(), z.string());

const ZodiacFormSchema = z.object({
  zodiacId: z.string().min(1, 'Pick a sign'),
  displayName: z
    .string()
    .trim()
    .min(1, 'Enter the canonical English name')
    .max(120, '120 characters or fewer'),
  localizedDisplayName: localeMap,
  iconAssetUrl: z.string().url('Upload an icon to continue'),
  sortOrder: z.number().int('Whole numbers only'),
  enabled: z.boolean(),
});
type ZodiacFormValues = z.infer<typeof ZodiacFormSchema>;

const ICON_FIELD = mediaField({
  module: 'horoscope',
  entity: 'zodiacSign',
  field: 'iconAssetUrl',
  accept: IMAGE_TYPES,
});

type FormState = { kind: 'create' } | { kind: 'edit'; id: string } | null;

export function ZodiacSignsPage() {
  const table = useDataTableState({ sort: 'sortOrder', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useZodiacSigns(table.state);

  const [formState, setFormState] = React.useState<FormState>(null);
  const [deactivating, setDeactivating] = React.useState<ZodiacSign | null>(null);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Zodiac signs</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The fixed twelve signs. Daily results reference a sign by its id with no foreign key, so
          the id is permanent. Deactivating a sign hides it from the app without touching any
          authored result.
        </p>
      </div>

      <DataTable<ZodiacSign>
        caption="All zodiac signs"
        columns={[
          { id: 'icon', header: 'Icon', headerClassName: 'w-0', cell: (z) => <ZodiacIcon sign={z} /> },
          {
            id: 'zodiacId',
            header: 'Id',
            sortField: 'zodiacId',
            cell: (z) => <code className="text-xs">{z.zodiacId}</code>,
          },
          { id: 'displayName', header: 'Name', sortField: 'displayName', cell: (z) => z.displayName },
          {
            id: 'localized',
            header: 'Localized',
            cell: (z) => <LocalizedSummary map={z.localizedDisplayName} />,
          },
          { id: 'sortOrder', header: 'Sort', sortField: 'sortOrder', cell: (z) => z.sortOrder },
          {
            id: 'enabled',
            header: 'Status',
            sortField: 'enabled',
            cell: (z) => (
              <Badge variant={z.enabled ? 'default' : 'muted'}>
                {z.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            ),
          },
          {
            id: 'updatedAt',
            header: 'Updated',
            sortField: 'updatedAt',
            cell: (z) => (
              <time dateTime={z.updatedAt} className="text-xs text-muted-foreground">
                {new Date(z.updatedAt).toLocaleDateString()}
              </time>
            ),
          },
        ]}
        filterFields={[
          {
            id: 'enabled',
            label: 'Status',
            type: 'select',
            options: [
              { label: 'Enabled', value: 'true' },
              { label: 'Disabled', value: 'false' },
            ],
          },
          { id: 'q', label: 'Search', type: 'text', placeholder: 'Search name…' },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New sign
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(z) => z.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No zodiac signs match these filters."
        actions={(z) => (
          <ZodiacRowActions
            sign={z}
            onEdit={() => setFormState({ kind: 'edit', id: z.id })}
            onDeactivate={() => setDeactivating(z)}
          />
        )}
      />

      <ZodiacFormDialog state={formState} onClose={() => setFormState(null)} />
      <ZodiacDeactivate sign={deactivating} onClose={() => setDeactivating(null)} />
    </div>
  );
}

function LocalizedSummary({ map }: { map: LocaleMap }) {
  const count = Object.keys(map ?? {}).length;
  if (count === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const preview = HOROSCOPE_LOCALES.map((l) => map[l.value]).find(Boolean);
  return (
    <span className="text-xs text-muted-foreground">
      {preview} · {count} {count === 1 ? 'language' : 'languages'}
    </span>
  );
}

function ZodiacIcon({ sign }: { sign: ZodiacSign }) {
  const [broken, setBroken] = React.useState(false);
  if (!sign.iconAssetUrl || broken) {
    return <div aria-hidden="true" className="size-8 rounded-md border bg-muted" title="No icon" />;
  }
  return (
    <img
      src={sign.iconAssetUrl}
      alt=""
      className="size-8 rounded-md border object-cover"
      onError={() => setBroken(true)}
    />
  );
}

function ZodiacRowActions({
  sign,
  onEdit,
  onDeactivate,
}: {
  sign: ZodiacSign;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const update = useUpdateZodiacSign();

  async function reactivate() {
    try {
      await update.mutateAsync({
        id: sign.id,
        changes: { enabled: true },
        expectedUpdatedAt: sign.updatedAt,
      });
      notify.success(`${sign.displayName} enabled`);
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(() => undefined, 'This sign changed since you opened the list — reload.');
      } else {
        notify.error(error, 'Could not enable this sign.');
      }
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      {sign.enabled ? (
        <Button variant="ghost" size="sm" onClick={onDeactivate}>
          <PowerOffIcon aria-hidden="true" />
          Deactivate
        </Button>
      ) : (
        <Button variant="ghost" size="sm" disabled={update.isPending} onClick={() => void reactivate()}>
          <PowerIcon aria-hidden="true" />
          Reactivate
        </Button>
      )}
    </div>
  );
}

function ZodiacDeactivate({ sign, onClose }: { sign: ZodiacSign | null; onClose: () => void }) {
  const deactivate = useDeactivateZodiacSign();
  return (
    <DeactivateDialog
      open={sign !== null}
      onClose={onClose}
      entityLabel="zodiac sign"
      name={sign?.displayName ?? ''}
      note="Existing result rows are untouched — signs are referenced with no foreign key."
      onConfirm={() =>
        deactivate.mutateAsync({ id: sign!.id, expectedUpdatedAt: sign!.updatedAt })
      }
    />
  );
}

// ── Create / edit form (one dialog, two modes) ───────────────────────────────

function ZodiacFormDialog({ state, onClose }: { state: FormState; onClose: () => void }) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditZodiac id={state.id} onClose={onClose} />
        ) : (
          <CreateZodiac onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

const CREATE_FIELDS = [
  {
    name: 'zodiacId' as const,
    label: 'Sign',
    type: 'select' as const,
    required: true,
    options: ZODIAC_IDS,
    description: 'The permanent id daily results reference. Cannot be changed later.',
  },
  {
    name: 'displayName' as const,
    label: 'Display name',
    type: 'text' as const,
    required: true,
    placeholder: 'Sagittarius',
    description: 'The canonical English label — type it carefully (e.g. Sagittarius, Capricorn).',
  },
  { name: 'localizedDisplayName' as const, label: 'Localized names', type: 'custom' as const, render: localeMapField() },
  { name: 'iconAssetUrl' as const, label: 'Icon', type: 'custom' as const, required: true, render: ICON_FIELD },
  { name: 'sortOrder' as const, label: 'Sort order', type: 'number' as const },
  { name: 'enabled' as const, label: 'Enabled', type: 'switch' as const },
];

function CreateZodiac({ onClose }: { onClose: () => void }) {
  const create = useCreateZodiacSign();
  return (
    <>
      <DialogHeader>
        <DialogTitle>New zodiac sign</DialogTitle>
        <DialogDescription>
          Pick one of the twelve signs. The id is permanent; daily results reference it with no
          foreign key.
        </DialogDescription>
      </DialogHeader>
      <EntityForm<ZodiacFormValues>
        mode="create"
        entityLabel="Zodiac sign"
        schema={ZodiacFormSchema}
        defaultValues={{
          zodiacId: '',
          displayName: '',
          localizedDisplayName: {},
          iconAssetUrl: '',
          sortOrder: 0,
          enabled: true,
        }}
        fields={CREATE_FIELDS}
        onSubmit={(values) =>
          create.mutateAsync({
            zodiacId: values.zodiacId as never,
            displayName: values.displayName,
            localizedDisplayName: values.localizedDisplayName,
            iconAssetUrl: values.iconAssetUrl,
            sortOrder: values.sortOrder,
            enabled: values.enabled,
          })
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditZodiac({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: sign, isLoading, isError, error } = useZodiacSign(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit zodiac sign</DialogTitle>
          <DialogDescription>Loading…</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </>
    );
  }
  if (isError || !sign) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit zodiac sign</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this sign</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{sign.displayName}”</DialogTitle>
        <DialogDescription>
          The sign id is permanent and cannot be changed. Update the name, icon, ordering and status.
        </DialogDescription>
      </DialogHeader>
      {/* REMOUNT on updatedAt so the form rebinds to fresh data after a refetch. */}
      <EditZodiacForm key={sign.updatedAt} sign={sign} onClose={onClose} />
    </>
  );
}

function EditZodiacForm({ sign, onClose }: { sign: ZodiacSign; onClose: () => void }) {
  const update = useUpdateZodiacSign();

  return (
    <EntityForm<ZodiacFormValues>
      mode="edit"
      entityLabel="Zodiac sign"
      schema={ZodiacFormSchema}
      updatedAt={sign.updatedAt}
      defaultValues={{
        zodiacId: sign.zodiacId,
        displayName: sign.displayName,
        localizedDisplayName: asLocaleMap(sign.localizedDisplayName),
        iconAssetUrl: sign.iconAssetUrl,
        sortOrder: sign.sortOrder,
        enabled: sign.enabled,
      }}
      fields={[
        {
          name: 'zodiacId',
          label: 'Sign id',
          type: 'text',
          disabled: true,
          description: 'Permanent — referenced by daily results with no foreign key.',
        },
        ...CREATE_FIELDS.filter((f) => f.name !== 'zodiacId'),
      ]}
      onSubmit={(values) => {
        // SEND ONLY WHAT CHANGED (#EXPORT_CRITICAL): never re-send an untouched
        // (possibly seeded) iconAssetUrl; never send the immutable zodiacId.
        const changes: ZodiacChanges = {};
        if (values.displayName !== sign.displayName) changes.displayName = values.displayName;
        if (!localeMapEquals(values.localizedDisplayName, asLocaleMap(sign.localizedDisplayName)))
          changes.localizedDisplayName = values.localizedDisplayName;
        if (values.iconAssetUrl !== sign.iconAssetUrl) changes.iconAssetUrl = values.iconAssetUrl;
        if (values.sortOrder !== sign.sortOrder) changes.sortOrder = values.sortOrder;
        if (values.enabled !== sign.enabled) changes.enabled = values.enabled;
        return update.mutateAsync({
          id: sign.id,
          changes,
          expectedUpdatedAt: values.updatedAt as string,
        });
      }}
      onSuccess={onClose}
      onCancel={onClose}
    />
  );
}
