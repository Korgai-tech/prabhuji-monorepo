import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import { LANGUAGE_OPTIONS } from './mantra-schemas';
import type { LanguageCode } from './use-mantra-items';

/** One selectable category tag (id + label, marked if inactive). */
export interface CategoryOption {
  id: string;
  label: string;
}

/**
 * The MULTI-language picker for a mantra item (TAM-93 §(b), TAM-108). `languages`
 * is a whole-array value (`LanguageCode[]`); an EMPTY selection means "all
 * languages" (there is no `en` here — languages, not locales). It is a
 * `type: 'custom'` field of `<EntityForm>` — a checkbox group, keyboard-reachable
 * and each box labelled — that toggles codes in/out of the array.
 *
 * There is no built-in multiselect in `<EntityForm>` (a native `<select multiple>`
 * is famously poor UX and hard to operate by keyboard), so this is the escape
 * hatch the primitives intend — no change to `<EntityForm>`.
 */
export function languagesField() {
  return function LanguagesField({
    id,
    value,
    onChange,
    disabled,
    describedBy,
  }: EntityFormFieldRenderProps) {
    const selected = Array.isArray(value) ? (value as LanguageCode[]) : [];

    function toggle(code: LanguageCode, checked: boolean) {
      const next = checked
        ? [...selected, code]
        : selected.filter((c) => c !== code);
      // Preserve the canonical option order rather than click order.
      onChange(LANGUAGE_OPTIONS.map((o) => o.value).filter((c) => next.includes(c)));
    }

    return (
      <div
        id={id}
        role="group"
        aria-describedby={describedBy}
        className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4"
      >
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
              <Label htmlFor={boxId} className="font-normal">
                {option.label}
              </Label>
            </div>
          );
        })}
      </div>
    );
  };
}

/**
 * The category-tags multiselect (TAM-93 §(e)). Whole-array value (`categoryIds`)
 * saved via TAM-92's `PUT` SET-SEMANTICS. A checkbox group — keyboard-reachable,
 * each box labelled. Inactive categories are marked but selectable so an item
 * already tagged with one stays editable.
 */
export function categoriesField(options: CategoryOption[]) {
  return function CategoriesField({
    id,
    value,
    onChange,
    disabled,
    describedBy,
  }: EntityFormFieldRenderProps) {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const order = options.map((o) => o.id);

    function toggle(categoryId: string, checked: boolean) {
      const next = checked
        ? [...selected, categoryId]
        : selected.filter((c) => c !== categoryId);
      onChange(order.filter((c) => next.includes(c)));
    }

    if (options.length === 0) {
      return (
        <p id={id} className="text-sm text-muted-foreground" aria-describedby={describedBy}>
          No categories yet — create one first.
        </p>
      );
    }

    return (
      <div
        id={id}
        role="group"
        aria-describedby={describedBy}
        className="grid gap-2 sm:grid-cols-2"
      >
        {options.map((option) => {
          const boxId = `${id}-${option.id}`;
          return (
            <div key={option.id} className="flex items-center gap-2">
              <Checkbox
                id={boxId}
                checked={selected.includes(option.id)}
                disabled={disabled}
                onCheckedChange={(checked) => toggle(option.id, checked === true)}
              />
              <Label htmlFor={boxId} className="font-normal">
                {option.label}
              </Label>
            </div>
          );
        })}
      </div>
    );
  };
}
