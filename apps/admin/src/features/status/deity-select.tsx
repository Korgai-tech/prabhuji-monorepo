import { Select } from '@/components/ui/select';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import { useDeityOptions } from './use-deity-options';

/**
 * The SINGLE deity picker (TAM-99 §(f)) — a status item's `deitySlug`. Populated
 * from the taxonomy deity list, NEVER free text (no FK; a typo would orphan the
 * tag). Deactivated deities are shown and MARKED "(inactive)" so an existing tag on
 * a now-inactive deity is still selectable/keepable.
 *
 * A styled native `<select>` (the project's `Select`, not Radix) — accessible by
 * default and testable under jsdom. `value` is the slug string; `''` = none chosen.
 * Wired as an `<EntityForm>` `type: 'custom'` field so the async option list lives
 * inside the control.
 */
export function DeitySelect({
  id,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: EntityFormFieldRenderProps) {
  const { data: options, isLoading, isError } = useDeityOptions();
  const current = typeof value === 'string' ? value : '';

  // If the item's saved deity is not in the fetched page, keep it selectable so an
  // edit never silently drops the existing tag.
  const known = options?.some((o) => o.slug === current) ?? false;

  return (
    <Select
      id={id}
      value={current}
      disabled={disabled || isLoading}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">
        {isLoading ? 'Loading deities…' : isError ? 'Could not load deities' : 'Select a deity…'}
      </option>
      {current !== '' && !known && (
        <option value={current}>{current} (current)</option>
      )}
      {options?.map((option) => (
        <option key={option.slug} value={option.slug}>
          {option.slug}
          {option.active ? '' : ' (inactive)'}
        </option>
      ))}
    </Select>
  );
}

export function deitySelect(props: EntityFormFieldRenderProps) {
  return <DeitySelect {...props} />;
}
