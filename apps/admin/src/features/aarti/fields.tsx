import * as React from 'react';

import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import { useDeityOptions, type LanguageCode } from './use-aarti';
import { LANGUAGE_OPTIONS } from './aarti-schema';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  The two fields UNIQUE to the Aarti content model (TAM-108 / TAM-91).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Both plug into `<EntityForm>` as `type: 'custom'` fields via `render` — no
 * change to `<EntityForm>`. They are kept local to `features/aarti` (the spec
 * does not ask for them to be shared).
 *
 *  - <DeitySelect>   — a SINGLE deity picker (not a multi-tag editor). The
 *    options come from the deity ADMIN list so DEACTIVATED deities are shown
 *    (marked) rather than hidden — hiding one would make an existing selection
 *    un-editable (TAM-90 #PATH_DECISION). The editor PICKS a slug, never types
 *    one: `AudioDeityTag`/`deitySlug` has no FK, so a typo would be a silently
 *    vanishing value (TAM-90 AC (f)) — a picker makes that unreachable.
 *  - <LanguagesField> — a MULTI-select over the 8 language codes. Empty = all
 *    (TAM-108); the hint says so.
 */

// ── Single deity picker ──────────────────────────────────────────────────────

/** `render` adapter — a single-select deity picker for a `type: 'custom'` field. */
export function deitySelectField() {
  return function renderDeitySelect(props: EntityFormFieldRenderProps) {
    return <DeitySelect {...props} />;
  };
}

function DeitySelect({
  id,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: EntityFormFieldRenderProps) {
  const { data, isLoading, isError } = useDeityOptions();
  const current = typeof value === 'string' ? value : '';

  if (isLoading) {
    return <Skeleton className="h-9 w-full" />;
  }

  const deities = data?.items ?? [];
  // If the saved slug is not in the fetched page (edge case), keep it selectable
  // so an existing selection is never silently dropped.
  const hasCurrent = current === '' || deities.some((d) => d.slug === current);

  return (
    <Select
      id={id}
      value={current}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">
        {isError ? 'Could not load deities' : 'Select a deity…'}
      </option>
      {!hasCurrent && current !== '' && (
        <option value={current}>{current} (not in list)</option>
      )}
      {deities.map((deity) => (
        <option key={deity.id} value={deity.slug}>
          {deity.slug}
          {deity.active ? '' : ' — inactive'}
        </option>
      ))}
    </Select>
  );
}

// ── Languages multiselect ────────────────────────────────────────────────────

/** `render` adapter — an 8-code language multiselect for a `type: 'custom'` field. */
export function languagesField() {
  return function renderLanguages(props: EntityFormFieldRenderProps) {
    return <LanguagesField {...props} />;
  };
}

function LanguagesField({
  id,
  value,
  onChange,
  disabled,
  describedBy,
}: EntityFormFieldRenderProps) {
  const selected = React.useMemo<LanguageCode[]>(
    () => (Array.isArray(value) ? (value as LanguageCode[]) : []),
    [value],
  );

  function toggle(code: LanguageCode, checked: boolean) {
    const next = checked
      ? [...selected, code]
      : selected.filter((c) => c !== code);
    // Keep a stable order matching the option list.
    onChange(LANGUAGE_OPTIONS.map((o) => o.value).filter((c) => next.includes(c)));
  }

  return (
    <div
      role="group"
      aria-describedby={describedBy}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {LANGUAGE_OPTIONS.map((option) => {
        const checkboxId = `${id}-${option.value}`;
        const checked = selected.includes(option.value);
        return (
          <label
            key={option.value}
            htmlFor={checkboxId}
            className="flex items-center gap-2 text-sm"
          >
            <Checkbox
              id={checkboxId}
              checked={checked}
              disabled={disabled}
              onCheckedChange={(next) => toggle(option.value, next === true)}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
