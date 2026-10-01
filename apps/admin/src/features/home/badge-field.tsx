import { z } from 'zod';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import { BADGE_OPTIONS } from './home-constants';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  <BadgeField> — the badge / badgeLabel PAIRED invariant (TAM-105 §(d))
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `badge` and `badgeLabel` are PAIRED: a badge makes the label required; clearing
 * the badge clears the label. TAM-104 400s a broken pairing; the UI's job is to
 * make the broken state STRUCTURALLY HARD to reach — so both live in ONE custom
 * control:
 *
 *  - picking a badge reveals a REQUIRED label input;
 *  - choosing "No badge" hides AND clears the label in the same action, so an
 *    orphaned label can never be submitted.
 *
 * Help text explains why. The server is the backstop (its 400 is surfaced by
 * `<EntityForm>`'s error banner if the mirror is ever bypassed).
 */

export type BadgeSelection = 'none' | 'trending' | 'suggested';

export interface BadgeFieldValue {
  badge: BadgeSelection;
  /** Empty unless a badge is selected. */
  badgeLabel: string;
}

export const EMPTY_BADGE: BadgeFieldValue = { badge: 'none', badgeLabel: '' };

export function badgeFromRow(badge: string | null, badgeLabel: string | null): BadgeFieldValue {
  const selection: BadgeSelection =
    badge === 'trending' || badge === 'suggested' ? badge : 'none';
  return { badge: selection, badgeLabel: selection === 'none' ? '' : (badgeLabel ?? '') };
}

/** Map the composite to the API's `{badge, badgeLabel}` (both null when none). */
export function badgeToBody(v: BadgeFieldValue): {
  badge: 'trending' | 'suggested' | null;
  badgeLabel: string | null;
} {
  if (v.badge === 'none') return { badge: null, badgeLabel: null };
  return { badge: v.badge, badgeLabel: v.badgeLabel.trim() === '' ? null : v.badgeLabel };
}

export const BadgeSchema: z.ZodType<BadgeFieldValue> = z
  .object({
    badge: z.enum(['none', 'trending', 'suggested']),
    badgeLabel: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.badge !== 'none' && v.badgeLabel.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        message: 'A badge needs a label — an unlabelled badge cannot be drawn.',
        path: ['badgeLabel'],
      });
    }
  });

function BadgeFieldControl({
  id,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: EntityFormFieldRenderProps) {
  const current: BadgeFieldValue =
    value && typeof value === 'object' ? (value as BadgeFieldValue) : EMPTY_BADGE;

  return (
    <div data-slot="badge-field" className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          Badge
        </label>
        <Select
          id={id}
          value={current.badge}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            const badge = event.target.value as BadgeSelection;
            // Clearing the badge clears the label in the same action.
            onChange({ badge, badgeLabel: badge === 'none' ? '' : current.badgeLabel });
          }}
        >
          {BADGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {current.badge !== 'none' && (
        <div className="grid gap-1.5">
          <label
            htmlFor={`${id}-label`}
            className="text-xs font-medium text-muted-foreground"
          >
            Badge label
          </label>
          <Input
            id={`${id}-label`}
            value={current.badgeLabel}
            placeholder="e.g. Trending now"
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...current, badgeLabel: event.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            An unlabelled badge cannot be drawn — both are cleared if either is missing.
          </p>
        </div>
      )}
    </div>
  );
}

/** Adapter for an `<EntityForm>` `type: 'custom'` field's `render`. */
export function badgeField() {
  return function renderBadgeField(props: EntityFormFieldRenderProps) {
    return <BadgeFieldControl {...props} />;
  };
}
