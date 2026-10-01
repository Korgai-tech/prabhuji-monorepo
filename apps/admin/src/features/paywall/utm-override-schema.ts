import { z } from 'zod';

import { mediaIdSchema } from './paywall-schema';
import type {
  UtmOverride,
  UtmOverrideCreateBody,
  UtmOverrideDocument,
  UtmOverrideLocaleRow,
  UtmOverridePatchBody,
} from './use-utm-overrides';

/**
 * Client mirror of `paywall-utm-override.admin.schemas.ts`. As everywhere in
 * this SPA, client Zod is FAST FEEDBACK — the API's Zod at the route boundary is
 * the enforcement point.
 *
 * The rules worth knowing before reading the code:
 *
 *  1. **The bodies are `.strict()`.** An unknown key is a 400, so the document
 *     is assembled by ONE function (`buildDocument`) and never spread from a
 *     draft.
 *  2. **`locales` is REQUIRED.** An override that changes nothing is
 *     `{ locales: {} }` — never `{}`.
 *  3. **`media` is one object, not a list**, and it is all-or-nothing: the
 *     default paywall has exactly one hero row per locale, and a half-filled
 *     `media` (a URL with no media id) is a 400. An incomplete one omits the key.
 *  4. **`benefits` REPLACES the paywall's list** for that locale, and the array
 *     ORDER is the render order (the server assigns `sortOrder` from the index).
 *     Showing three of the eight, renamed and reordered, is the whole point.
 *  5. **An empty `benefits` array is a 400**, not "show nothing" — the key is
 *     omitted instead, which keeps the paywall's own list.
 *  6. **An empty string is never sent** — absent means "keep the CMS value".
 *
 * The four `paywall_translations` copy lines (`title`, `payNowCta`,
 * `cancelAnytimeText`, `refundPolicyText`) are NOT here and are not coming back:
 * the API dropped them because they are the product's own voice, not a
 * campaign's, and sending one now is a `.strict()` 400.
 */

/** Server: `z.string().trim().min(1).max(200)`. Free text, NOT a slug. */
export const MAX_UTM_GROUP_LENGTH = 200;

export const utmGroupSchema = z
  .string()
  .trim()
  .min(1, 'Ad group name is required')
  .max(MAX_UTM_GROUP_LENGTH, `Ad group name must be ${MAX_UTM_GROUP_LENGTH} characters or fewer`);

/**
 * Server cap: `z.array(OverrideBenefit).min(1).max(MAX_OVERRIDE_BENEFITS)`.
 * Eight is what the default paywall ships and what the tile grid was laid out
 * against. A campaign showing FEWER is the normal case.
 */
export const MAX_OVERRIDE_BENEFITS = 8;

const benefitIdSchema = z
  .string()
  .trim()
  .min(1, 'Pick a benefit')
  .max(60, 'Benefit ID must be 60 characters or fewer')
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use a lowercase benefit id, e.g. aarti_bhajans');

/**
 * `icon` is a BUNDLED ASSET KEY the app maps to compiled-in artwork — never a
 * URL, which is why nothing here uploads. A key no installed build ships
 * renders a blank tile, so the editor picks from the paywall's own keys.
 */
const benefitIconSchema = z
  .string()
  .trim()
  .min(1, 'Pick an icon')
  .max(100, 'Icon key must be 100 characters or fewer')
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'Use a bundled icon key, e.g. benefit-mandir.png');

const benefitNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(60, 'Name must be 60 characters or fewer');

type OverrideMediaType = NonNullable<UtmOverrideLocaleRow['media']>['mediaType'];

/** One benefit tile being edited. Identical to its wire row — nothing local. */
export interface BenefitDraft {
  benefitId: string;
  icon: string;
  name: string;
}

/**
 * One locale's override while it is being edited. `''` / `null` / an empty list
 * means "not overridden" — those keys are omitted from the document, not sent
 * empty.
 */
export interface LocaleDraft {
  mediaType: OverrideMediaType;
  url: string;
  thumbnailUrl: string | null;
  mediaId: string;
  /** Ordered; the array position IS the tile's `sortOrder` on the wire. */
  benefits: BenefitDraft[];
}

export function emptyLocaleDraft(): LocaleDraft {
  return {
    mediaType: 'video',
    url: '',
    thumbnailUrl: null,
    mediaId: '',
    benefits: [],
  };
}

export interface OverrideDraft {
  utmGroup: string;
  enabled: boolean;
  /** Every admin locale is present; the empty ones are omitted on the wire. */
  locales: Record<string, LocaleDraft>;
}

export interface BenefitErrors {
  benefitId?: string;
  icon?: string;
  name?: string;
}

export interface LocaleErrors {
  url?: string;
  mediaId?: string;
  /** List-level: too many tiles, or the same benefit twice. */
  benefits?: string;
  /** Per tile, keyed by its position in the list. */
  rows: Record<number, BenefitErrors>;
}

export const NO_LOCALE_ERRORS: LocaleErrors = { rows: {} };

export function localeHasErrors(errors: LocaleErrors): boolean {
  return (
    errors.url !== undefined ||
    errors.mediaId !== undefined ||
    errors.benefits !== undefined ||
    Object.values(errors.rows).some((row) => Object.keys(row).length > 0)
  );
}

export interface OverrideErrors {
  utmGroup?: string;
  locales: Record<string, LocaleErrors>;
}

export function hasOverrideErrors(errors: OverrideErrors): boolean {
  return (
    errors.utmGroup !== undefined || Object.values(errors.locales).some(localeHasErrors)
  );
}

/**
 * The only locales an override may carry, mirroring `OVERRIDE_LOCALES` on the
 * API. The default paywall has content in these two alone, and the server's
 * locale-fallback chain (`requested → hi → en`) means every caller is SERVED one
 * of them — so a block for any other language could never render. The API
 * rejects one with a 400; this keeps the form from offering it.
 */
export const OVERRIDE_LOCALES = ['hi', 'en'] as const;

function emptyLocales(): Record<string, LocaleDraft> {
  const out: Record<string, LocaleDraft> = {};
  for (const locale of OVERRIDE_LOCALES) out[locale] = emptyLocaleDraft();
  return out;
}

/** A blank row for the "new ad group override" form. */
export function newOverrideDraft(): OverrideDraft {
  return { utmGroup: '', enabled: true, locales: emptyLocales() };
}

export function draftFromOverride(row: UtmOverride): OverrideDraft {
  const locales = emptyLocales();
  // Over OVERRIDE_LOCALES, not the stored keys: the API narrows to these two
  // before serialising, so any other key is already gone — and echoing one back
  // on save would just earn a 400 from the enum.
  for (const locale of OVERRIDE_LOCALES) {
    const values = row.overrides.locales[locale];
    if (values === undefined) continue;
    locales[locale] = {
      mediaType: values.media?.mediaType ?? 'video',
      url: values.media?.url ?? '',
      thumbnailUrl: values.media?.thumbnailUrl ?? null,
      mediaId: values.media?.mediaId ?? '',
      benefits: (values.benefits ?? []).map((benefit) => ({
        benefitId: benefit.benefitId,
        icon: benefit.icon,
        name: benefit.name,
      })),
    };
  }

  return { utmGroup: row.utmGroup, enabled: row.enabled, locales };
}

/** Complete enough to send: the server needs both a URL and a media id. */
function hasMedia(row: LocaleDraft): boolean {
  return row.url.trim().length > 0 && row.mediaId.trim().length > 0;
}

/** Anything media-ish typed in — used to tell "not overridden" from "half filled". */
function touchedMedia(row: LocaleDraft): boolean {
  return (
    row.url.trim().length > 0 ||
    row.mediaId.trim().length > 0 ||
    (row.thumbnailUrl ?? '').length > 0
  );
}

/** What this locale overrides, in one line — drives the collapsed section summary. */
export function localeSummary(draft: OverrideDraft, locale: string): string {
  const row = draft.locales[locale];
  if (!row) return 'no overrides';
  const parts: string[] = [];
  if (hasMedia(row)) parts.push('media replaced');
  if (row.benefits.length > 0) {
    parts.push(`${row.benefits.length} benefit${row.benefits.length === 1 ? '' : 's'}`);
  }
  return parts.length === 0 ? 'no overrides' : parts.join(' · ');
}

/** Which locales this draft actually overrides. */
export function overriddenLocales(draft: OverrideDraft): string[] {
  return Object.keys(draft.locales).filter((locale) => {
    const row = draft.locales[locale];
    return row !== undefined && (hasMedia(row) || row.benefits.length > 0);
  });
}

/** The wire rows: trimmed, in list order, with the half-filled ones dropped. */
function benefitRows(row: LocaleDraft): BenefitDraft[] {
  return row.benefits
    .map((benefit) => ({
      benefitId: benefit.benefitId.trim(),
      icon: benefit.icon.trim(),
      name: benefit.name.trim(),
    }))
    .filter(
      (benefit) =>
        benefit.benefitId.length > 0 && benefit.icon.length > 0 && benefit.name.length > 0,
    );
}

/**
 * The wire document. The ONLY place `overrides` is assembled — the body is
 * `.strict()`, and every "absent means keep the CMS value" rule lives here: an
 * empty string omits its key, an incomplete `media` omits the whole object, an
 * empty benefit list omits `benefits` (`[]` is a 400), a locale with nothing set
 * is left out, and `locales` itself is always present.
 */
export function buildDocument(draft: OverrideDraft): UtmOverrideDocument {
  const locales: UtmOverrideDocument['locales'] = {};

  for (const locale of Object.keys(draft.locales).sort()) {
    const row = draft.locales[locale];
    if (!row) continue;

    const entry: UtmOverrideLocaleRow = {};
    if (hasMedia(row)) {
      entry.media = {
        mediaType: row.mediaType,
        url: row.url.trim(),
        thumbnailUrl: row.thumbnailUrl,
        mediaId: row.mediaId.trim(),
      };
    }
    const benefits = benefitRows(row);
    if (benefits.length > 0) entry.benefits = benefits;

    if (Object.keys(entry).length > 0) locales[locale] = entry;
  }

  return { locales };
}

export function validateOverride(draft: OverrideDraft): OverrideErrors {
  const errors: OverrideErrors = { locales: {} };

  const group = utmGroupSchema.safeParse(draft.utmGroup);
  if (!group.success) errors.utmGroup = group.error.issues[0]?.message ?? 'Invalid ad group name';

  for (const [locale, row] of Object.entries(draft.locales)) {
    const localeErrors: LocaleErrors = { rows: {} };

    // Media is all-or-nothing: untouched is fine, half-filled is a 400.
    if (touchedMedia(row)) {
      if (row.url.trim().length === 0) {
        localeErrors.url = 'Upload a file — media needs both a file and an ID, or neither.';
      }
      const parsed = mediaIdSchema.safeParse(row.mediaId);
      if (!parsed.success) {
        localeErrors.mediaId = parsed.error.issues[0]?.message ?? 'Invalid media ID';
      }
    }

    // An empty list is not an error — it omits the key, which is how "keep the
    // paywall's own benefits" is expressed. A list with a blank row IS: the
    // server rejects it, and silently dropping the row would ship a campaign
    // missing a tile the editor thinks they added.
    row.benefits.forEach((benefit, index) => {
      const rowErrors: BenefitErrors = {};
      const id = benefitIdSchema.safeParse(benefit.benefitId);
      if (!id.success) rowErrors.benefitId = id.error.issues[0]?.message ?? 'Invalid benefit';
      const icon = benefitIconSchema.safeParse(benefit.icon);
      if (!icon.success) rowErrors.icon = icon.error.issues[0]?.message ?? 'Invalid icon key';
      const name = benefitNameSchema.safeParse(benefit.name);
      if (!name.success) rowErrors.name = name.error.issues[0]?.message ?? 'Invalid name';
      if (Object.keys(rowErrors).length > 0) localeErrors.rows[index] = rowErrors;
    });

    if (row.benefits.length > MAX_OVERRIDE_BENEFITS) {
      localeErrors.benefits = `At most ${MAX_OVERRIDE_BENEFITS} benefits — remove the extras.`;
    } else {
      // The app reports impressions under `benefitId`, so two tiles sharing one
      // would double-count that benefit in the warehouse. The server rejects it.
      const ids = row.benefits.map((benefit) => benefit.benefitId.trim());
      const duplicate = ids.find((id, index) => id.length > 0 && ids.indexOf(id) !== index);
      if (duplicate !== undefined) {
        localeErrors.benefits = `“${duplicate}” is listed twice — each benefit may appear only once.`;
      }
    }

    if (localeHasErrors(localeErrors)) errors.locales[locale] = localeErrors;
  }

  return errors;
}

export function toCreateBody(draft: OverrideDraft): UtmOverrideCreateBody {
  return {
    utmGroup: draft.utmGroup.trim(),
    enabled: draft.enabled,
    overrides: buildDocument(draft),
  };
}

/**
 * Only the changed keys. Both sides go through `buildDocument`, so the
 * comparison is order-stable without a canonical stringifier and a stored
 * document that merely needed trimming does not read as an edit.
 *
 * Returns `null` when nothing changed — the caller then makes no request at all.
 */
export function diffOverride(
  draft: OverrideDraft,
  original: OverrideDraft,
): UtmOverridePatchBody | null {
  const body: UtmOverridePatchBody = {};

  const utmGroup = draft.utmGroup.trim();
  if (utmGroup !== original.utmGroup.trim()) body.utmGroup = utmGroup;
  if (draft.enabled !== original.enabled) body.enabled = draft.enabled;

  const next = buildDocument(draft);
  if (JSON.stringify(next) !== JSON.stringify(buildDocument(original))) body.overrides = next;

  return Object.keys(body).length > 0 ? body : null;
}

export function isOverrideDirty(draft: OverrideDraft, original: OverrideDraft): boolean {
  return diffOverride(draft, original) !== null;
}
