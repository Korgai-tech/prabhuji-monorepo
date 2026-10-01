import { Input } from '@/components/ui/input';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import { HOROSCOPE_LOCALES } from './constants';

/**
 * A structured `{locale: string}` map editor — NOT a raw JSON textarea (spec
 * §(g)). This module's `localizedDisplayName` / `localizedTitle` are Json locale
 * maps (TAM-73 divergence, not translation tables); this reusable field renders
 * one input per locale (`hi`, `en`, …) and keeps the value a plain object.
 *
 * Wire it as an `<EntityForm>` `type: 'custom'` field:
 * ```tsx
 * { name: 'localizedDisplayName', label: 'Localized names', type: 'custom',
 *   render: localeMapField() }
 * ```
 * The value stays a `Record<string,string>` with only NON-EMPTY entries kept, so
 * a cleared row is dropped rather than sent as `""` (client fast-feedback; the
 * server's `localeMap` shape check is authoritative).
 */

export type LocaleMap = Record<string, string>;

/** A `{locale:text}` object, tolerant of `unknown` form values. */
export function asLocaleMap(value: unknown): LocaleMap {
  if (typeof value !== 'object' || value === null) return {};
  const out: LocaleMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/** Stable deep-equality for the `{locale:text}` maps (order-insensitive). */
export function localeMapEquals(a: LocaleMap, b: LocaleMap): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k]);
}

export function LocaleMapField({
  id,
  value,
  onChange,
  disabled,
  describedBy,
}: EntityFormFieldRenderProps) {
  const map = asLocaleMap(value);

  function setLocale(locale: string, text: string) {
    const next: LocaleMap = { ...map };
    if (text.trim() === '') {
      delete next[locale];
    } else {
      next[locale] = text;
    }
    onChange(next);
  }

  return (
    <div className="grid gap-2" aria-describedby={describedBy}>
      {HOROSCOPE_LOCALES.map((locale) => {
        const inputId = `${id}-${locale.value}`;
        return (
          <div key={locale.value} className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={inputId}
              className="w-32 shrink-0 text-xs text-muted-foreground"
            >
              {locale.label}
            </label>
            <Input
              id={inputId}
              className="flex-1"
              value={map[locale.value] ?? ''}
              disabled={disabled}
              placeholder={`Name in ${locale.label}`}
              onChange={(event) => setLocale(locale.value, event.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Adapter for an `<EntityForm>` `type: 'custom'` field's `render`. */
export function localeMapField() {
  return function renderLocaleMapField(props: EntityFormFieldRenderProps) {
    return <LocaleMapField {...props} />;
  };
}
