import * as React from 'react';
import type { ZodType } from 'zod';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  FormControl,
  FormDescription,
  FormField,
  FormLabel,
  FormMessage,
  useFormField,
} from '@/components/ui/form';
import { ApiError, errorMessage } from '@/lib/api-error';
import { notify } from '@/lib/toast';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  <EntityForm> — THE create/edit form. Its props are a CONTRACT with 9 tickets.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Every admin create/edit form is a CONFIG of this component. It exists so that
 * four things are done ONCE and identically everywhere:
 *
 *  1. **409 `STALE_WRITE` handling** (ADR C3). If each module handled its own
 *     conflict, it would be handled inconsistently or not at all. Here it is a
 *     conflict toast + a Reload action + an inline banner, always.
 *  2. **The `updatedAt` precondition.** In `mode="edit"` the row's `updatedAt`
 *     is merged into the submitted values — that IS the optimistic-concurrency
 *     precondition. Forget it and the API cannot detect a stale write at all.
 *  3. **Mutation feedback.** Success → success toast; failure → error toast
 *     carrying the SERVER's message. No mutation is ever silent.
 *  4. **No premature reset.** The form resets in the mutation's success path
 *     ONLY. `PHASE-NOTES.md` flags the original create-user form for resetting
 *     optimistically — wiping an editor's work on a request that then failed.
 *     Do not replicate that 20 more times.
 *
 * Client-side Zod is FAST FEEDBACK, NEVER THE ENFORCEMENT POINT — the API's Zod
 * at the route boundary is authoritative. Mirror the server schema here; if they
 * disagree, the server wins and its message is what the editor sees.
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 * ```tsx
 * const update = useUpdateDeity();
 * <EntityForm
 *   mode="edit"
 *   entityLabel="Deity"
 *   schema={DeityFormSchema}            // mirrors the server's Zod schema
 *   defaultValues={{ name: deity.name, slug: deity.slug, active: deity.active }}
 *   updatedAt={deity.updatedAt}         // REQUIRED in edit mode (ADR C3)
 *   fields={[
 *     { name: 'name', label: 'Name', type: 'text', required: true },
 *     { name: 'active', label: 'Active', type: 'switch' },
 *   ]}
 *   onSubmit={(values) => update.mutateAsync({ id: deity.id, ...values })}
 *   onConflict={() => refetch()}        // reload the row after a 409
 * />
 * ```
 *
 * ⚠️ `defaultValues` is SNAPSHOT into state on mount and is NOT re-synced when
 * the prop changes — deliberately, so a background refetch cannot wipe an edit
 * mid-typing. To rebind the form to freshly-loaded data, REMOUNT it:
 * `<EntityForm key={deity.updatedAt} … />`.
 *
 * Note this interacts with the 409 flow, and the default is the right one: after
 * a conflict the editor's typed values are KEPT while `updatedAt` (a prop)
 * refreshes, so hitting Save again re-applies their edit against the new
 * precondition. Only add a `key` if you want their edits discarded on reload.
 */
export type EntityFormFieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'url'
  | 'number'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'switch'
  | 'custom';

/**
 * What a `type: 'custom'` field's `render` receives.
 *
 * ⚠️ TAM-87 (`<MediaUploadField>`): THIS is your integration point. Render your
 * widget from `render`, call `onChange(publicUrl)` once the PUT completes, and
 * leave the value empty until it does — an empty required field makes the Zod
 * mirror block submit, which is exactly the "submitted before the upload
 * finished" guard your spec asks for. You need no change to `<EntityForm>`.
 */
export interface EntityFormFieldRenderProps {
  /** Wire to your control — matches the `<label htmlFor>`. */
  id: string;
  name: string;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  invalid: boolean;
  /** Pass to your control's `aria-describedby`. */
  describedBy: string | undefined;
  /**
   * EVERY field's current value, live. For a custom field that has to READ
   * across the form — a preview that composes several inputs into the thing
   * the end user will actually see (the shortcut tile's gradient + label +
   * icon, say) — rather than one that edits a single value.
   *
   * READ-ONLY BY CONVENTION. `onChange` still writes only THIS field; a custom
   * control that wants to write elsewhere is a sign the fields should be one
   * field holding an object, not several. Untyped (`Record<string, unknown>`)
   * because `EntityFormFieldRenderProps` is deliberately not generic — the
   * form's own `TValues` generic already type-checks the field NAMES, and a
   * reader casts what it needs.
   */
  values: Record<string, unknown>;
}

export interface EntityFormField<TValues> {
  name: Extract<keyof TValues, string>;
  label: string;
  type: EntityFormFieldType;
  placeholder?: string;
  /** Helper text, wired to the control via `aria-describedby`. */
  description?: string;
  /** Required for `type: 'select'`. */
  options?: { label: string; value: string }[];
  /** Renders the `*` hint. Actual enforcement is the Zod schema (+ the server). */
  required?: boolean;
  /**
   * Read-only. Use for SERVER-AUTHORITATIVE counters that must never be
   * editable (`playCount`, `setCount`, `shareCount` — epic "Never CRUD-able").
   */
  disabled?: boolean;
  /** Required when `type: 'custom'`. */
  render?: (props: EntityFormFieldRenderProps) => React.ReactNode;
  className?: string;
}

interface EntityFormBaseProps<TValues extends Record<string, unknown>> {
  fields: EntityFormField<TValues>[];
  defaultValues: TValues;
  /** Mirrors the server's Zod schema. Fast feedback only — never enforcement. */
  schema: ZodType<TValues>;
  /**
   * Performs the write. MUST return a promise that REJECTS on failure — throw an
   * `ApiError` (use `unwrap()` in your hook and it is done for you), or the 409
   * conflict path cannot fire.
   */
  onSubmit: (values: TValues & { updatedAt?: string }) => Promise<unknown>;
  onSuccess?: (result: unknown) => void;
  /**
   * Called after a 409 `STALE_WRITE`, and by the toast's "Reload" action.
   * Refetch the row here so the editor can re-apply their change to fresh data.
   */
  onConflict?: () => void;
  onCancel?: () => void;
  /** For toast/heading copy, e.g. "Deity" → "Deity created". */
  entityLabel?: string;
  submitLabel?: string;
  /** Defaults: `true` for create (ready for the next row), `false` for edit. */
  resetOnSuccess?: boolean;
  className?: string;
}

/**
 * `mode` discriminates `updatedAt`: in `mode="edit"` it is REQUIRED **at compile
 * time**, and in `mode="create"` it is forbidden.
 *
 * This is deliberate and load-bearing. `updatedAt` IS the ADR C3
 * optimistic-concurrency precondition — omit it on a PATCH and the API cannot
 * detect a stale write at all, so last-write-wins silently returns and one
 * editor clobbers another. That is a bug no reviewer would ever see in a diff,
 * so `tsc` catches it instead of a code review.
 */
export type EntityFormProps<TValues extends Record<string, unknown>> =
  EntityFormBaseProps<TValues> &
    (
      | { mode: 'create'; updatedAt?: never }
      /** The row's last-known `updatedAt`, merged into the PATCH payload. */
      | { mode: 'edit'; updatedAt: string }
    );

type FieldErrors<TValues> = Partial<Record<Extract<keyof TValues, string>, string>>;

export function EntityForm<TValues extends Record<string, unknown>>({
  mode,
  fields,
  defaultValues,
  schema,
  updatedAt,
  onSubmit,
  onSuccess,
  onConflict,
  onCancel,
  entityLabel = 'Item',
  submitLabel,
  resetOnSuccess = mode === 'create',
  className,
}: EntityFormProps<TValues>) {
  const [values, setValues] = React.useState<TValues>(defaultValues);
  const [errors, setErrors] = React.useState<FieldErrors<TValues>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<unknown>(null);
  const [isConflict, setIsConflict] = React.useState(false);

  function setFieldValue(name: Extract<keyof TValues, string>, value: unknown) {
    setValues((current) => ({ ...current, [name]: value }));
    // Clear this field's error as soon as it is touched — stale red text next to
    // a field the editor has already fixed is noise.
    setErrors((current) =>
      current[name] === undefined ? current : { ...current, [name]: undefined },
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    setSubmitError(null);
    setIsConflict(false);

    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const nextErrors: FieldErrors<TValues> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && nextErrors[key as Extract<keyof TValues, string>] === undefined) {
          nextErrors[key as Extract<keyof TValues, string>] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);

    try {
      // ADR C3: the edit precondition rides along with the payload.
      const payload =
        mode === 'edit' && updatedAt !== undefined
          ? { ...parsed.data, updatedAt }
          : parsed.data;

      const result = await onSubmit(payload);

      notify.success(
        `${entityLabel} ${mode === 'create' ? 'created' : 'saved'}`,
      );
      // ONLY here. Never before the write is confirmed.
      if (resetOnSuccess) setValues(defaultValues);
      onSuccess?.(result);
    } catch (error) {
      setSubmitError(error);

      if (error instanceof ApiError && error.isConflict) {
        // The one interaction every module ticket would otherwise get wrong.
        // OFFER the refetch (toast action + inline banner button) — do NOT fire
        // it automatically: the editor's unsaved values are still in this form,
        // and reloading is their call to make, not a surprise.
        setIsConflict(true);
        notify.conflict(
          () => onConflict?.(),
          `This ${entityLabel.toLowerCase()} was modified by someone else — reload to see the latest.`,
        );
      } else {
        notify.error(error, `Could not save this ${entityLabel.toLowerCase()}.`);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      data-slot="entity-form"
      noValidate
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className={cn('grid max-w-2xl gap-4', className)}
    >
      {fields.map((field) => (
        <EntityFormRow
          key={field.name}
          field={field}
          value={values[field.name]}
          values={values}
          error={errors[field.name]}
          disabled={isSubmitting || field.disabled === true}
          onChange={(value) => setFieldValue(field.name, value)}
        />
      ))}

      {isConflict && (
        <Alert variant="destructive">
          <AlertTitle>Modified by someone else</AlertTitle>
          <AlertDescription>
            <p>
              Someone else changed this {entityLabel.toLowerCase()} after you opened
              it, so your change was not saved. Reload to get the latest version,
              then re-apply your edit.
            </p>
            {onConflict && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onConflict}
              >
                Reload
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {submitError !== null && !isConflict && (
        <Alert variant="destructive">
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription>
            <p>
              {errorMessage(
                submitError,
                `Could not save this ${entityLabel.toLowerCase()}.`,
              )}
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving…'
            : (submitLabel ?? (mode === 'create' ? 'Create' : 'Save changes'))}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function EntityFormRow<TValues extends Record<string, unknown>>({
  field,
  value,
  values,
  error,
  disabled,
  onChange,
}: {
  field: EntityFormField<TValues>;
  value: unknown;
  values: TValues;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  return (
    <FormField
      name={field.name}
      error={error}
      description={field.description}
      className={field.className}
    >
      <FormLabel>
        {field.label}
        {field.required && (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        )}
        {field.required && <span className="sr-only">(required)</span>}
      </FormLabel>
      <EntityFormControl
        field={field}
        value={value}
        values={values}
        disabled={disabled}
        onChange={onChange}
      />
      <FormDescription />
      <FormMessage />
    </FormField>
  );
}

function EntityFormControl<TValues extends Record<string, unknown>>({
  field,
  value,
  values,
  disabled,
  onChange,
}: {
  field: EntityFormField<TValues>;
  value: unknown;
  values: TValues;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case 'custom': {
      if (!field.render) {
        throw new Error(
          `<EntityForm> field "${field.name}" is type "custom" but has no render().`,
        );
      }
      return (
        <CustomFieldSlot
          field={field}
          value={value}
          values={values}
          disabled={disabled}
          onChange={onChange}
        />
      );
    }

    case 'textarea':
      return (
        <FormControl>
          <Textarea
            value={typeof value === 'string' ? value : ''}
            placeholder={field.placeholder}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
        </FormControl>
      );

    case 'select':
      return (
        <FormControl>
          <Select
            value={typeof value === 'string' ? value : ''}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">{field.placeholder ?? 'Select…'}</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormControl>
      );

    case 'checkbox':
      return (
        <FormControl>
          <Checkbox
            checked={value === true}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
        </FormControl>
      );

    case 'switch':
      return (
        <FormControl>
          <Switch
            checked={value === true}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </FormControl>
      );

    case 'number':
      return (
        <FormControl>
          <Input
            type="number"
            value={typeof value === 'number' || typeof value === 'string' ? String(value) : ''}
            placeholder={field.placeholder}
            disabled={disabled}
            onChange={(event) =>
              onChange(event.target.value === '' ? '' : Number(event.target.value))
            }
          />
        </FormControl>
      );

    default:
      return (
        <FormControl>
          <Input
            type={field.type}
            value={typeof value === 'string' ? value : ''}
            placeholder={field.placeholder}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
        </FormControl>
      );
  }
}

/** Bridges the `useFormField()` a11y context into a `type: 'custom'` render(). */
function CustomFieldSlot<TValues extends Record<string, unknown>>({
  field,
  value,
  values,
  disabled,
  onChange,
}: {
  field: EntityFormField<TValues>;
  value: unknown;
  values: TValues;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const { id, invalid, describedBy } = useFormField();
  return (
    <>
      {field.render?.({
        id,
        name: field.name,
        value,
        onChange,
        disabled,
        invalid,
        describedBy,
        values,
      })}
    </>
  );
}
