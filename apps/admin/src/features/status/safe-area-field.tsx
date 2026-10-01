import * as React from 'react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import type { SafeAreaValues } from './status-schema';
import { DEFAULT_SAFE_AREA } from './status-schema';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  <SafeAreaField> — THE point of TAM-99 (§(d), #PATH_DECISION).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `overlaySafeArea` is four normalized insets (`{top,bottom,left,right}`, each a
 * FRACTION in `[0,1]` — the convention confirmed against TAM-98's landed
 * `normalizedUnit`) that decide where a user's name/business overlay lands when they
 * share a status PUBLICLY. A wrong value renders text over a deity's face. Four bare
 * number inputs are a bad answer to a spatial problem, so this field pairs the
 * numeric inputs (the accessible, precise control) with a LIVE visual preview: the
 * status image with the safe-area rectangle drawn on it, updating as the numbers
 * change — pure client geometry, no network call.
 *
 * The numeric inputs are the accessible control (labelled, keyboard-reachable); the
 * preview graphic is `aria-hidden` supplementary (§(d)). Drag-to-resize is
 * deliberately NOT built — it adds a dependency and an a11y problem for marginal
 * gain (#PATH_DECISION).
 *
 * Wired into `<EntityForm>` as a `type: 'custom'` field via `safeAreaField(...)`,
 * which closes over the current preview image URL (a SIBLING form field, which the
 * custom render cannot otherwise see) supplied by `item-form.tsx`.
 */

const EDGES = [
  { key: 'top', label: 'Top inset' },
  { key: 'bottom', label: 'Bottom inset' },
  { key: 'left', label: 'Left inset' },
  { key: 'right', label: 'Right inset' },
] as const;

function toSafeArea(value: unknown): SafeAreaValues {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return {
      top: typeof v.top === 'number' ? v.top : DEFAULT_SAFE_AREA.top,
      bottom: typeof v.bottom === 'number' ? v.bottom : DEFAULT_SAFE_AREA.bottom,
      left: typeof v.left === 'number' ? v.left : DEFAULT_SAFE_AREA.left,
      right: typeof v.right === 'number' ? v.right : DEFAULT_SAFE_AREA.right,
    };
  }
  return DEFAULT_SAFE_AREA;
}

export interface SafeAreaFieldProps extends EntityFormFieldRenderProps {
  /** The status image to draw the safe area over (image → imageUrl, video → thumbnail). */
  previewUrl?: string;
  /** Names the preview source, e.g. "video thumbnail", for the caption. */
  previewLabel: string;
}

export function SafeAreaField({
  id,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
  previewUrl,
  previewLabel,
}: SafeAreaFieldProps) {
  const area = toSafeArea(value);

  // Keep the raw strings the editor types (so "0." and a cleared field are stable);
  // commit a number to the form only when the string parses.
  const [raw, setRaw] = React.useState<Record<string, string>>(() => ({
    top: String(area.top),
    bottom: String(area.bottom),
    left: String(area.left),
    right: String(area.right),
  }));

  function setEdge(edge: keyof SafeAreaValues, next: string) {
    setRaw((current) => ({ ...current, [edge]: next }));
    if (next === '') return;
    const n = Number(next);
    if (!Number.isNaN(n)) onChange({ ...area, [edge]: n });
  }

  const [broken, setBroken] = React.useState(false);
  const showImage = previewUrl && !broken;

  return (
    <div data-slot="safe-area-field" className="grid gap-4 sm:grid-cols-[1fr_auto]">
      <div className="grid grid-cols-2 gap-3" aria-describedby={describedBy}>
        {EDGES.map((edge) => {
          const inputId = `${id}-${edge.key}`;
          return (
            <div key={edge.key} className="grid gap-1.5">
              <Label htmlFor={inputId}>{edge.label}</Label>
              <Input
                id={inputId}
                type="number"
                inputMode="decimal"
                min={0}
                max={1}
                step={0.01}
                disabled={disabled}
                aria-invalid={invalid || undefined}
                value={raw[edge.key] ?? ''}
                onChange={(event) => setEdge(edge.key, event.target.value)}
              />
            </div>
          );
        })}
        <p className="col-span-2 text-xs text-muted-foreground">
          Fractions of the frame, each 0–1. The user’s name overlay stays inside the
          box. top + bottom and left + right must each be under 1.
        </p>
      </div>

      {/* Supplementary graphic — decorative; the numeric inputs above are the
          accessible control (§(d)). Portrait 9:16 to match a status frame. */}
      <figure className="m-0 grid gap-1">
        <div
          aria-hidden="true"
          className="relative aspect-[9/16] w-32 overflow-hidden rounded-md border bg-muted"
        >
          {showImage ? (
            <img
              src={previewUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
              onError={() => setBroken(true)}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center px-2 text-center text-[10px] text-muted-foreground">
              No {previewLabel} yet
            </div>
          )}
          <div
            className={cn(
              'absolute rounded-sm border-2 border-dashed',
              'border-primary bg-primary/10',
            )}
            style={{
              top: `${clampPct(area.top)}%`,
              bottom: `${clampPct(area.bottom)}%`,
              left: `${clampPct(area.left)}%`,
              right: `${clampPct(area.right)}%`,
            }}
          />
        </div>
        <figcaption className="text-center text-[10px] text-muted-foreground">
          Safe area over the {previewLabel}
        </figcaption>
      </figure>
    </div>
  );
}

/** Guard the CSS against out-of-range numbers so the preview never inverts visually. */
function clampPct(fraction: number): number {
  if (Number.isNaN(fraction)) return 0;
  return Math.min(100, Math.max(0, fraction * 100));
}

/** `<EntityForm>` `type: 'custom'` adapter, closing over the sibling preview URL. */
export function safeAreaField(config: { previewUrl?: string; previewLabel: string }) {
  return function renderSafeAreaField(props: EntityFormFieldRenderProps) {
    return <SafeAreaField {...props} {...config} />;
  };
}
