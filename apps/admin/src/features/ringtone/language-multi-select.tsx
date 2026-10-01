import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import { RINGTONE_LANGUAGES } from './ringtone-schema';
import type { RingtoneLanguage } from './use-ringtones';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  <LanguageMultiSelect> — the MULTI-select language picker (§(c)).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `languages` is a fixed enum of the eight client languages. An EMPTY selection
 * means "shown in every language" (the server's documented default), so we spell
 * that out rather than force a pick.
 *
 * A checkbox group of a small fixed set is clearer and more accessible than a
 * combobox, and testable under jsdom. Plugs into `<EntityForm>` via
 * `type: 'custom'`; holds a `RingtoneLanguage[]`.
 */
export function LanguageMultiSelect({
  value,
  onChange,
  disabled,
  describedBy,
}: EntityFormFieldRenderProps) {
  const selected = Array.isArray(value) ? (value as RingtoneLanguage[]) : [];

  function toggle(code: RingtoneLanguage, checked: boolean) {
    if (checked) {
      if (!selected.includes(code)) onChange([...selected, code]);
    } else {
      onChange(selected.filter((c) => c !== code));
    }
  }

  return (
    <div className="grid gap-2" aria-describedby={describedBy} data-slot="language-multi-select">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {RINGTONE_LANGUAGES.map((lang) => {
          const checked = selected.includes(lang.value);
          const controlId = `language-${lang.value}`;
          return (
            <label
              key={lang.value}
              htmlFor={controlId}
              className={cn(
                'flex items-center gap-2 text-sm',
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              )}
            >
              <Checkbox
                id={controlId}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => toggle(lang.value, next === true)}
              />
              {lang.label}
            </label>
          );
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-xs text-muted-foreground">
          None selected — this ringtone is shown in every language.
        </p>
      )}
    </div>
  );
}

/** Adapter for an `<EntityForm>` `type: 'custom'` field's `render`. */
export function languageMultiSelectField() {
  return function renderLanguageMultiSelect(props: EntityFormFieldRenderProps) {
    return <LanguageMultiSelect {...props} />;
  };
}
