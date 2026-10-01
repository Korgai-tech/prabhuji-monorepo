import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

import { cn } from '@/lib/utils';
import { Label } from './label';

/**
 * Accessible field-layout primitives.
 *
 * NOTE — this is shadcn's `<Form>` shape MINUS react-hook-form.
 * `patterns_library/ui/form-with-validation.md` records that this app has no
 * react-hook-form and that one should not be added "for a single form". TAM-86
 * re-examined that (the epic has ~20 forms, not one) and still declined:
 * `<EntityForm>` drives every admin form from a field config with controlled
 * state + a Zod `safeParse` on submit, so no per-field registration API is
 * needed and RHF would buy uncontrolled-input performance nobody is short of.
 * **If a module ticket hits a form `<EntityForm>` genuinely cannot express,
 * that is a System Architect call + a pattern update — not a silent `pnpm add`.**
 *
 * What this file DOES buy is the a11y wiring, done once: every control gets an
 * `id` matched to its `<label htmlFor>`, an `aria-describedby` pointing at its
 * description and error, and `aria-invalid` when it is in error.
 *
 * ```tsx
 * <FormField name="email" error={errors.email} description="Work address">
 *   <FormLabel>Email</FormLabel>
 *   <FormControl><Input value={v} onChange={…} /></FormControl>
 *   <FormDescription />
 *   <FormMessage />
 * </FormField>
 * ```
 */
interface FormFieldContextValue {
  id: string;
  name: string;
  error?: string;
  description?: string;
  errorId: string;
  descriptionId: string;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

function useFormField(): FormFieldContextValue & {
  invalid: boolean;
  describedBy: string | undefined;
} {
  const ctx = React.useContext(FormFieldContext);
  if (!ctx) throw new Error('useFormField must be used within a <FormField>');
  const invalid = Boolean(ctx.error);
  const describedBy =
    [ctx.description ? ctx.descriptionId : null, ctx.error ? ctx.errorId : null]
      .filter(Boolean)
      .join(' ') || undefined;
  return { ...ctx, invalid, describedBy };
}

export interface FormFieldProps extends React.ComponentProps<'div'> {
  name: string;
  error?: string;
  description?: string;
  /** Override the generated control id (defaults to a stable generated id). */
  controlId?: string;
}

function FormField({
  className,
  name,
  error,
  description,
  controlId,
  ...props
}: FormFieldProps) {
  const generatedId = React.useId();
  const id = controlId ?? `${generatedId}-${name}`;
  const value = React.useMemo<FormFieldContextValue>(
    () => ({
      id,
      name,
      error,
      description,
      errorId: `${id}-error`,
      descriptionId: `${id}-description`,
    }),
    [id, name, error, description],
  );

  return (
    <FormFieldContext.Provider value={value}>
      <div
        data-slot="form-field"
        className={cn('grid gap-2', className)}
        {...props}
      />
    </FormFieldContext.Provider>
  );
}

function FormLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  const { id, invalid } = useFormField();
  return (
    <Label
      data-slot="form-label"
      htmlFor={id}
      data-error={invalid}
      className={cn('data-[error=true]:text-destructive', className)}
      {...props}
    />
  );
}

/**
 * Injects `id` / `aria-describedby` / `aria-invalid` into whatever control it
 * wraps, via `Slot` — so the caller writes `<FormControl><Input …/></FormControl>`
 * and the a11y attributes cannot be forgotten.
 */
function FormControl(props: React.ComponentProps<typeof Slot>) {
  const { id, invalid, describedBy } = useFormField();
  return (
    <Slot
      data-slot="form-control"
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: React.ComponentProps<'p'>) {
  const { description, descriptionId } = useFormField();
  if (!description) return null;
  return (
    <p
      data-slot="form-description"
      id={descriptionId}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    >
      {description}
    </p>
  );
}

/** The field's validation error. `role="alert"` so it is announced. */
function FormMessage({ className, ...props }: React.ComponentProps<'p'>) {
  const { error, errorId } = useFormField();
  if (!error) return null;
  return (
    <p
      data-slot="form-message"
      id={errorId}
      role="alert"
      className={cn('text-sm text-destructive', className)}
      {...props}
    >
      {error}
    </p>
  );
}

export {
  FormField,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
};
