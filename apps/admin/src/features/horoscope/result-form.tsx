import * as React from 'react';
import { z } from 'zod';

import { EntityForm } from '@/components/entity-form/entity-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ApiError, errorMessage } from '@/lib/api-error';

import {
  useHoroscopeResult,
  useCreateHoroscopeResult,
  useUpdateHoroscopeResult,
  type HoroscopeResult,
  type ResultChanges,
  type ResultStep,
} from './use-horoscope-results';
import { useAllHoroscopeModes } from './use-horoscope-modes';
import { useHoroscopeStepsForMode } from './use-horoscope-steps';
import { StepsEditor, asSteps } from './steps-editor';
import { ZODIAC_IDS, HOROSCOPE_LOCALES, DATE_IST_PATTERN, istTomorrow, zodiacLabel } from './constants';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  The daily-result create/edit form (spec §(b), §(c), §(d)).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * CREATE is TWO-PHASE by necessity: the four determinism-key fields
 * (`zodiacId`, `modeId`, `dateIst`, `languageCode`) are selects — never free
 * text; a typo saves a row that is valid and NEVER served (no FK) — and the
 * `steps` editor is scoped to the chosen `modeId` (its `stepId` select + prefill
 * come from that mode's `HoroscopeStepConfig`). So the editor picks the key
 * first, then authors the steps. On save all four ride in the `<EntityForm>`
 * payload as disabled, create-only fields.
 *
 * EDIT keeps all four key fields DISABLED (immutable in PATCH — TAM-100 rejects
 * them) and sends only the changed `steps` / `providerName` / `generatedAt`.
 *
 * `contentSafetyStatus` is SERVER-COMPUTED and READ-ONLY (spec §(d),
 * #EXPORT_CRITICAL): it is displayed, never submitted, and there is no free-text
 * input for it — an editable one would let an editor forge a safety attestation.
 * A prohibited claim in a step is the API's 400 (`CONTENT_SAFETY_VIOLATION`),
 * surfaced verbatim by `<EntityForm>`; a duplicate key is a 409 remapped to a
 * clear "already exists — edit it instead" message.
 */

const stepSchema = z.object({
  stepId: z.string().min(1, 'Pick a step'),
  title: z.string(),
  displayText: z.string().trim().min(1, 'Enter display text'),
  ttsText: z.string().trim().min(1, 'Enter TTS text'),
  order: z.number().int(),
  contentType: z.string(),
});

const ResultFormSchema = z.object({
  zodiacId: z.string().min(1, 'Pick a sign'),
  modeId: z.string().min(1, 'Pick a mode'),
  dateIst: z.string().regex(DATE_IST_PATTERN, 'Use a YYYY-MM-DD date'),
  languageCode: z.string().min(1, 'Pick a language'),
  steps: z.array(stepSchema).min(1, 'Add at least one step'),
  providerName: z.string().trim().min(1, 'Enter a provider name'),
  generatedAt: z.string(),
  contentSafetyStatus: z.string(),
});
type ResultFormValues = z.infer<typeof ResultFormSchema>;

export type ResultFormState =
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | null;

export function ResultFormDialog({
  state,
  onClose,
}: {
  state: ResultFormState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditResult id={state.id} onClose={onClose} />
        ) : (
          <CreateResult onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Read-only content-safety display (never an editable field) ───────────────

function ContentSafetyBadge({ value }: { value: unknown }) {
  const status = typeof value === 'string' && value.length > 0 ? value : 'not evaluated';
  return (
    <div className="grid gap-1">
      <Badge variant={status === 'passed' ? 'default' : 'muted'}>{status}</Badge>
      <p className="text-xs text-muted-foreground">
        Server-computed from the steps’ content safety. Read-only — it cannot be set by hand.
      </p>
    </div>
  );
}

// ── Create (two-phase: choose the determinism key, then author steps) ─────────

function CreateResult({ onClose }: { onClose: () => void }) {
  const modes = useAllHoroscopeModes();
  const [key, setKey] = React.useState({
    zodiacId: '',
    modeId: '',
    dateIst: istTomorrow(),
    languageCode: '',
  });
  const [confirmed, setConfirmed] = React.useState(false);

  const modeOptions = (modes.data?.items ?? []).map((m) => ({
    label: `${m.modeName} (${m.modeId})`,
    value: m.modeId,
  }));
  const canContinue =
    key.zodiacId !== '' &&
    key.modeId !== '' &&
    DATE_IST_PATTERN.test(key.dateIst) &&
    key.languageCode !== '';

  if (!confirmed) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>New daily horoscope</DialogTitle>
          <DialogDescription>
            Choose the sign, mode, date and language. These four are the determinism key — they are
            permanent and cannot be changed after creation, because changing one means a different
            day’s horoscope.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <KeySelect
            id="create-zodiacId"
            label="Sign"
            value={key.zodiacId}
            options={ZODIAC_IDS}
            onChange={(zodiacId) => setKey((k) => ({ ...k, zodiacId }))}
          />
          <KeySelect
            id="create-modeId"
            label="Mode"
            value={key.modeId}
            options={modeOptions}
            onChange={(modeId) => setKey((k) => ({ ...k, modeId }))}
          />
          <div className="grid gap-1">
            <label htmlFor="create-dateIst" className="text-sm font-medium">
              Date (IST)
            </label>
            <Input
              id="create-dateIst"
              type="date"
              value={key.dateIst}
              onChange={(event) => setKey((k) => ({ ...k, dateIst: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              A civil YYYY-MM-DD date in IST — not a timestamp.
            </p>
          </div>
          <KeySelect
            id="create-languageCode"
            label="Language"
            value={key.languageCode}
            options={HOROSCOPE_LOCALES}
            onChange={(languageCode) => setKey((k) => ({ ...k, languageCode }))}
          />

          <div className="flex gap-2">
            <Button type="button" disabled={!canContinue} onClick={() => setConfirmed(true)}>
              Continue to steps
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <CreateResultSteps
      determinismKey={key}
      onBack={() => setConfirmed(false)}
      onClose={onClose}
    />
  );
}

function KeySelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function CreateResultSteps({
  determinismKey,
  onBack,
  onClose,
}: {
  determinismKey: { zodiacId: string; modeId: string; dateIst: string; languageCode: string };
  onBack: () => void;
  onClose: () => void;
}) {
  const create = useCreateHoroscopeResult();
  const configs = useHoroscopeStepsForMode(determinismKey.modeId);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {zodiacLabel(determinismKey.zodiacId)} · {determinismKey.dateIst} ·{' '}
          {determinismKey.languageCode}
        </DialogTitle>
        <DialogDescription>
          Author the ordered steps for this horoscope.{' '}
          <button type="button" className="underline" onClick={onBack}>
            Change the sign, mode, date or language
          </button>
          .
        </DialogDescription>
      </DialogHeader>

      <EntityForm<ResultFormValues>
        mode="create"
        entityLabel="Daily result"
        schema={ResultFormSchema}
        defaultValues={{
          zodiacId: determinismKey.zodiacId,
          modeId: determinismKey.modeId,
          dateIst: determinismKey.dateIst,
          languageCode: determinismKey.languageCode,
          steps: [],
          providerName: 'cms',
          generatedAt: '',
          contentSafetyStatus: '',
        }}
        fields={[
          {
            name: 'steps',
            label: 'Steps',
            type: 'custom',
            required: true,
            render: (props) => (
              <StepsEditor
                value={asSteps(props.value)}
                onChange={props.onChange}
                disabled={props.disabled}
                configs={configs.data?.items ?? []}
                isLoadingConfigs={configs.isLoading}
                modeChosen
              />
            ),
          },
          {
            name: 'providerName',
            label: 'Provider name',
            type: 'text',
            required: true,
            description: 'Defaults to “cms” — the Phase-1 content provider.',
          },
          {
            name: 'generatedAt',
            label: 'Generated at (optional)',
            type: 'text',
            placeholder: 'Leave blank to use now',
            description: 'ISO timestamp; leave blank to let the server stamp it.',
          },
        ]}
        onSubmit={(values) =>
          create
            .mutateAsync({
              zodiacId: values.zodiacId as never,
              modeId: values.modeId,
              dateIst: values.dateIst,
              languageCode: values.languageCode as never,
              steps: values.steps as ResultStep[],
              providerName: values.providerName,
              ...(values.generatedAt.trim() !== '' ? { generatedAt: values.generatedAt } : {}),
            })
            .catch(rethrowDuplicateKey)
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

// ── Edit ─────────────────────────────────────────────────────────────────────

function EditResult({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: result, isLoading, isError, error } = useHoroscopeResult(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit daily horoscope</DialogTitle>
          <DialogDescription>Loading…</DialogDescription>
        </DialogHeader>
        <Skeleton className="h-48 w-full" />
      </>
    );
  }
  if (isError || !result) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit daily horoscope</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this result</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {zodiacLabel(result.zodiacId)} · {result.dateIst} · {result.languageCode}
        </DialogTitle>
        <DialogDescription>
          The sign, mode, date and language are the determinism key and cannot be changed. Edit the
          steps and provider details below.
        </DialogDescription>
      </DialogHeader>
      {/* REMOUNT on updatedAt so the form rebinds to fresh data after a refetch. */}
      <EditResultForm key={result.updatedAt} result={result} onClose={onClose} />
    </>
  );
}

function EditResultForm({ result, onClose }: { result: HoroscopeResult; onClose: () => void }) {
  const update = useUpdateHoroscopeResult();
  const configs = useHoroscopeStepsForMode(result.modeId);

  return (
    <EntityForm<ResultFormValues>
      mode="edit"
      entityLabel="Daily result"
      schema={ResultFormSchema}
      updatedAt={result.updatedAt}
      defaultValues={{
        zodiacId: result.zodiacId,
        modeId: result.modeId,
        dateIst: result.dateIst,
        languageCode: result.languageCode,
        steps: result.steps,
        providerName: result.providerName,
        generatedAt: result.generatedAt ?? '',
        contentSafetyStatus: result.contentSafetyStatus,
      }}
      fields={[
        { name: 'zodiacId', label: 'Sign', type: 'text', disabled: true },
        { name: 'modeId', label: 'Mode', type: 'text', disabled: true },
        { name: 'dateIst', label: 'Date (IST)', type: 'text', disabled: true },
        { name: 'languageCode', label: 'Language', type: 'text', disabled: true },
        {
          name: 'contentSafetyStatus',
          label: 'Content safety',
          type: 'custom',
          render: (props) => <ContentSafetyBadge value={props.value} />,
        },
        {
          name: 'steps',
          label: 'Steps',
          type: 'custom',
          required: true,
          render: (props) => (
            <StepsEditor
              value={asSteps(props.value)}
              onChange={props.onChange}
              disabled={props.disabled}
              configs={configs.data?.items ?? []}
              isLoadingConfigs={configs.isLoading}
              modeChosen
            />
          ),
        },
        { name: 'providerName', label: 'Provider name', type: 'text', required: true },
        { name: 'generatedAt', label: 'Generated at (optional)', type: 'text' },
      ]}
      onSubmit={(values) => {
        // SEND ONLY WHAT CHANGED (#EXPORT_CRITICAL); the four key fields are
        // immutable and never sent; contentSafetyStatus is server-computed and
        // never sent.
        const changes: ResultChanges = {};
        if (JSON.stringify(values.steps) !== JSON.stringify(result.steps))
          changes.steps = values.steps as ResultStep[];
        if (values.providerName !== result.providerName) changes.providerName = values.providerName;
        if (values.generatedAt.trim() !== (result.generatedAt ?? '') && values.generatedAt.trim() !== '')
          changes.generatedAt = values.generatedAt;
        return update.mutateAsync({
          id: result.id,
          changes,
          expectedUpdatedAt: values.updatedAt as string,
        });
      }}
      onSuccess={onClose}
      onCancel={onClose}
    />
  );
}

/**
 * Turn a create-time 409 (duplicate determinism key) into a non-conflict
 * `ApiError` with a clear message, so `<EntityForm>` surfaces "already exists —
 * edit it instead" rather than its generic stale-write concurrency copy (§(b)).
 */
function rethrowDuplicateKey(error: unknown): never {
  if (error instanceof ApiError && error.status === 409) {
    throw new ApiError(
      'A horoscope already exists for this sign, mode, date and language — edit that row instead of creating a new one.',
      422,
      error.errorCode,
    );
  }
  throw error;
}
