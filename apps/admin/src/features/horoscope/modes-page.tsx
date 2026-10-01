import * as React from 'react';
import { PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from 'lucide-react';
import { z } from 'zod';

import { DataTable } from '@/components/data-table/data-table';
import { useDataTableState } from '@/components/data-table/use-data-table-state';
import { EntityForm } from '@/components/entity-form/entity-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { isConflictError, notify } from '@/lib/toast';

import {
  useHoroscopeModes,
  useCreateHoroscopeMode,
  useUpdateHoroscopeMode,
  useDeactivateHoroscopeMode,
  type HoroscopeMode,
  type ModeChanges,
} from './use-horoscope-modes';
import { DeactivateDialog } from './deactivate-dialog';

/**
 * Horoscope modes (spec §(f)) — the TAM-89 composition. `modeId` is the
 * create-only business key; the flag is `enabled`; DELETE = deactivate.
 */

const ModeFormSchema = z.object({
  modeId: z.string().trim().min(1, 'Enter a mode id').max(64, '64 characters or fewer'),
  modeName: z.string().trim().min(1, 'Enter a name').max(120, '120 characters or fewer'),
  phase: z.number().int('Whole numbers only'),
  enabled: z.boolean(),
});
type ModeFormValues = z.infer<typeof ModeFormSchema>;

type FormState = { kind: 'create' } | { kind: 'edit'; mode: HoroscopeMode } | null;

export function HoroscopeModesPage() {
  const table = useDataTableState({ sort: 'modeId', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useHoroscopeModes(table.state);

  const [formState, setFormState] = React.useState<FormState>(null);
  const [deactivating, setDeactivating] = React.useState<HoroscopeMode | null>(null);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Horoscope modes</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          A mode groups the ordered steps a daily result is authored against (for example a daily
          reading). Deactivating a mode hides it without touching authored results.
        </p>
      </div>

      <DataTable<HoroscopeMode>
        caption="All modes"
        columns={[
          {
            id: 'modeId',
            header: 'Id',
            sortField: 'modeId',
            cell: (m) => <code className="text-xs">{m.modeId}</code>,
          },
          { id: 'modeName', header: 'Name', cell: (m) => m.modeName },
          { id: 'phase', header: 'Phase', sortField: 'phase', cell: (m) => m.phase },
          {
            id: 'enabled',
            header: 'Status',
            sortField: 'enabled',
            cell: (m) => (
              <Badge variant={m.enabled ? 'default' : 'muted'}>
                {m.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            ),
          },
          {
            id: 'updatedAt',
            header: 'Updated',
            sortField: 'updatedAt',
            cell: (m) => (
              <time dateTime={m.updatedAt} className="text-xs text-muted-foreground">
                {new Date(m.updatedAt).toLocaleDateString()}
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
          { id: 'q', label: 'Search', type: 'text', placeholder: 'Search id…' },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New mode
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(m) => m.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No modes match these filters."
        actions={(m) => (
          <ModeRowActions
            mode={m}
            onEdit={() => setFormState({ kind: 'edit', mode: m })}
            onDeactivate={() => setDeactivating(m)}
          />
        )}
      />

      <ModeFormDialog state={formState} onClose={() => setFormState(null)} />
      <ModeDeactivate mode={deactivating} onClose={() => setDeactivating(null)} />
    </div>
  );
}

function ModeRowActions({
  mode,
  onEdit,
  onDeactivate,
}: {
  mode: HoroscopeMode;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const update = useUpdateHoroscopeMode();
  async function reactivate() {
    try {
      await update.mutateAsync({
        id: mode.id,
        changes: { enabled: true },
        expectedUpdatedAt: mode.updatedAt,
      });
      notify.success(`${mode.modeName} enabled`);
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(() => undefined, 'This mode changed since you opened the list — reload.');
      } else {
        notify.error(error, 'Could not enable this mode.');
      }
    }
  }
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      {mode.enabled ? (
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

function ModeDeactivate({ mode, onClose }: { mode: HoroscopeMode | null; onClose: () => void }) {
  const deactivate = useDeactivateHoroscopeMode();
  return (
    <DeactivateDialog
      open={mode !== null}
      onClose={onClose}
      entityLabel="mode"
      name={mode?.modeName ?? ''}
      note="Authored results for this mode are untouched."
      onConfirm={() => deactivate.mutateAsync({ id: mode!.id, expectedUpdatedAt: mode!.updatedAt })}
    />
  );
}

function ModeFormDialog({ state, onClose }: { state: FormState; onClose: () => void }) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        {state?.kind === 'edit' ? (
          <EditMode key={state.mode.updatedAt} mode={state.mode} onClose={onClose} />
        ) : (
          <CreateMode onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateMode({ onClose }: { onClose: () => void }) {
  const create = useCreateHoroscopeMode();
  return (
    <>
      <DialogHeader>
        <DialogTitle>New mode</DialogTitle>
        <DialogDescription>The mode id is a permanent business key.</DialogDescription>
      </DialogHeader>
      <EntityForm<ModeFormValues>
        mode="create"
        entityLabel="Mode"
        schema={ModeFormSchema}
        defaultValues={{ modeId: '', modeName: '', phase: 1, enabled: true }}
        fields={[
          {
            name: 'modeId',
            label: 'Mode id',
            type: 'text',
            required: true,
            placeholder: 'daily',
            description: 'Permanent business key — cannot be changed later.',
          },
          { name: 'modeName', label: 'Name', type: 'text', required: true },
          { name: 'phase', label: 'Phase', type: 'number' },
          { name: 'enabled', label: 'Enabled', type: 'switch' },
        ]}
        onSubmit={(values) =>
          create.mutateAsync({
            modeId: values.modeId,
            modeName: values.modeName,
            phase: values.phase,
            enabled: values.enabled,
          })
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditMode({ mode, onClose }: { mode: HoroscopeMode; onClose: () => void }) {
  const update = useUpdateHoroscopeMode();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{mode.modeName}”</DialogTitle>
        <DialogDescription>The mode id is permanent and cannot be changed.</DialogDescription>
      </DialogHeader>
      <EntityForm<ModeFormValues>
        mode="edit"
        entityLabel="Mode"
        schema={ModeFormSchema}
        updatedAt={mode.updatedAt}
        defaultValues={{
          modeId: mode.modeId,
          modeName: mode.modeName,
          phase: mode.phase,
          enabled: mode.enabled,
        }}
        fields={[
          { name: 'modeId', label: 'Mode id', type: 'text', disabled: true, description: 'Permanent business key.' },
          { name: 'modeName', label: 'Name', type: 'text', required: true },
          { name: 'phase', label: 'Phase', type: 'number' },
          { name: 'enabled', label: 'Enabled', type: 'switch' },
        ]}
        onSubmit={(values) => {
          const changes: ModeChanges = {};
          if (values.modeName !== mode.modeName) changes.modeName = values.modeName;
          if (values.phase !== mode.phase) changes.phase = values.phase;
          if (values.enabled !== mode.enabled) changes.enabled = values.enabled;
          return update.mutateAsync({
            id: mode.id,
            changes,
            expectedUpdatedAt: values.updatedAt as string,
          });
        }}
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}
