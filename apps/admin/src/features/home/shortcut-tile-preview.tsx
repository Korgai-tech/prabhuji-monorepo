import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  "New colour design" tile preview — what the phone will actually paint
 * ════════════════════════════════════════════════════════════════════════════
 *
 * TAM-174's palette reaches ops as five text inputs: two `#RRGGBB` colours, two
 * stop fractions and a label colour. That is a faithful transcription of Figma
 * and a terrible thing to hold in your head — nothing on the form said what
 * `#EAF4FF → #3896E9` at stops `0.1 → 1.4734` looks like behind a label in
 * `#1261A8`, so the only way to check a palette was to ship it and open the
 * app. This renders the tile instead.
 *
 * The form calls this group "New colour design"; the wire, the `variant`
 * column and the `grid_variant` analytics property call it `gradient_v1`. Both
 * names are deliberate — ops should not have to learn an experiment id, and
 * whoever reads the results should be able to map a dashboard row back to a
 * field. The code below keeps the system name, since it reads the form's
 * `gradient_v1_*` keys.
 *
 * IT IS A PREVIEW, NOT A SECOND IMPLEMENTATION. The phone
 * (`home_shortcut_grid.dart`) remains the only renderer that matters; this
 * mirrors it closely enough to judge a palette by, and the mapping below is
 * kept deliberately identical where it counts:
 *
 *  - GRADIENT STOPS RIDE AS PERCENTAGES, UNCLAMPED. `backgroundToStop` is
 *    authored above 1 on `set_wallpaper` (1.4734 — the gradient's lower handle
 *    sits below the card). Flutter expresses that as an `Alignment` below the
 *    box rather than a `LinearGradient.stop`, which asserts 0..1; CSS colour
 *    stops take percentages outside 0–100% natively, and for a `180deg`
 *    gradient 0% is the top edge and 100% the bottom, so `f → f * 100%` is the
 *    same geometry. Do NOT "fix" an out-of-range stop by clamping it here: it
 *    would make the preview disagree with the phone precisely on the tile that
 *    needed previewing.
 *  - INHERITANCE IS SHOWN, NOT THE RAW FIELD. A blank arm label or icon means
 *    INHERIT the base row, so the preview falls back the same way the server's
 *    projection does. Previewing the empty field instead would show a blank
 *    tile for the commonest correct setup (palette-only arm).
 *  - LABEL ON TOP, ART BELOW, art bottom-anchored and `contain`-fitted. The
 *    gradient card does not overlay its label on the artwork the way the
 *    control card does.
 *
 * Proportions come from the same Figma frame the app uses (node 3760:28483,
 * 104×94), expressed as ratios of the preview's width so this stays one
 * measurement scaled rather than a second set of magic numbers.
 */

/** Figma's authoring width for the gradient card (`AppHome.shortcutBaseWidth`). */
const BASE_WIDTH = 104;
/** The rendered preview width. Bigger than 104 so a hex is judgeable on a monitor. */
const PREVIEW_WIDTH = 156;
const SCALE = PREVIEW_WIDTH / BASE_WIDTH;

/** Node 3760:28483 — 104×94, so the card is slightly wider than tall. */
const CARD_ASPECT = 104 / 94;
const RADIUS = 8 * SCALE;
const LABEL_PAD_TOP = 6 * SCALE;
const LABEL_PAD_X = 8 * SCALE;
const LABEL_SIZE = 14 * SCALE;
const LABEL_LINE = 20 * SCALE;

/** `#RRGGBB` (exactly), the same shape the server's `hexColor` accepts. */
function isHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

/**
 * A stop fraction as a CSS percentage, or `null` when the input is not a
 * number. NOT clamped — see the header.
 */
function stopPercent(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return `${parsed * 100}%`;
}

function str(values: Record<string, unknown>, key: string): string {
  const value = values[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The five palette inputs resolved into a paintable gradient, or `null` when
 * the arm is not fully themed.
 *
 * ALL-OR-NOTHING, matching the server: `toShortcutTheme` publishes `theme:
 * null` unless all five columns are set, and the admin write path enforces the
 * same rule. A preview that painted three-fifths of a palette would show ops a
 * tile the phone will never render.
 */
function resolveTheme(values: Record<string, unknown>): {
  background: string;
  labelColor: string;
} | null {
  const from = str(values, 'gradient_v1_themeBackgroundFrom');
  const to = str(values, 'gradient_v1_themeBackgroundTo');
  const labelColor = str(values, 'gradient_v1_themeLabelColor');
  const fromStop = stopPercent(str(values, 'gradient_v1_themeBackgroundFromStop'));
  const toStop = stopPercent(str(values, 'gradient_v1_themeBackgroundToStop'));

  if (!isHex(from) || !isHex(to) || !isHex(labelColor)) return null;
  if (fromStop === null || toStop === null) return null;

  return {
    background: `linear-gradient(180deg, ${from} ${fromStop}, ${to} ${toStop})`,
    labelColor,
  };
}

export function ShortcutTilePreview({ values }: EntityFormFieldRenderProps) {
  const theme = resolveTheme(values);

  // Blank arm field ⇒ inherit the base row, exactly as the server projects it.
  const label = str(values, 'gradient_v1_label') || str(values, 'label');
  const iconUrl = str(values, 'gradient_v1_iconUrl') || str(values, 'iconUrl');

  if (theme === null) {
    return (
      <p className="text-sm text-muted-foreground" data-slot="shortcut-tile-preview-empty">
        Fill all five “New colour design” palette fields to preview the tile.
        Until then, users in the new colour design see this tile exactly as it
        looks today.
      </p>
    );
  }

  return (
    <div className="grid gap-2" data-slot="shortcut-tile-preview">
      <div
        role="img"
        aria-label={`Preview of the new colour design tile for ${label || 'this shortcut'}`}
        style={{
          width: PREVIEW_WIDTH,
          aspectRatio: String(CARD_ASPECT),
          borderRadius: RADIUS,
          background: theme.background,
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            paddingTop: LABEL_PAD_TOP,
            paddingLeft: LABEL_PAD_X,
            paddingRight: LABEL_PAD_X,
            color: theme.labelColor,
            fontSize: LABEL_SIZE,
            lineHeight: `${LABEL_LINE}px`,
            fontWeight: 600,
            textAlign: 'center',
            // Two lines then ellipsis, as on the phone.
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {label}
        </div>
        {/* `flex: 1` mirrors the app's `Expanded`: the art absorbs whatever the
            label leaves. No padding — the CMS asset is an export of the whole
            104×68 art band, so its insets are already baked into the PNG's
            transparent margins. */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {iconUrl !== '' && (
            <img
              src={iconUrl}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                objectPosition: 'bottom',
              }}
            />
          )}
        </div>
      </div>
      {iconUrl === '' && (
        <p className="text-xs text-muted-foreground">
          No artwork yet — upload it in “New colour design — icon image” above,
          or leave it blank to inherit the main icon.
        </p>
      )}
    </div>
  );
}

/** Adapter for an `<EntityForm>` `type: 'custom'` field's `render`. */
export function shortcutTilePreviewField() {
  return function renderShortcutTilePreview(props: EntityFormFieldRenderProps) {
    return <ShortcutTilePreview {...props} />;
  };
}
