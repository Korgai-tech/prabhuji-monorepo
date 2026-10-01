import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import { LANGUAGE_OPTIONS, type LanguageCode } from './status-schema';

/**
 * The language availability multi-select (TAM-99 §(c), TAM-108) — the `languages`
 * set. Eight checkboxes over the eight Phase-1 language codes; an EMPTY set means
 * "available in ALL languages" (stated in the helper text so the empty state is not
 * read as a mistake). A checkbox group, not a native multi-`<select>`: it is more
 * discoverable, keyboard-accessible by default, and testable under jsdom.
 *
 * Wired as an `<EntityForm>` `type: 'custom'` field; `value` is `LanguageCode[]`.
 */
function toCodes(value: unknown): LanguageCode[] {
  return Array.isArray(value) ? (value as LanguageCode[]) : [];
}

export function LanguageMultiSelect({
  id,
  value,
  onChange,
  disabled,
  describedBy,
}: EntityFormFieldRenderProps) {
  const selected = toCodes(value);

  function toggle(code: LanguageCode, checked: boolean) {
    const next = checked
      ? [...selected, code]
      : selected.filter((c) => c !== code);
    onChange(next);
  }

  return (
    <div
      data-slot="language-multiselect"
      className="grid gap-2"
      role="group"
      aria-describedby={describedBy}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LANGUAGE_OPTIONS.map((option) => {
          const boxId = `${id}-${option.value}`;
          return (
            <div key={option.value} className="flex items-center gap-2">
              <Checkbox
                id={boxId}
                checked={selected.includes(option.value)}
                disabled={disabled}
                onCheckedChange={(checked) => toggle(option.value, checked === true)}
              />
              <Label htmlFor={boxId} className="text-sm font-normal">
                {option.label}
              </Label>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Leave all unchecked to make this status available in every language.
      </p>
    </div>
  );
}

export function languageMultiSelect(props: EntityFormFieldRenderProps) {
  return <LanguageMultiSelect {...props} />;
}
