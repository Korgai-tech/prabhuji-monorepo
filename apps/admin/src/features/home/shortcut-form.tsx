import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';

import { EntityForm, type EntityFormField } from '@/components/entity-form/entity-form';
import { ICON_IMAGE_TYPES, mediaField } from '@/components/media';
import { shortcutTilePreviewField } from './shortcut-tile-preview';
import {
  translationsField,
  translationsSchema,
  translationsChanged,
} from '@/components/translations';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api-error';
import { adminKeys } from '@/lib/query-keys';

import {
  useCreateHomeShortcut,
  useHomeShortcut,
  useUpdateHomeShortcut,
  type HomeShortcutDetail,
  type HomeShortcutPatchChanges,
  type HomeShortcutTranslation,
} from './use-home-shortcuts';
import { ICON_KEY_OPTIONS } from './home-constants';
import {
  DestinationSchema,
  destinationField,
  destinationFromRow,
  destinationToNullable,
  EMPTY_DESTINATION,
  type DestinationFieldValue,
} from './destination-field';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Shortcut create/edit form (TAM-105 §(e), extended by TAM-132).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `key` is create-only (immutable identity). Two icon fields coexist (TAM-132
 * §"Backwards compatibility — #PATH_DECISION"):
 *
 *  - `iconUrl` — a CMS-served image URL. Wire-published to every app user; a
 *    swap ships without an app release. Editor is a `<MediaUploadField>` (via
 *    the `mediaField(...)` adapter) — pick → presign → S3 PUT → the returned
 *    `publicUrl` is what lands in `iconUrl` on save. The server's
 *    `mediaUrl` + `validateOwnedUrl` at the admin write boundary is
 *    authoritative; the ICON_IMAGE_TYPES set (png/webp/svg) mirrors
 *    `home.homeShortcut.iconUrl` in TAM-84's server allowlist.
 *  - `iconKey` — a stable BUNDLED-asset slug (`<select>` from
 *    `ICON_KEY_OPTIONS`, never a URL, never a `<MediaUploadField>`, never free
 *    text). Remains the BC-fallback rung of the client's ladder
 *    (`iconUrl` → bundled `iconKey` PNG → `SizedBox.shrink()`) so older app
 *    builds (which ignore `iconUrl`) and offline / cold-start cases still paint.
 *
 * The two are DELIBERATELY NOT collapsed — a CMS URL is provenance-checked
 * media, a slug is a bundled-asset key. `destinationValue` comes from the
 * shared `<DestinationField>` (keys, never URLs). Shortcuts have no
 * `isProFeatureDiscovery`.
 */

interface ShortcutFormValues extends Record<string, unknown> {
  key: string;
  label: string;
  iconKey: string;
  iconUrl: string;
  destination: DestinationFieldValue;
  sortOrder: number;
  isActive: boolean;
  minAppVersion?: string;
  /**
   * TAM-174 — per-A/B-arm presentation, FLATTENED into `<arm>_<field>` keys.
   *
   * The wire carries a `variants[]` array, but `EntityForm` binds flat fields
   * and the arm set is a fixed pair today, so flattening here buys a working
   * form for two arms without building an array editor for a list that has
   * exactly two entries. `variantsToForm` / `formToVariants` are the only
   * places that know about the mapping — adding a THIRD arm means replacing
   * this with a real repeater, and that is the point at which to do it.
   *
   * Every value is a STRING (the stops included) because that is what an
   * `<input>` produces; they are parsed on submit. Empty ⇒ inherit the base row.
   */
  control_label: string;
  control_iconUrl: string;
  /**
   * ROUND-TRIPPED, NOT EDITED. There is no field for it: the control arm should
   * normally have no row at all, so a gate on it is not something this form
   * offers to author. It is read and sent back unchanged because a PATCH
   * REPLACES the whole arm set — a value this form does not carry is a value
   * the next Save deletes.
   */
  control_minAppVersion: string;
  gradient_v1_label: string;
  gradient_v1_iconUrl: string;
  gradient_v1_themeBackgroundFrom: string;
  gradient_v1_themeBackgroundFromStop: string;
  gradient_v1_themeBackgroundTo: string;
  gradient_v1_themeBackgroundToStop: string;
  gradient_v1_themeLabelColor: string;
  gradient_v1_minAppVersion: string;
  /**
   * DISPLAY-ONLY. Not a value anyone edits or submits — `<EntityForm>` keys a
   * row by a field NAME, so a read-across preview row needs one of its own.
   * Stays `''` for the form's whole life; `formToVariants` and both submit
   * handlers ignore it.
   */
  gradient_v1_preview: string;
  translations: HomeShortcutTranslation[];
}

/** `#RRGGBB`, or empty. Matches the server's `hexColor` exactly. */
const hexField = z
  .string()
  .trim()
  .refine((v) => v === '' || /^#[0-9a-fA-F]{6}$/.test(v), {
    message: 'Use a 6-digit hex colour, e.g. #FC7304',
  });

/**
 * A gradient handle position, or empty.
 *
 * NOT clamped to 0..1 — `set_wallpaper` is authored 0.14734 → 1.4734, i.e. its
 * lower stop sits below the card. The -1..3 envelope is the same sanity bound
 * the server applies: wide enough for any real handle, narrow enough to reject
 * a percentage pasted as `147.34`.
 */
const stopField = z
  .string()
  .trim()
  .refine(
    (v) => {
      if (v === '') return true;
      const n = Number(v);
      return Number.isFinite(n) && n >= -1 && n <= 3;
    },
    { message: 'A fraction between -1 and 3 (e.g. 0.1, or 1.4734)' }
  );

const ShortcutSchema: z.ZodType<ShortcutFormValues> = z.object({
  key: z.string().min(1, 'Key is required'),
  label: z.string().min(1, 'Label is required'),
  iconKey: z.string(),
  // Populated by <MediaUploadField> (TAM-132): the adapter only calls
  // `onChange(publicUrl)` after the S3 PUT succeeds, so an in-flight upload
  // leaves this empty and — combined with the empty-string ⇒ null
  // normalization on submit — cannot leak an unfinished URL onto the wire.
  // Empty means "no CMS icon, fall back to the bundled iconKey PNG".
  iconUrl: z.string(),
  destination: DestinationSchema,
  sortOrder: z.number().int('Whole numbers only'),
  isActive: z.boolean(),
  // Server-side BC gate (TAM-132 follow-up): permissive shape here, real
  // semver-tolerance validation lives on the server parser. Empty ⇒ null on
  // submit (see iconUrl for the same normalization pattern).
  minAppVersion: z.string().trim().max(20).optional().or(z.literal('')),
  // TAM-174 — per-field shape only. The gradient arm's ALL-OR-NOTHING palette
  // rule is a cross-field invariant and is asserted below, on the object, so
  // the message can name which fields are missing.
  control_label: z.string().trim().max(120),
  control_iconUrl: z.string(),
  // Round-tripped, not edited (see `ShortcutFormValues`).
  control_minAppVersion: z.string().trim().max(20),
  gradient_v1_label: z.string().trim().max(120),
  gradient_v1_iconUrl: z.string(),
  gradient_v1_themeBackgroundFrom: hexField,
  gradient_v1_themeBackgroundFromStop: stopField,
  gradient_v1_themeBackgroundTo: hexField,
  gradient_v1_themeBackgroundToStop: stopField,
  gradient_v1_themeLabelColor: hexField,
  gradient_v1_minAppVersion: z.string().trim().max(20),
  // Display-only (see `ShortcutFormValues`) — accepted, never read.
  gradient_v1_preview: z.string(),
  translations: translationsSchema({
    label: z.string().trim().min(1, 'Label is required').max(120),
  }),
})
  /**
   * TAM-174 — the palette is ALL-OR-NOTHING.
   *
   * Mirrored from `home.admin.service.ts`, which is the authoritative gate; this
   * copy exists so the editor sees the problem against the offending field
   * instead of as a 400 after Save. A half-set palette is silently discarded by
   * the public read (it cannot render half a gradient), so a tile would just
   * quietly stop being themed with no error anywhere — which is exactly the
   * failure this catches.
   */
  .superRefine((values, ctx) => {
    const filled = THEME_FIELD_NAMES.filter((n) => String(values[n] ?? '').trim() !== '');
    if (filled.length === 0 || filled.length === THEME_FIELD_NAMES.length) return;
    for (const name of THEME_FIELD_NAMES) {
      if (String(values[name] ?? '').trim() !== '') continue;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [name],
        message: 'Set every palette field, or clear them all.',
      });
    }
  });

/** The gradient arm's five palette inputs, in one place. */
const THEME_FIELD_NAMES = [
  'gradient_v1_themeBackgroundFrom',
  'gradient_v1_themeBackgroundFromStop',
  'gradient_v1_themeBackgroundTo',
  'gradient_v1_themeBackgroundToStop',
  'gradient_v1_themeLabelColor',
] as const;

/** The arms this form edits. A third would mean replacing the flattening. */
const ARMS = ['control', 'gradient_v1'] as const;

type ShortcutVariant = HomeShortcutDetail['variants'][number];

/** Wire `variants[]` → the flat form values. */
function variantsToForm(variants: ShortcutVariant[]) {
  const byArm = new Map(variants.map((v) => [v.variant, v]));
  const control = byArm.get('control');
  const gradient = byArm.get('gradient_v1');
  const num = (v: number | null | undefined): string => (v === null || v === undefined ? '' : String(v));
  return {
    control_label: control?.label ?? '',
    control_iconUrl: control?.iconUrl ?? '',
    control_minAppVersion: control?.minAppVersion ?? '',
    gradient_v1_label: gradient?.label ?? '',
    gradient_v1_iconUrl: gradient?.iconUrl ?? '',
    gradient_v1_themeBackgroundFrom: gradient?.themeBackgroundFrom ?? '',
    gradient_v1_themeBackgroundFromStop: num(gradient?.themeBackgroundFromStop),
    gradient_v1_themeBackgroundTo: gradient?.themeBackgroundTo ?? '',
    gradient_v1_themeBackgroundToStop: num(gradient?.themeBackgroundToStop),
    gradient_v1_themeLabelColor: gradient?.themeLabelColor ?? '',
    gradient_v1_minAppVersion: gradient?.minAppVersion ?? '',
    gradient_v1_preview: '',
  };
}

/**
 * The flat form values → the wire `variants[]`.
 *
 * An arm whose every field is blank is OMITTED rather than sent as a row of
 * nulls: "no overrides" and "a row that overrides nothing" render identically,
 * and not writing the row keeps the table honest about which arms ops has
 * actually authored.
 *
 * EVERY COLUMN THE READ VIEW EXPOSES MUST APPEAR HERE. A PATCH REPLACES the
 * whole arm set (delete-then-insert), so a field this function omits is not
 * "left alone" — it is deleted by the next Save of an unrelated field.
 * `minAppVersion` was omitted, and every save silently ungated the colour arm:
 * builds below 1.1.0 then received assets authored for a card they cannot
 * render.
 */
function formToVariants(values: ShortcutFormValues) {
  const str = (v: string): string | null => (v.trim() === '' ? null : v.trim());
  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));

  return ARMS.flatMap((arm) => {
    const row =
      arm === 'control'
        ? {
            variant: arm,
            label: str(values.control_label),
            iconUrl: str(values.control_iconUrl),
            minAppVersion: str(values.control_minAppVersion),
          }
        : {
            variant: arm,
            label: str(values.gradient_v1_label),
            iconUrl: str(values.gradient_v1_iconUrl),
            themeBackgroundFrom: str(values.gradient_v1_themeBackgroundFrom),
            themeBackgroundFromStop: num(values.gradient_v1_themeBackgroundFromStop),
            themeBackgroundTo: str(values.gradient_v1_themeBackgroundTo),
            themeBackgroundToStop: num(values.gradient_v1_themeBackgroundToStop),
            themeLabelColor: str(values.gradient_v1_themeLabelColor),
            minAppVersion: str(values.gradient_v1_minAppVersion),
          };
    const hasAny = Object.entries(row).some(([k, v]) => k !== 'variant' && v !== null);
    return hasAny ? [row] : [];
  });
}

/** Map a loaded shortcut's translations into the form value shape. */
function shortcutTranslations(s: HomeShortcutDetail): HomeShortcutTranslation[] {
  return s.translations.map((t) => ({ locale: t.locale, label: t.label }));
}

/** The per-locale label editor field. */
const TRANSLATIONS_FIELD: EntityFormField<ShortcutFormValues> = {
  name: 'translations',
  label: 'Label translations',
  type: 'custom',
  render: translationsField({
    fields: [{ name: 'label', label: 'Label', required: true, maxLength: 120 }],
    title: 'Label translations',
  }),
};

const ICON_URL_FIELD: EntityFormField<ShortcutFormValues> = {
  name: 'iconUrl',
  label: 'Icon image',
  type: 'custom',
  description:
    'CMS-served shortcut icon (published live to every app user, no release needed). Leave blank to fall back to the bundled icon-key PNG shipped with the app.',
  render: mediaField({
    module: 'home',
    entity: 'homeShortcut',
    field: 'iconUrl',
    accept: ICON_IMAGE_TYPES,
  }),
};

const ICON_FIELD: EntityFormField<ShortcutFormValues> = {
  name: 'iconKey',
  label: 'Icon key (bundled fallback)',
  type: 'select',
  placeholder: 'No icon',
  options: ICON_KEY_OPTIONS,
  description:
    'Bundled client-app slug used when the icon URL above is empty or unreachable (older builds / offline cold start). Not an upload — adding a new slug requires an app release.',
};

/**
 * TAM-174 — the per-A/B-arm tile content (Figma node 3760:28482).
 *
 * WHY THESE READ AS "CURRENT DESIGN" / "NEW COLOUR DESIGN" AND NOT "VARIANT 1 /
 * 2". The two arms are not peers and numbering them would say they are:
 *
 *  - `control` is the design ALREADY SHIPPING. The right way to author it is to
 *    leave it entirely blank so it inherits whatever ops published on the base
 *    row. Presenting it as "Variant 1" invites filling it in, which is exactly
 *    the mistake that pinned the control tiles to the seed's own art and
 *    white-boxed the live grid.
 *  - `control` and `gradient_v1` are the LITERAL wire values — the `variant`
 *    column, the API's `grid_variant` log, and the app's `home_widget_clicked`
 *    property all carry those strings. A form that said "Variant 2" would leave
 *    whoever reads the experiment results unable to map a dashboard row back to
 *    a field here, so each group's id is named in its description.
 *  - `variant` is a free string by design (a third arm is an INSERT, not a
 *    migration). Numbers do not survive that; `gradient_v2` does.
 *
 * The experiment is not a colour swap: each arm is a COMPLETE tile, so ops
 * authors artwork and copy per arm as well as the palette. Anything left blank
 * INHERITS the base fields above it, which is why the current-design group
 * normally stays empty.
 *
 * Plain text inputs rather than colour pickers: the values are transcribed from
 * Figma, and a picker invites nudging a hand-tuned stop by a digit.
 *
 * None of this is visible to anyone until the experiment is switched on in
 * Home ▸ Settings, which assigns users 50/50 and keeps each one in the same
 * group.
 */
const VARIANT_FIELDS: EntityFormField<ShortcutFormValues>[] = [
  {
    name: 'control_label',
    label: 'Current design — label',
    type: 'text',
    description:
      'Copy for users still on the design shipping today (analytics: control). Normally blank — they should see the main Label above.',
  },
  {
    name: 'control_iconUrl',
    label: 'Current design — icon image',
    type: 'custom',
    description:
      'Artwork for users still on the design shipping today (analytics: control). Normally blank — they should see the main icon above. Uploading here REPLACES the live icon for half your users.',
    render: mediaField({
      module: 'home',
      entity: 'homeShortcut',
      field: 'iconUrl',
      accept: ICON_IMAGE_TYPES,
    }),
  },
  {
    name: 'gradient_v1_label',
    label: 'New colour design — label',
    type: 'text',
    placeholder: 'स्टेटस लगाएं',
    description:
      'Copy for users in the new coloured design (analytics: gradient_v1). Blank ⇒ the main Label above.',
  },
  {
    name: 'gradient_v1_iconUrl',
    label: 'New colour design — icon image',
    type: 'custom',
    description:
      'Artwork for users in the new coloured design (analytics: gradient_v1). Blank ⇒ the main icon above.',
    render: mediaField({
      module: 'home',
      entity: 'homeShortcut',
      field: 'iconUrl',
      accept: ICON_IMAGE_TYPES,
    }),
  },
  {
    name: 'gradient_v1_themeBackgroundFrom',
    label: 'New colour design — gradient top colour',
    type: 'text',
    placeholder: '#EAF4FF',
    description: "The tile gradient's upper colour, as #RRGGBB.",
  },
  {
    name: 'gradient_v1_themeBackgroundFromStop',
    label: 'New colour design — gradient top stop',
    type: 'text',
    placeholder: '0.1',
    description:
      'How far down the tile the top colour sits, as a fraction (0 = the very top). Usually 0.1.',
  },
  {
    name: 'gradient_v1_themeBackgroundTo',
    label: 'New colour design — gradient bottom colour',
    type: 'text',
    placeholder: '#3896E9',
    description: "The tile gradient's lower colour, as #RRGGBB.",
  },
  {
    name: 'gradient_v1_themeBackgroundToStop',
    label: 'New colour design — gradient bottom stop',
    type: 'text',
    placeholder: '1',
    description:
      "How far down the tile the bottom colour sits. Usually 1 (the tile's bottom edge). MAY exceed 1 — a value like 1.4734 puts the stop below the tile, which is how Figma authors a partly-off-card gradient.",
  },
  {
    name: 'gradient_v1_themeLabelColor',
    label: 'New colour design — label colour',
    type: 'text',
    placeholder: '#1261A8',
    description:
      'The tile label\'s colour, as #RRGGBB. Pick it for contrast against the gradient above — nothing checks this automatically.',
  },
  {
    name: 'gradient_v1_minAppVersion',
    label: 'New colour design — minimum app version',
    type: 'text',
    placeholder: '1.1.0',
    description:
      'Builds below this version are served the CURRENT design instead of this one — their layout cannot render the new card, so they must not receive its artwork or copy. Leave as shipped unless the new grid moves to a later release. Blank = no gate (every build gets it).',
  },
  {
    name: 'gradient_v1_preview',
    label: 'New colour design — preview',
    type: 'custom',
    description:
      'How the tile will look in the app, updated as you type. A blank label or icon above inherits the main fields, exactly as the phone does.',
    render: shortcutTilePreviewField(),
  },
];

const DESTINATION_FIELD: EntityFormField<ShortcutFormValues> = {
  name: 'destination',
  label: 'Destination',
  type: 'custom',
  description: 'Where the shortcut sends the user. Keys, never URLs.',
  render: destinationField(),
};

const MIN_APP_VERSION_FIELD: EntityFormField<ShortcutFormValues> = {
  name: 'minAppVersion',
  label: 'Minimum app version',
  type: 'text',
  placeholder: '1.1.0',
  description:
    'Semver-shaped gate (e.g. "1.1.0"). Clients on this version or newer will see this shortcut; older clients won\'t. Leave blank to show to everyone.',
};

export type ShortcutFormState = { kind: 'create' } | { kind: 'edit'; id: string } | null;

export function ShortcutFormDialog({
  state,
  onClose,
}: {
  state: ShortcutFormState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {state?.kind === 'edit' ? (
          <EditShortcut id={state.id} onClose={onClose} />
        ) : (
          <CreateShortcut onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateShortcut({ onClose }: { onClose: () => void }) {
  const create = useCreateHomeShortcut();

  return (
    <>
      <DialogHeader>
        <DialogTitle>New shortcut</DialogTitle>
        <DialogDescription>
          The key is a permanent stable identity — choose it carefully.
        </DialogDescription>
      </DialogHeader>

      <EntityForm<ShortcutFormValues>
        mode="create"
        entityLabel="Shortcut"
        schema={ShortcutSchema}
        defaultValues={{
          key: '',
          label: '',
          iconKey: '',
          iconUrl: '',
          // TAM-174 — a new shortcut has NO arm overrides: every user sees the
          // base tile. Blank throughout is a valid, complete state; the
          // all-or-nothing palette rule only bites once one colour is entered.
          ...variantsToForm([]),
          destination: EMPTY_DESTINATION,
          sortOrder: 0,
          isActive: true,
          minAppVersion: '',
          translations: [],
        }}
        fields={[
          {
            name: 'key',
            label: 'Key',
            type: 'text',
            required: true,
            placeholder: 'set_wallpaper',
            description: 'Permanent stable identity — cannot be changed later.',
          },
          { name: 'label', label: 'Label', type: 'text', required: true },
          ICON_URL_FIELD,
          ICON_FIELD,
          ...VARIANT_FIELDS,
          DESTINATION_FIELD,
          {
            name: 'sortOrder',
            label: 'Sort order',
            type: 'number',
            description: 'Lower numbers appear first.',
          },
          { name: 'isActive', label: 'Active', type: 'switch' },
          MIN_APP_VERSION_FIELD,
          TRANSLATIONS_FIELD,
        ]}
        onSubmit={(values) =>
          create.mutateAsync({
            key: values.key,
            label: values.label,
            iconKey: values.iconKey === '' ? null : values.iconKey,
            iconUrl: values.iconUrl.trim() === '' ? null : values.iconUrl.trim(),
            variants: formToVariants(values),
            ...destinationToNullable(values.destination),
            sortOrder: values.sortOrder,
            isActive: values.isActive,
            minAppVersion:
              values.minAppVersion === undefined || values.minAppVersion.trim() === ''
                ? null
                : values.minAppVersion.trim(),
            translations: values.translations,
          })
        }
        onSuccess={onClose}
        onCancel={onClose}
      />
    </>
  );
}

function EditShortcut({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: shortcut, isLoading, isError, error } = useHomeShortcut(id);

  if (isLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit shortcut</DialogTitle>
          <DialogDescription>Loading…</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </>
    );
  }

  if (isError || !shortcut) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit shortcut</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Could not load this shortcut</AlertTitle>
          <AlertDescription>{errorMessage(error, 'Please try again.')}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit “{shortcut.key}”</DialogTitle>
        <DialogDescription>
          The key is fixed. Update the label, icon, destination and ordering.
        </DialogDescription>
      </DialogHeader>
      {/* REMOUNT on `updatedAt` so the form rebinds to fresh data after an invalidation. */}
      <EditShortcutForm key={shortcut.updatedAt} shortcut={shortcut} onClose={onClose} />
    </>
  );
}

function EditShortcutForm({
  shortcut,
  onClose,
}: {
  shortcut: HomeShortcutDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const update = useUpdateHomeShortcut();

  return (
    <EntityForm<ShortcutFormValues>
      mode="edit"
      entityLabel="Shortcut"
      schema={ShortcutSchema}
      updatedAt={shortcut.updatedAt}
      defaultValues={{
        key: shortcut.key,
        label: shortcut.label,
        iconKey: shortcut.iconKey ?? '',
        iconUrl: shortcut.iconUrl ?? '',
        // TAM-174 — the arm rows, flattened. `String(0)` is `'0'`, which is a
        // legitimate stop rather than "blank", so the mapper distinguishes null
        // from zero explicitly.
        ...variantsToForm(shortcut.variants),
        destination: destinationFromRow({
          type: shortcut.destinationType,
          value: shortcut.destinationValue,
        }),
        sortOrder: shortcut.sortOrder,
        isActive: shortcut.isActive,
        minAppVersion: shortcut.minAppVersion ?? '',
        translations: shortcutTranslations(shortcut),
      }}
      fields={[
        {
          name: 'key',
          label: 'Key',
          type: 'text',
          disabled: true,
          description: 'The key is a permanent stable identity and cannot be changed.',
        },
        { name: 'label', label: 'Label', type: 'text', required: true },
        ICON_URL_FIELD,
        ICON_FIELD,
        ...VARIANT_FIELDS,
        DESTINATION_FIELD,
        {
          name: 'sortOrder',
          label: 'Sort order',
          type: 'number',
          description: 'Lower numbers appear first.',
        },
        { name: 'isActive', label: 'Active', type: 'switch' },
        MIN_APP_VERSION_FIELD,
        TRANSLATIONS_FIELD,
      ]}
      onSubmit={(values) => {
        const changes: HomeShortcutPatchChanges = {};
        if (values.label !== shortcut.label) changes.label = values.label;
        if (translationsChanged(values.translations, shortcutTranslations(shortcut)))
          changes.translations = values.translations;
        const nextIcon = values.iconKey === '' ? null : values.iconKey;
        if (nextIcon !== shortcut.iconKey) changes.iconKey = nextIcon;
        const nextIconUrl = values.iconUrl.trim() === '' ? null : values.iconUrl.trim();
        if (nextIconUrl !== (shortcut.iconUrl ?? null)) changes.iconUrl = nextIconUrl;

        // TAM-174 — the arms are sent as a SET, not field by field: the write
        // contract REPLACES the whole set (like translations), so a diff would
        // have to reconstruct it anyway. Compared as JSON to keep an unchanged
        // set out of the patch.
        const nextVariants = formToVariants(values);
        const priorVariants = formToVariants({
          ...values,
          ...variantsToForm(shortcut.variants),
        });
        if (JSON.stringify(nextVariants) !== JSON.stringify(priorVariants)) {
          changes.variants = nextVariants;
        }

        const dest = destinationToNullable(values.destination);
        if (dest.destinationType !== shortcut.destinationType) {
          changes.destinationType = dest.destinationType;
        }
        if (dest.destinationValue !== shortcut.destinationValue) {
          changes.destinationValue = dest.destinationValue;
        }
        if (values.sortOrder !== shortcut.sortOrder) changes.sortOrder = values.sortOrder;
        if (values.isActive !== shortcut.isActive) changes.isActive = values.isActive;
        const nextMinAppVersion =
          values.minAppVersion === undefined || values.minAppVersion.trim() === ''
            ? null
            : values.minAppVersion.trim();
        if (nextMinAppVersion !== (shortcut.minAppVersion ?? null)) {
          changes.minAppVersion = nextMinAppVersion;
        }
        return update.mutateAsync({
          id: shortcut.id,
          changes,
          expectedUpdatedAt: values.updatedAt as string,
        });
      }}
      onSuccess={onClose}
      onConflict={() => {
        void qc.invalidateQueries({ queryKey: adminKeys.detail('home-shortcut', shortcut.id) });
      }}
      onCancel={onClose}
    />
  );
}
