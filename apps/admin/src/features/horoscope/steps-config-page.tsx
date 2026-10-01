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
  useHoroscopeSteps,
  useCreateHoroscopeStep,
  useUpdateHoroscopeStep,
  useDeactivateHoroscopeStep,
  type HoroscopeStep,
  type StepChanges,
} from './use-horoscope-steps';
import { useAllHoroscopeModes } from './use-horoscope-modes';
import { localeMapField, asLocaleMap, localeMapEquals } from './locale-map-field';
import { DeactivateDialog } from './deactivate-dialog';
import { CONTENT_TYPES, SAFETY_CATEGORIES } from './constants';

/**
 * Step config (spec §(f)) — the DATA-DRIVEN ordered-step catalogue. Add / remove
 * (= deactivate) / reorder (order) / rename / enable-disable are all row edits.
 * `stepId` + `modeId` are create-only business keys; the flag is `enabled`;
 * `contentType` and `safetyCategory` are selects (a wrong safety bucket weakens a
 * check); `providerMapping` carries a detach warning (TAM-100 AC (e)).
 */

const StepFormSchema = z.object({
  stepId: z.string().trim().min(1, 'Enter a step id').max(64, '64 characters or fewer'),
  modeId: z.string().min(1, 'Pick a mode'),
  title: z.string().trim().min(1, 'Enter a title').max(160, '160 characters or fewer'),
  localizedTitle: z.record(z.string(), z.string()),
  order: z.number().int('Whole numbers only'),
  contentType: z.string().min(1, 'Pick a content type'),
  providerMapping: z.string().trim().min(1, 'Enter the provider mapping'),
  safetyCategory: z.string().min(1, 'Pick a safety category'),
  ttsEnabled: z.boolean(),
  enabled: z.boolean(),
});
type StepFormValues = z.infer<typeof StepFormSchema>;

const PROVIDER_MAPPING_WARNING =
  'Changing the provider mapping silently detaches this step from its content source.';

type FormState = { kind: 'create' } | { kind: 'edit'; step: HoroscopeStep } | null;

export function StepsConfigPage() {
  const table = useDataTableState({ sort: 'order', order: 'asc' });
  const { data, isLoading, isFetching, isError, error, refetch } = useHoroscopeSteps(table.state);
  const modes = useAllHoroscopeModes();

  const [formState, setFormState] = React.useState<FormState>(null);
  const [deactivating, setDeactivating] = React.useState<HoroscopeStep | null>(null);

  const modeOptions = (modes.data?.items ?? []).map((m) => ({
    label: `${m.modeName} (${m.modeId})`,
    value: m.modeId,
  }));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Step config</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The ordered steps each mode is authored against. Add, rename, reorder or disable a step
          here — the provider reads these directly, so an edit flows straight into what the app
          renders. No deploy required.
        </p>
      </div>

      <DataTable<HoroscopeStep>
        caption="All step configs"
        columns={[
          {
            id: 'stepId',
            header: 'Step id',
            sortField: 'stepId',
            cell: (s) => <code className="text-xs">{s.stepId}</code>,
          },
          {
            id: 'modeId',
            header: 'Mode',
            sortField: 'modeId',
            cell: (s) => <code className="text-xs">{s.modeId}</code>,
          },
          { id: 'title', header: 'Title', cell: (s) => s.title },
          { id: 'order', header: 'Order', sortField: 'order', cell: (s) => s.order },
          { id: 'contentType', header: 'Type', cell: (s) => <Badge variant="muted">{s.contentType}</Badge> },
          { id: 'safetyCategory', header: 'Safety', cell: (s) => s.safetyCategory },
          { id: 'tts', header: 'TTS', cell: (s) => (s.ttsEnabled ? 'On' : 'Off') },
          {
            id: 'enabled',
            header: 'Status',
            sortField: 'enabled',
            cell: (s) => (
              <Badge variant={s.enabled ? 'default' : 'muted'}>
                {s.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            ),
          },
        ]}
        filterFields={[
          { id: 'modeId', label: 'Mode', type: 'select', options: modeOptions },
          {
            id: 'enabled',
            label: 'Status',
            type: 'select',
            options: [
              { label: 'Enabled', value: 'true' },
              { label: 'Disabled', value: 'false' },
            ],
          },
        ]}
        toolbar={
          <Button size="sm" onClick={() => setFormState({ kind: 'create' })}>
            <PlusIcon aria-hidden="true" />
            New step
          </Button>
        }
        rows={data?.items}
        total={data?.total}
        getRowId={(s) => s.id}
        state={table.state}
        onStateChange={table.setState}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="No steps match these filters."
        actions={(s) => (
          <StepRowActions
            step={s}
            onEdit={() => setFormState({ kind: 'edit', step: s })}
            onDeactivate={() => setDeactivating(s)}
          />
        )}
      />

      <StepFormDialog state={formState} modeOptions={modeOptions} onClose={() => setFormState(null)} />
      <StepDeactivate step={deactivating} onClose={() => setDeactivating(null)} />
    </div>
  );
}

function StepRowActions({
  step,
  onEdit,
  onDeactivate,
}: {
  step: HoroscopeStep;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const update = useUpdateHoroscopeStep();
  async function reactivate() {
    try {
      await update.mutateAsync({
        id: step.id,
        changes: { enabled: true },
        expectedUpdatedAt: step.updatedAt,
      });
      notify.success(`${step.title} enabled`);
    } catch (error) {
      if (isConflictError(error)) {
        notify.conflict(() => undefined, 'This step changed since you opened the list — reload.');
      } else {
        notify.error(error, 'Could not enable this step.');
      }
    }
  }
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon aria-hidden="true" />
        Edit
      </Button>
      {step.enabled ? (
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

function StepDeactivate({ step, onClose }: { step: HoroscopeStep | null; onClose: () => void }) {
  const deactivate = useDeactivateHoroscopeStep();
  return (
    <DeactivateDialog
      open={step !== null}
      onClose={onClose}
      entityLabel="step"
      name={step?.title ?? ''}
      note="Authored results keep their existing step content; a disabled step is skipped when serving."
      onConfirm={() => deactivate.mutateAsync({ id: step!.id, expectedUpdatedAt: step!.updatedAt })}
    />
  );
}

function StepFormDialog({
  state,
  modeOptions,
  onClose,
}: {
  state: FormState;
  modeOptions: { label: string; value: string }[];
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditStep key={state.step.updatedAt} step={state.step} onClose={onClose} />
        ) : (
          <CreateStep modeOptions={modeOptions} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateStep({
  modeOptions,
  onClose,
}: {
  modeOptions: { label: string; value: string }[];
  onClose: () => void;
}) {
  const create = useCreateHoroscopeStep();
  return (
    <>
      <DialogHeader>
        <DialogTitle>New step</DialogTitle>
        <DialogDescription>
          The step id and mode are permanent. Steps are ordered within a mode.
        </DialogDescription>
      </DialogHeader>
      <EntityForm<StepFormValues>
        mode="create"
        entityLabel="Step"
        schema={StepFormSchema}
        defaultValues={{
          stepId: '',
          modeId: '',
          title: '',
          localizedTitle: {},
          order: 0,
          contentType: 'text',
          providerMapping: '',
          safetyCategory: 'harm',
          ttsEnabled: true,
          enabled: true,
        }}
        fields={[
          { name: 'stepId', label: 'Step id', type: 'text', required: true, description: 'Permanent business key.' },
          { name: 'modeId', label: 'Mode', type: 'select', required: true, options: modeOptions },
          { name: 'title', label: 'Title', type: 'text', required: true },
          { name: 'localizedTitle', label: 'Localized titles', type: 'custom', render: localeMapField() },
          { name: 'order', label: 'Order', type: 'number' },
          { name: 'contentType', label: 'Content type', type: 'select', required: true, options: CONTENT_TYPES },
          {
            name: 'providerMapping',
            label: 'Provider mapping',
            type: 'text',
            required: true,
            description: PROVIDER_MAPPING_WARNING,
          },
          { name: 'safetyCategory', label: 'Safety category', type: 'select', required: true, options: SAFETY_CATEGORIES },
          { name: 'ttsEnabled', label: 'TTS enabled', type: 'switch' },
          { name: 'enabled', label: 'Enabled', type: 'switch' },
        ]}
        onSubmit={(values) =>
          create.mutateAsync({
            stepId: values.stepId,
            modeId: values.modeId,
            title: values.title,
            localizedTitle: values.localizedTitle,
            order: values.order,
            contentType: values.contentType as never,
            providerMapping: values.providerMapping,
            safetyCategory: values.safetyCategory as never,
            ttsEnabled: values.ttsEnabled,
            enabled: values.enabled,
          })
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditStep({ step, onClose }: { step: HoroscopeStep; onClose: () => void }) {
  const update = useUpdateHoroscopeStep();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{step.title}”</DialogTitle>
        <DialogDescription>The step id and mode are permanent and cannot be changed.</DialogDescription>
      </DialogHeader>
      <EntityForm<StepFormValues>
        mode="edit"
        entityLabel="Step"
        schema={StepFormSchema}
        updatedAt={step.updatedAt}
        defaultValues={{
          stepId: step.stepId,
          modeId: step.modeId,
          title: step.title,
          localizedTitle: asLocaleMap(step.localizedTitle),
          order: step.order,
          contentType: step.contentType,
          providerMapping: step.providerMapping,
          safetyCategory: step.safetyCategory,
          ttsEnabled: step.ttsEnabled,
          enabled: step.enabled,
        }}
        fields={[
          { name: 'stepId', label: 'Step id', type: 'text', disabled: true },
          { name: 'modeId', label: 'Mode', type: 'text', disabled: true },
          { name: 'title', label: 'Title', type: 'text', required: true },
          { name: 'localizedTitle', label: 'Localized titles', type: 'custom', render: localeMapField() },
          { name: 'order', label: 'Order', type: 'number' },
          { name: 'contentType', label: 'Content type', type: 'select', required: true, options: CONTENT_TYPES },
          {
            name: 'providerMapping',
            label: 'Provider mapping',
            type: 'text',
            required: true,
            description: PROVIDER_MAPPING_WARNING,
          },
          { name: 'safetyCategory', label: 'Safety category', type: 'select', required: true, options: SAFETY_CATEGORIES },
          { name: 'ttsEnabled', label: 'TTS enabled', type: 'switch' },
          { name: 'enabled', label: 'Enabled', type: 'switch' },
        ]}
        onSubmit={(values) => {
          const changes: StepChanges = {};
          if (values.title !== step.title) changes.title = values.title;
          if (!localeMapEquals(values.localizedTitle, asLocaleMap(step.localizedTitle)))
            changes.localizedTitle = values.localizedTitle;
          if (values.order !== step.order) changes.order = values.order;
          if (values.contentType !== step.contentType) changes.contentType = values.contentType as never;
          if (values.providerMapping !== step.providerMapping)
            changes.providerMapping = values.providerMapping;
          if (values.safetyCategory !== step.safetyCategory)
            changes.safetyCategory = values.safetyCategory as never;
          if (values.ttsEnabled !== step.ttsEnabled) changes.ttsEnabled = values.ttsEnabled;
          if (values.enabled !== step.enabled) changes.enabled = values.enabled;
          return update.mutateAsync({
            id: step.id,
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
