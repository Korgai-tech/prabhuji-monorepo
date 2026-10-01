import { Checkbox } from '@/components/ui/checkbox';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import { LANGUAGES } from './book-schema';

/**
 * The MULTI-language selector — an `<EntityForm>` `type: 'custom'` control that
 * holds a `string[]` of language codes (TAM-108's eight codes). It is a set of
 * labelled checkboxes (accessible + testable under jsdom, no new primitive).
 *
 * An EMPTY selection means "all languages" (TAM-102), so this field is never
 * required and never blocks submit — the help text says so. There is NO deity
 * on a book, so this is the only taxonomy-like control on the content form.
 */
export function languagesField(props: EntityFormFieldRenderProps) {
  const selected = Array.isArray(props.value) ? (props.value as string[]) : [];

  function toggle(code: string, checked: boolean) {
    const next = checked
      ? [...selected, code]
      : selected.filter((c) => c !== code);
    props.onChange(next);
  }

  return (
    <div
      role="group"
      aria-describedby={props.describedBy}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {LANGUAGES.map((lang) => {
        const id = `${props.id}-${lang.value}`;
        const checked = selected.includes(lang.value);
        return (
          <label
            key={lang.value}
            htmlFor={id}
            className="flex items-center gap-2 text-sm"
          >
            <Checkbox
              id={id}
              checked={checked}
              disabled={props.disabled}
              onCheckedChange={(state) => toggle(lang.value, state === true)}
            />
            {lang.label}
          </label>
        );
      })}
    </div>
  );
}
