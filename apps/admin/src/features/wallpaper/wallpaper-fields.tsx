import * as React from 'react';
import { XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import { useDeityOptions } from './use-deity-options';
import { LANGUAGE_OPTIONS } from './wallpaper-schema';

/**
 * Bespoke `type: 'custom'` controls for the wallpaper form (TAM-97). Each is a
 * factory that returns an `<EntityForm>` `render(props)` — the same escape-hatch
 * pattern `mediaField(...)` uses. They read `{ id, value, onChange, disabled,
 * invalid, describedBy }` and never touch `<EntityForm>` internals.
 */

/** SINGLE deity select (§(d)). Populated from the deity list — the editor never
 *  types a slug. Deactivated deities still appear and are MARKED. '' = none. */
export function deitySelectField() {
  return function DeitySelect(props: EntityFormFieldRenderProps) {
    return <DeitySelectControl {...props} />;
  };
}

function DeitySelectControl({
  id,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: EntityFormFieldRenderProps) {
  const { data: options, isLoading, isError } = useDeityOptions();
  const current = typeof value === 'string' ? value : '';

  return (
    <div className="grid gap-1">
      <Select
        id={id}
        value={current}
        disabled={disabled || isLoading}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">No deity (all-deity wallpaper)</option>
        {options?.map((deity) => (
          <option key={deity.slug} value={deity.slug}>
            {deity.slug}
            {deity.active ? '' : ' — deactivated'}
          </option>
        ))}
      </Select>
      {isError && (
        <p className="text-xs text-destructive" role="alert">
          Could not load deities — try reopening the form.
        </p>
      )}
    </div>
  );
}

/** MULTI language select (§ TAM-108). Empty = available in ALL languages — the
 *  common case for wallpapers, so it is spelled out. */
export function languagesField() {
  return function Languages(props: EntityFormFieldRenderProps) {
    return <LanguagesControl {...props} />;
  };
}

function LanguagesControl({ value, onChange, disabled, describedBy }: EntityFormFieldRenderProps) {
  const selected = Array.isArray(value) ? (value as string[]) : [];

  function toggle(code: string, on: boolean) {
    onChange(on ? [...selected, code] : selected.filter((c) => c !== code));
  }

  return (
    <div className="grid gap-2" aria-describedby={describedBy}>
      <div className="flex flex-wrap gap-3">
        {LANGUAGE_OPTIONS.map((lang) => {
          const checkboxId = `lang-${lang.value}`;
          return (
            <label key={lang.value} htmlFor={checkboxId} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={checkboxId}
                checked={selected.includes(lang.value)}
                disabled={disabled}
                onCheckedChange={(state) => toggle(lang.value, state === true)}
              />
              {lang.label}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.length === 0
          ? 'No languages selected — this wallpaper is available in all languages.'
          : `Available in ${selected.length} of ${LANGUAGE_OPTIONS.length} languages.`}
      </p>
    </div>
  );
}

/** A bounded string-list editor (supportedAndroidVersions).
 *  Add via the input, remove via the chip's ✕. Stored as `string[]`. */
export function stringListField(placeholder: string) {
  return function StringList(props: EntityFormFieldRenderProps) {
    return <StringListControl {...props} placeholder={placeholder} />;
  };
}

function StringListControl({
  id,
  value,
  onChange,
  disabled,
  describedBy,
  placeholder,
}: EntityFormFieldRenderProps & { placeholder: string }) {
  const items = Array.isArray(value) ? (value as string[]) : [];
  const [draft, setDraft] = React.useState('');

  function add() {
    const next = draft.trim();
    if (next === '' || items.includes(next)) {
      setDraft('');
      return;
    }
    onChange([...items, next]);
    setDraft('');
  }

  return (
    <div className="grid gap-2" aria-describedby={describedBy}>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={add}>
          Add
        </Button>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item}>
              <Badge variant="muted" className="gap-1">
                {item}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove ${item}`}
                  className="rounded-sm hover:text-destructive"
                  onClick={() => onChange(items.filter((i) => i !== item))}
                >
                  <XIcon className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The `{x,y}` crop-focus point (both 0..1), a STRUCTURED input matching TAM-96's
 *  pinned shape (§(c)) — not a raw JSON textarea. Toggle sets it to null. */
export function focalPointField() {
  return function FocalPoint(props: EntityFormFieldRenderProps) {
    return <FocalPointControl {...props} />;
  };
}

type Focal = { x: number; y: number } | null;

function FocalPointControl({ id, value, onChange, disabled, describedBy }: EntityFormFieldRenderProps) {
  const point = (value ?? null) as Focal;
  const enabled = point !== null;

  function setAxis(axis: 'x' | 'y', raw: string) {
    const n = clamp01(Number(raw));
    const base = point ?? { x: 0, y: 0 };
    onChange({ ...base, [axis]: n });
  }

  return (
    <div className="grid gap-2" aria-describedby={describedBy}>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(state) => onChange(state === true ? { x: 0.5, y: 0.5 } : null)}
        />
        Set a focal point
      </label>
      {enabled && (
        <div className="flex gap-3">
          <NumberAxis id={`${id}-x`} label="x (0–1)" value={point.x} disabled={disabled} onChange={(v) => setAxis('x', v)} />
          <NumberAxis id={`${id}-y`} label="y (0–1)" value={point.y} disabled={disabled} onChange={(v) => setAxis('y', v)} />
        </div>
      )}
    </div>
  );
}

/** The `{top,bottom,left,right}` safe-area insets (each 0..1), a STRUCTURED input
 *  matching TAM-96's pinned shape. Toggle sets it to null. */
export function safeAreaField() {
  return function SafeArea(props: EntityFormFieldRenderProps) {
    return <SafeAreaControl {...props} />;
  };
}

type SafeArea = { top: number; bottom: number; left: number; right: number } | null;
const SAFE_AXES: Array<keyof NonNullable<SafeArea>> = ['top', 'bottom', 'left', 'right'];

function SafeAreaControl({ id, value, onChange, disabled, describedBy }: EntityFormFieldRenderProps) {
  const insets = (value ?? null) as SafeArea;
  const enabled = insets !== null;

  function setAxis(axis: keyof NonNullable<SafeArea>, raw: string) {
    const base = insets ?? { top: 0, bottom: 0, left: 0, right: 0 };
    onChange({ ...base, [axis]: clamp01(Number(raw)) });
  }

  return (
    <div className="grid gap-2" aria-describedby={describedBy}>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(state) =>
            onChange(state === true ? { top: 0, bottom: 0, left: 0, right: 0 } : null)
          }
        />
        Set safe-area insets
      </label>
      {enabled && (
        <div className="flex flex-wrap gap-3">
          {SAFE_AXES.map((axis) => (
            <NumberAxis
              key={axis}
              id={`${id}-${axis}`}
              label={`${axis} (0–1)`}
              value={insets[axis]}
              disabled={disabled}
              onChange={(v) => setAxis(axis, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NumberAxis({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  disabled: boolean;
  onChange: (raw: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        min={0}
        max={1}
        step={0.05}
        className="w-24"
        value={String(value)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
