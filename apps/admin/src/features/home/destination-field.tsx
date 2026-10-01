import { z } from 'zod';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import {
  DESTINATION_TYPE_VALUES,
  DESTINATION_TYPE_OPTIONS,
  HOME_MODULE_KEYS,
  MODULE_KEY_OPTIONS,
  isUrlShaped,
  type DestinationType,
  type HomeModuleKey,
} from './home-constants';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  <DestinationField> — the shared destination control (TAM-105 §(b), #PATH_DECISION)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ONE component for the `destinationType` + `destinationValue` pair that appears
 * on `HomeBanner`, `HomeShortcut`, and `HomeFeedItem`'s CTA — so the safety rule
 * ("keys, never URLs") is implemented ONCE and cannot drift across three forms.
 *
 * THE POINT (#EXPORT_CRITICAL): a `destinationValue` is a STABLE KEY the client
 * resolves through a hardcoded allowlist; an unknown key is a silent no-op — a
 * dead tile with no error anywhere. So the value input is DRIVEN BY THE TYPE and
 * a module key is a `<select>`, never free text — a URL is made *un-typeable*,
 * not merely rejected (TAM-104's 400 is the backstop, not the UX).
 *
 *  - `linked_module`  → a `<select>` of the allowlisted module keys;
 *  - `content_detail` → a content id/slug (validated text — not URL-shaped);
 *  - `pro_paywall`    → a paywall id (validated text — Paywall CMS is out of
 *                       scope / not enumerable, epic P3, so text is the honest
 *                       fallback) AND `isProFeatureDiscovery` is FORCED true and
 *                       shown read-only (the server overrides it anyway, TAM-104
 *                       AC (c) — don't let the editor uncheck a lie);
 *  - `informational`  → the value input is hidden and submitted as `null`.
 *
 * It is an `<EntityForm>` `type: 'custom'` field whose value is the composite
 * `DestinationFieldValue`; wire it with the `destinationField(...)` adapter.
 */

export interface DestinationFieldValue {
  type: DestinationType;
  /** Stable key / id. Empty string ⇒ submitted as `null` (or `''` for the
   *  feed CTA, whose API value is a required string). */
  value: string;
  /** Only meaningful when `withProDiscovery` (banners). */
  isProFeatureDiscovery: boolean;
}

export const EMPTY_DESTINATION: DestinationFieldValue = {
  type: 'linked_module',
  value: '',
  isProFeatureDiscovery: false,
};

export function destinationFromRow(args: {
  type: string;
  value: string | null;
  isProFeatureDiscovery?: boolean;
}): DestinationFieldValue {
  return {
    type: (DESTINATION_TYPE_VALUES as readonly string[]).includes(args.type)
      ? (args.type as DestinationType)
      : 'linked_module',
    value: args.value ?? '',
    isProFeatureDiscovery: args.isProFeatureDiscovery ?? false,
  };
}

/** The `{destinationType, destinationValue}` pair the API takes (value nullable). */
export function destinationToNullable(d: DestinationFieldValue): {
  destinationType: DestinationType;
  destinationValue: string | null;
} {
  return {
    destinationType: d.type,
    destinationValue: d.type === 'informational' ? null : d.value,
  };
}

/** The feed CTA pair — `ctaDestinationValue` is a REQUIRED string server-side. */
export function destinationToRequired(d: DestinationFieldValue): {
  type: DestinationType;
  value: string;
} {
  return { type: d.type, value: d.type === 'informational' ? '' : d.value };
}

/** `pro_paywall` forces `isProFeatureDiscovery` true (server overrides regardless). */
export function resolveProDiscovery(d: DestinationFieldValue): boolean {
  return d.type === 'pro_paywall' ? true : d.isProFeatureDiscovery;
}

/**
 * The Zod mirror for the composite. Nested under its field name in the parent
 * schema, so an issue on `value` surfaces on the destination field.
 */
export const DestinationSchema: z.ZodType<DestinationFieldValue> = z
  .object({
    type: z.enum(DESTINATION_TYPE_VALUES),
    value: z.string(),
    isProFeatureDiscovery: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (d.type === 'informational') return;
    if (d.type === 'linked_module') {
      if (!(HOME_MODULE_KEYS as readonly string[]).includes(d.value)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Choose a module',
          path: ['value'],
        });
      }
      return;
    }
    // content_detail | pro_paywall — free text, but never URL-shaped.
    if (d.value.trim() === '') {
      ctx.addIssue({ code: 'custom', message: 'A value is required', path: ['value'] });
    } else if (isUrlShaped(d.value)) {
      ctx.addIssue({
        code: 'custom',
        message: 'This is a stable key, not a URL — remove the scheme/slash.',
        path: ['value'],
      });
    }
  });

interface DestinationFieldConfig {
  /** Banners: render + force the `isProFeatureDiscovery` toggle inside the field. */
  withProDiscovery?: boolean;
}

interface DestinationFieldProps extends EntityFormFieldRenderProps, DestinationFieldConfig {}

function DestinationFieldControl({
  id,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
  withProDiscovery,
}: DestinationFieldProps) {
  const current: DestinationFieldValue =
    value && typeof value === 'object'
      ? (value as DestinationFieldValue)
      : EMPTY_DESTINATION;

  function patch(next: Partial<DestinationFieldValue>) {
    onChange({ ...current, ...next });
  }

  return (
    <div data-slot="destination-field" className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          Type
        </label>
        <Select
          id={id}
          value={current.type}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) =>
            // Changing the type resets the value — a module key is meaningless
            // as a paywall id and vice versa.
            patch({ type: event.target.value as DestinationType, value: '' })
          }
        >
          {DESTINATION_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <DestinationValueInput
        id={`${id}-value`}
        type={current.type}
        value={current.value}
        disabled={disabled}
        onChange={(v) => patch({ value: v })}
      />

      {withProDiscovery && (
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div className="grid gap-0.5">
            <span className="text-sm font-medium">Pro feature discovery</span>
            <span className="text-xs text-muted-foreground">
              {current.type === 'pro_paywall'
                ? 'Forced on for a paywall destination — the server sets this and it cannot be unchecked.'
                : 'A routing hint that sends the user to the paywall. It gates nothing — it is not an entitlement.'}
            </span>
          </div>
          <Switch
            checked={current.type === 'pro_paywall' ? true : current.isProFeatureDiscovery}
            disabled={disabled || current.type === 'pro_paywall'}
            onCheckedChange={(checked) => patch({ isProFeatureDiscovery: checked === true })}
          />
        </div>
      )}
    </div>
  );
}

function DestinationValueInput({
  id,
  type,
  value,
  disabled,
  onChange,
}: {
  id: string;
  type: DestinationType;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  if (type === 'informational') {
    return (
      <p className="text-xs text-muted-foreground">
        Informational tiles have no destination — the value is submitted empty.
      </p>
    );
  }

  const label =
    type === 'linked_module'
      ? 'Module'
      : type === 'pro_paywall'
        ? 'Paywall id'
        : 'Content id / slug';

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {type === 'linked_module' ? (
        <Select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select a module…</option>
          {MODULE_KEY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          id={id}
          value={value}
          placeholder={type === 'pro_paywall' ? 'e.g. pro-annual' : 'e.g. a content id or slug'}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

/** Ensure the module-key options stay in step with the exported type. */
const _moduleKeyGuard: HomeModuleKey = HOME_MODULE_KEYS[0];
void _moduleKeyGuard;

/**
 * Adapter for an `<EntityForm>` `type: 'custom'` field's `render`, matching the
 * `mediaField(...)` shape. `withProDiscovery` renders + interlocks the banner's
 * `isProFeatureDiscovery` toggle inside the field.
 */
export function destinationField(config: DestinationFieldConfig = {}) {
  return function renderDestinationField(props: EntityFormFieldRenderProps) {
    return <DestinationFieldControl {...props} {...config} />;
  };
}
