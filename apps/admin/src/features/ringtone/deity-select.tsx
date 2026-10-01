import { Select } from '@/components/ui/select';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import { useDeityOptions } from './use-ringtones';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  <DeitySelect> — the SINGLE-select deity picker (§(d), #PATH_DECISION).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `deitySlug` is a single, required column with NO foreign key. The editor must
 * never TYPE a slug: a typo is silently unreachable from the deity filter and
 * only TAM-94's facade validation would 400 on it. A picker makes that error
 * unreachable.
 *
 * It reads the ADMIN deity list (`useDeityOptions`), so DEACTIVATED deities
 * still appear — marked "(inactive)" — and an existing reference stays editable
 * rather than being silently dropped from the options.
 *
 * A styled native `<select>` (the repo's `Select` primitive), so it is keyboard-
 * accessible and testable under jsdom. Plugs into `<EntityForm>` via
 * `type: 'custom'`; holds the selected slug string.
 */
export function DeitySelect({
  id,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: EntityFormFieldRenderProps) {
  const { data, isLoading, isError } = useDeityOptions();
  const current = typeof value === 'string' ? value : '';
  const options = data?.items ?? [];

  // If the current slug is not in the loaded options (e.g. a deleted/renamed
  // deity, or options still loading), keep it selectable so an edit is not lost.
  const hasCurrent = current === '' || options.some((d) => d.slug === current);

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
      {!hasCurrent && current !== '' && (
        <option value={current}>{current} (unknown)</option>
      )}
      {options.map((deity) => (
        <option key={deity.id} value={deity.slug}>
          {deity.slug}
          {deity.active ? '' : ' (inactive)'}
        </option>
      ))}
    </Select>
  );
}

/** Adapter for an `<EntityForm>` `type: 'custom'` field's `render`. */
export function deitySelectField() {
  return function renderDeitySelect(props: EntityFormFieldRenderProps) {
    return <DeitySelect {...props} />;
  };
}
