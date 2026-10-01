import * as React from 'react';
import { Trash2Icon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import { ADMIN_LOCALES, localeLabel } from './locales';

/** One localized field the editor manages (`title`, `subtitle`, `ctaLabel`, …). */
export interface TranslationFieldConfig {
  /** The key on both the translation row and the entity's translations body. */
  readonly name: string;
  /** Human label shown above the input. */
  readonly label: string;
  /** Required fields participate in the form's Zod mirror (`z.string().min(1)`). */
  readonly required?: boolean;
  /** Render a `<Textarea>` instead of `<Input>` (e.g. a description). */
  readonly multiline?: boolean;
  readonly maxLength?: number;
  readonly placeholder?: string;
}

/** A translation row: `locale` + the localized string fields. */
export type TranslationRowValues = { locale: string } & Record<string, string>;

export interface TranslationsFieldProps {
  /** The current translations array (the entity form owns this value). */
  readonly value: readonly TranslationRowValues[];
  /** Called with the next array on every add / edit / remove. */
  readonly onChange: (next: TranslationRowValues[]) => void;
  /** The localized fields, in display order. */
  readonly fields: readonly TranslationFieldConfig[];
  readonly disabled?: boolean;
  /** Heading (defaults to "Translations"). */
  readonly title?: string;
  /** Optional helper text under the heading. */
  readonly description?: string;
}

/**
 * The reusable per-locale label editor (TAM-108) — a **controlled** form field.
 * Translations are published as part of the entity itself (they ride in the
 * entity's create/update body, not a separate route), so this holds an ARRAY
 * value and calls `onChange` on every edit; the surrounding `<EntityForm>` owns
 * the value and submits it with the rest of the entity. Required-field
 * enforcement lives in the form's Zod mirror (`z.string().min(1)`), not here.
 *
 * Wire it as a `type: 'custom'` `<EntityForm>` field via `translationsField(...)`.
 */
export function TranslationsField({
  value,
  onChange,
  fields,
  disabled,
  title = 'Translations',
  description,
}: TranslationsFieldProps) {
  const rows = value ?? [];
  const used = new Set(rows.map((r) => r.locale));
  const available = ADMIN_LOCALES.filter((l) => !used.has(l.value));

  function setField(locale: string, name: string, next: string) {
    onChange(rows.map((r) => (r.locale === locale ? { ...r, [name]: next } : r)));
  }

  function removeRow(locale: string) {
    onChange(rows.filter((r) => r.locale !== locale));
  }

  function addRow(locale: string) {
    if (!locale || used.has(locale)) return;
    const blank: TranslationRowValues = { locale };
    for (const field of fields) blank[field.name] = '';
    onChange([...rows, blank]);
  }

  return (
    <section className="grid gap-4" aria-labelledby="translations-heading">
      <div>
        <h3 id="translations-heading" className="text-sm font-semibold">
          {title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {description ??
            'Add a version per language. Absent languages fall back to the default label in the app.'}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No translations yet — this shows its default label in the app.
        </p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.locale} className="grid gap-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{localeLabel(row.locale)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => removeRow(row.locale)}
                  aria-label={`Remove ${localeLabel(row.locale)}`}
                >
                  <Trash2Icon aria-hidden="true" />
                  Remove
                </Button>
              </div>
              <FieldInputs
                idPrefix={`tr-${row.locale}`}
                fields={fields}
                values={row}
                disabled={disabled}
                onChange={(name, next) => setField(row.locale, name, next)}
              />
            </li>
          ))}
        </ul>
      )}

      <AddLanguage available={available} disabled={disabled} onAdd={addRow} />
    </section>
  );
}

/** The language picker that appends a blank row for the chosen locale. */
function AddLanguage({
  available,
  disabled,
  onAdd,
}: {
  available: { value: string; label: string }[];
  disabled?: boolean;
  onAdd: (locale: string) => void;
}) {
  const [locale, setLocale] = React.useState('');

  if (available.length === 0) {
    return (
      <Alert>
        <AlertTitle>Every language is covered</AlertTitle>
        <AlertDescription>All supported languages already have a translation.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t pt-4">
      <div className="grid gap-1">
        <label htmlFor="add-translation-locale" className="text-xs font-medium text-muted-foreground">
          Language
        </label>
        <Select
          id="add-translation-locale"
          className="w-48"
          value={locale}
          disabled={disabled}
          onChange={(event) => setLocale(event.target.value)}
        >
          <option value="">Select…</option>
          {available.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={disabled || locale === ''}
        onClick={() => {
          onAdd(locale);
          setLocale('');
        }}
      >
        Add language
      </Button>
    </div>
  );
}

/** The per-field input grid for one translation row. */
function FieldInputs({
  idPrefix,
  fields,
  values,
  disabled,
  onChange,
}: {
  idPrefix: string;
  fields: readonly TranslationFieldConfig[];
  values: TranslationRowValues;
  disabled?: boolean;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.name}`;
        const value = values[field.name] ?? '';
        return (
          <div key={field.name} className="grid gap-1">
            <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
              {field.label}
              {field.required ? null : <span className="ml-1 opacity-70">(optional)</span>}
            </label>
            {field.multiline ? (
              <Textarea
                id={id}
                value={value}
                disabled={disabled}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                onChange={(event) => onChange(field.name, event.target.value)}
              />
            ) : (
              <Input
                id={id}
                value={value}
                disabled={disabled}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                onChange={(event) => onChange(field.name, event.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * `<EntityForm>` `type: 'custom'` adapter — wires `<TranslationsField>` as a
 * one-line field (mirrors `mediaField(...)`). The form's Zod schema mirror must
 * declare `translations: z.array(z.object({ locale: z.string(), …fields })).default([])`
 * so required localized fields block submit.
 *
 * ```tsx
 * { name: 'translations', label: 'Translations', type: 'custom',
 *   render: translationsField({ fields: [{ name: 'title', label: 'Title', required: true, maxLength: 200 }] }) }
 * ```
 */
export function translationsField(config: {
  fields: readonly TranslationFieldConfig[];
  title?: string;
  description?: string;
}) {
  return function render({ value, onChange, disabled }: EntityFormFieldRenderProps) {
    return (
      <TranslationsField
        value={(value as TranslationRowValues[] | undefined) ?? []}
        onChange={(next) => onChange(next)}
        disabled={disabled}
        fields={config.fields}
        title={config.title}
        description={config.description}
      />
    );
  };
}
