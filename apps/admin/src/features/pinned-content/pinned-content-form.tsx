import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { errorMessage, ApiError } from '@/lib/api-error';
import { notify } from '@/lib/toast';
import { adminKeys } from '@/lib/query-keys';
import { DeitySelect } from '@/features/status/deity-select';

import {
  useCreatePin,
  usePinnedContent,
  useUpdatePin,
  type PinCreateBody,
  type PinnedContentDetail,
  type PinPatchBody,
} from './use-pinned-content';
import {
  PIN_SURFACES,
  PinnedContentFormSchema,
  SURFACE_OPTIONS,
  addDays,
  daysBetween,
  istLocalToUtcIso,
  utcIsoToIstLocal,
  type PinSurface,
  type PinnedContentFormValues,
} from './pinned-content-schema';
import { ContentPickerField } from './content-picker';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  PinnedContentFormDialog — create + edit modal (mirrors status/item-form.tsx).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Modal, not a drawer — the sibling that carries the closest field-shape
 * (`apps/admin/src/features/status/item-form.tsx`) is a Dialog, and every
 * decision this form makes (surface picker discriminating the deity + content
 * fields, IST-labelled datetime pickers, Duration helper) fits inside one
 * scroll-container without needing a side panel's persistent visibility.
 *
 * The form is deliberately NOT built on `<EntityForm>`: the two-way binding
 * between the Duration-in-days helper and `endAt` needs a controller that
 * sees both fields at once, and the surface picker gates two other fields
 * (deity + content). `<EntityForm>` keys errors by `issue.path[0]`, which
 * would collapse both cross-field checks into one message. Same reason
 * `paywall/utm-overrides-page.tsx` is also hand-rolled.
 *
 * Behaviour rules — from TAM-173 AC (Admin UI section):
 *  - `surface = home | status_all_gods` → the Deity field is not rendered
 *    AND its value is cleared. A previously typed slug never reaches the wire.
 *  - `surface = status_deity` → the Deity field appears; the content picker
 *    fetches deity-scoped status rows.
 *  - Start / End are IST-labelled `datetime-local` inputs; the submit payload
 *    carries UTC ISO (`toISOString()` after applying `+05:30`).
 *  - Duration in days is a helper — Start + N days → End auto-fills; editing
 *    End directly re-derives N. Only Start + End are sent on the wire.
 *  - Server 409 on `pin_position_taken` → toast the server's message (which
 *    already carries `position N is taken by pin ID X` per the API's
 *    error copy).
 */

export type PinnedContentFormState =
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | null;

export function PinnedContentFormDialog({
  state,
  onClose,
}: {
  state: PinnedContentFormState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditPin id={state.id} onClose={onClose} />
        ) : (
          <CreatePin onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Create ───────────────────────────────────────────────────────────────────

function CreatePin({ onClose }: { onClose: () => void }) {
  const create = useCreatePin();
  return (
    <>
      <DialogHeader>
        <DialogTitle>New pin</DialogTitle>
        <DialogDescription>
          Pins live above the 2-hourly rotation for a bounded window. All
          dates are IST — the wire body carries UTC.
        </DialogDescription>
      </DialogHeader>
      <PinForm
        mode="create"
        busy={create.isPending}
        defaultValues={{
          surface: 'home',
          deitySlug: '',
          contentId: '',
          pinPosition: '',
          startAtLocal: '',
          endAtLocal: '',
          durationDays: '',
        }}
        onSubmit={async (values) => {
          const body = toCreateBody(values);
          await create.mutateAsync(body);
          notify.success('Pin created');
          onClose();
        }}
        onCancel={onClose}
      />
    </>
  );
}

function toCreateBody(values: PinnedContentFormValues): PinCreateBody {
  const startAt = istLocalToUtcIso(values.startAtLocal) as string;
  const endAt = istLocalToUtcIso(values.endAtLocal) as string;
  const base: PinCreateBody = {
    surface: values.surface,
    contentId: values.contentId,
    pinPosition: values.pinPosition === '' ? 0 : values.pinPosition,
    startAt,
    endAt,
  };
  if (values.surface === 'status_deity') {
    base.deitySlug = values.deitySlug;
  }
  return base;
}

// ── Edit ─────────────────────────────────────────────────────────────────────

function EditPin({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, isError, error } = usePinnedContent(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit pin</DialogTitle>
          <DialogDescription>Loading…</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit pin</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this pin</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit pin</DialogTitle>
        <DialogDescription>
          {`Surface: ${data.surface}`}
          {data.deitySlug !== null && ` · Deity: ${data.deitySlug}`}
        </DialogDescription>
      </DialogHeader>
      {/* REMOUNT on `updatedAt` so the editor rebinds cleanly after a refetch. */}
      <EditPinForm key={data.updatedAt} pin={data} onClose={onClose} />
    </>
  );
}

function EditPinForm({ pin, onClose }: { pin: PinnedContentDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const update = useUpdatePin();

  return (
    <PinForm
      mode="edit"
      busy={update.isPending}
      defaultValues={{
        surface: pin.surface,
        deitySlug: pin.deitySlug ?? '',
        contentId: pin.contentId,
        pinPosition: pin.pinPosition,
        startAtLocal: utcIsoToIstLocal(pin.startAt),
        endAtLocal: utcIsoToIstLocal(pin.endAt),
        durationDays: daysBetween(
          utcIsoToIstLocal(pin.startAt),
          utcIsoToIstLocal(pin.endAt),
        ),
      }}
      // Surface is immutable on the wire — the server rejects a change to
      // it. Disable the field in the UI and never send it in `changes`.
      surfaceLocked
      onSubmit={async (values) => {
        const changes = diffPin(values, pin);
        if (Object.keys(changes).length === 0) {
          notify.info('Nothing to save.');
          onClose();
          return;
        }
        try {
          await update.mutateAsync({
            id: pin.id,
            changes,
            expectedUpdatedAt: pin.updatedAt,
          });
          notify.success('Pin saved');
          onClose();
        } catch (err) {
          if (err instanceof ApiError && err.isConflict) {
            void qc.invalidateQueries({
              queryKey: adminKeys.detail('pinned-content', pin.id),
            });
          }
          throw err;
        }
      }}
      onCancel={onClose}
    />
  );
}

type PatchChanges = Omit<PinPatchBody, 'expectedUpdatedAt'>;

function diffPin(values: PinnedContentFormValues, pin: PinnedContentDetail): PatchChanges {
  const changes: PatchChanges = {};
  if (values.contentId !== pin.contentId) changes.contentId = values.contentId;
  const position = values.pinPosition === '' ? 0 : values.pinPosition;
  if (position !== pin.pinPosition) changes.pinPosition = position;
  const startAt = istLocalToUtcIso(values.startAtLocal);
  if (startAt !== null && startAt !== pin.startAt) changes.startAt = startAt;
  const endAt = istLocalToUtcIso(values.endAtLocal);
  if (endAt !== null && endAt !== pin.endAt) changes.endAt = endAt;
  return changes;
}

// ── The form body — shared by create + edit ──────────────────────────────────

function PinForm({
  mode,
  busy,
  defaultValues,
  surfaceLocked = false,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit';
  busy: boolean;
  defaultValues: PinnedContentFormValues;
  surfaceLocked?: boolean;
  onSubmit: (values: PinnedContentFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = React.useState<PinnedContentFormValues>(defaultValues);
  const [errors, setErrors] = React.useState<Partial<Record<string, string>>>({});
  const [submitError, setSubmitError] = React.useState<unknown>(null);

  function set<K extends keyof PinnedContentFormValues>(
    key: K,
    value: PinnedContentFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key as string] !== undefined) {
      setErrors((current) => ({ ...current, [key as string]: undefined }));
    }
  }

  function onSurfaceChange(next: PinSurface) {
    // Clear the deity slug when surface leaves status_deity — a slug on the
    // wire would earn a `deity_slug_not_allowed` 400.
    setValues((current) => ({
      ...current,
      surface: next,
      deitySlug: next === 'status_deity' ? current.deitySlug : '',
      // A picked contentId belongs to a different catalogue when surface
      // changes — a home_feed id is a `unknown_content_id` on a status pin.
      // Wipe it so the picker's radio group starts fresh.
      contentId: current.surface === next ? current.contentId : '',
    }));
    setErrors({});
  }

  /**
   * Two-way binding between Start + Duration and End. Editing Start or
   * Duration recomputes End; editing End recomputes Duration.
   */
  function onStartChange(next: string) {
    setValues((current) => {
      const nextValues: PinnedContentFormValues = { ...current, startAtLocal: next };
      if (current.durationDays !== '' && typeof current.durationDays === 'number') {
        const computedEnd = addDays(next, current.durationDays);
        if (computedEnd !== '') nextValues.endAtLocal = computedEnd;
      } else if (current.endAtLocal !== '') {
        nextValues.durationDays = daysBetween(next, current.endAtLocal);
      }
      return nextValues;
    });
    setErrors((current) => ({ ...current, startAtLocal: undefined }));
  }

  function onDurationChange(next: number | '') {
    setValues((current) => {
      const nextValues: PinnedContentFormValues = { ...current, durationDays: next };
      if (typeof next === 'number' && current.startAtLocal !== '') {
        const computedEnd = addDays(current.startAtLocal, next);
        if (computedEnd !== '') nextValues.endAtLocal = computedEnd;
      }
      return nextValues;
    });
  }

  function onEndChange(next: string) {
    setValues((current) => {
      const nextValues: PinnedContentFormValues = { ...current, endAtLocal: next };
      if (current.startAtLocal !== '') {
        nextValues.durationDays = daysBetween(current.startAtLocal, next);
      }
      return nextValues;
    });
    setErrors((current) => ({ ...current, endAtLocal: undefined }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setSubmitError(null);
    const parsed = PinnedContentFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<string, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && next[key] === undefined) {
          next[key] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      await onSubmit(values);
    } catch (err) {
      setSubmitError(err);
      notify.error(err, 'Could not save this pin.');
    }
  }

  const submitLabel = mode === 'create' ? 'Create pin' : 'Save changes';

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
    >
      {/* Surface */}
      <div className="grid gap-1.5">
        <Label htmlFor="pin-surface">Surface</Label>
        <Select
          id="pin-surface"
          value={values.surface}
          disabled={busy || surfaceLocked}
          onChange={(e) => onSurfaceChange(e.target.value as PinSurface)}
        >
          {PIN_SURFACES.map((surface) => (
            <option key={surface} value={surface}>
              {SURFACE_OPTIONS.find((option) => option.value === surface)?.label ?? surface}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          {surfaceLocked
            ? 'Surface is fixed after creation — create a new pin to change it.'
            : 'The feed the pin appears on. Status — per deity narrows to one deity.'}
        </p>
      </div>

      {/* Deity — only for status_deity */}
      {values.surface === 'status_deity' && (
        <div className="grid gap-1.5">
          <Label htmlFor="pin-deity">Deity</Label>
          <DeitySelect
            id="pin-deity"
            name="deitySlug"
            value={values.deitySlug}
            onChange={(next) => set('deitySlug', typeof next === 'string' ? next : '')}
            disabled={busy}
            invalid={errors.deitySlug !== undefined}
            describedBy={errors.deitySlug ? 'pin-deity-error' : undefined}
            // Hand-rolled form, but it does have sibling values — pass them so a
            // cross-field reader works here too.
            values={{ ...values }}
          />
          {errors.deitySlug ? (
            <p id="pin-deity-error" role="alert" className="text-xs text-destructive">
              {errors.deitySlug}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Chosen from the taxonomy list. Determines which status items the
              content picker below offers.
            </p>
          )}
        </div>
      )}

      {/* Content */}
      <div className="grid gap-1.5">
        <Label htmlFor="pin-content">Content</Label>
        <ContentPickerField
          id="pin-content"
          surface={values.surface}
          deitySlug={values.deitySlug}
          value={values.contentId}
          disabled={busy}
          invalid={errors.contentId !== undefined}
          describedBy={errors.contentId ? 'pin-content-error' : undefined}
          onChange={(next) => set('contentId', next)}
        />
        {errors.contentId ? (
          <p id="pin-content-error" role="alert" className="text-xs text-destructive">
            {errors.contentId}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            The item pinned to the top of this surface. Search by title, slug or ID.
          </p>
        )}
      </div>

      {/* Position */}
      <div className="grid gap-1.5">
        <Label htmlFor="pin-position">Position</Label>
        <Input
          id="pin-position"
          type="number"
          min={1}
          step={1}
          value={values.pinPosition === '' ? '' : String(values.pinPosition)}
          disabled={busy}
          aria-invalid={errors.pinPosition !== undefined || undefined}
          aria-describedby={errors.pinPosition ? 'pin-position-error' : 'pin-position-hint'}
          onChange={(e) =>
            set(
              'pinPosition',
              e.target.value === '' ? '' : Number(e.target.value),
            )
          }
        />
        {errors.pinPosition ? (
          <p id="pin-position-error" role="alert" className="text-xs text-destructive">
            {errors.pinPosition}
          </p>
        ) : (
          <p id="pin-position-hint" className="text-xs text-muted-foreground">
            1 = topmost. If the server returns 409 pin_position_taken, pick the
            next free position from the toast.
          </p>
        )}
      </div>

      {/* Start (IST) */}
      <div className="grid gap-1.5">
        <Label htmlFor="pin-start-at">Start at (IST)</Label>
        <Input
          id="pin-start-at"
          type="datetime-local"
          value={values.startAtLocal}
          disabled={busy}
          aria-invalid={errors.startAtLocal !== undefined || undefined}
          aria-describedby={errors.startAtLocal ? 'pin-start-error' : undefined}
          onChange={(e) => onStartChange(e.target.value)}
        />
        {errors.startAtLocal && (
          <p id="pin-start-error" role="alert" className="text-xs text-destructive">
            {errors.startAtLocal}
          </p>
        )}
      </div>

      {/* Duration in days */}
      <div className="grid gap-1.5">
        <Label htmlFor="pin-duration-days">Duration (days)</Label>
        <Input
          id="pin-duration-days"
          type="number"
          min={0}
          step={1}
          value={
            values.durationDays === '' || values.durationDays === undefined
              ? ''
              : String(values.durationDays)
          }
          disabled={busy}
          placeholder="e.g. 7"
          onChange={(e) =>
            onDurationChange(e.target.value === '' ? '' : Number(e.target.value))
          }
        />
        <p className="text-xs text-muted-foreground">
          Helper only — auto-fills the end date. The API stores only start and end.
        </p>
      </div>

      {/* End (IST) */}
      <div className="grid gap-1.5">
        <Label htmlFor="pin-end-at">End at (IST)</Label>
        <Input
          id="pin-end-at"
          type="datetime-local"
          value={values.endAtLocal}
          disabled={busy}
          aria-invalid={errors.endAtLocal !== undefined || undefined}
          aria-describedby={errors.endAtLocal ? 'pin-end-error' : undefined}
          onChange={(e) => onEndChange(e.target.value)}
        />
        {errors.endAtLocal && (
          <p id="pin-end-error" role="alert" className="text-xs text-destructive">
            {errors.endAtLocal}
          </p>
        )}
      </div>

      {submitError !== null && (
        <Alert variant="destructive">
          <AlertTitle>Could not save this pin</AlertTitle>
          <AlertDescription>
            {errorMessage(submitError, 'Please try again.')}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
