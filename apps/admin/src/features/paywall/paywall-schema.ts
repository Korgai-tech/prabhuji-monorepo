import { z } from 'zod';

import { adminLocaleEnum } from '@/components/translations/locales';

import type {
  PaywallHeroMediaPatchRow,
  PaywallLocalePatchRow,
  PaywallTranslation,
} from './use-paywall-config';

/**
 * Client mirror of the server's paywall write rules (TAM-159). As everywhere in
 * this SPA, client Zod is FAST FEEDBACK — `apps/api`'s Zod at the route boundary
 * is the enforcement point.
 *
 * Mirrored rules:
 *   - The four shell-copy fields are non-empty and length-bounded.
 *   - `mediaId` is a bounded slug. It is not display data: it rides on every
 *     paywall analytics event, which is why it is constrained rather than free
 *     text (carried over from TAM-130's `videoId`).
 *   - Replacing a row's asset REQUIRES a new `mediaId`. The creative and its
 *     analytics identity are one fact; letting them drift silently attributes
 *     new-creative impressions to the old one.
 *   - A row with no `url` cannot be saved. `<MediaUploadField>` only emits a URL
 *     after the S3 PUT resolves, so this is also the "submitted before the
 *     upload finished" guard.
 *   - A locale the editor did not touch is never sent. The server diffs again,
 *     so this is an optimisation on our side — but it also keeps an untouched
 *     externally-hosted seed URL out of the payload, which the server would
 *     reject as "not minted by our presign flow".
 *
 * ⚠️ Hero media is REPLACE-SET per locale on the server, so any hero change
 * ships the whole list for that locale — including rows the editor did not
 * touch, which are then re-validated for ownership. Seeded rows point at public
 * CDNs, so the first hero edit of a seeded locale must re-upload every row in it.
 */

export const SLUG_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;

/** Server cap: `z.array(AdminHeroMediaRow).max(10)`. */
export const MAX_HERO_ROWS = 10;

/**
 * How many hero rows one locale may hold under `layout`.
 *
 * Only the carousel renders more than one; the other three draw the first row
 * and ignore the rest, and the server now REJECTS a longer list for them (400,
 * checked against the layout the save RESULTS IN). Mirrored here so switching
 * carousel→card_hero with three rows staged is visible before Save.
 */
export function heroLimit(layout: string): number {
  return layout === 'carousel' ? MAX_HERO_ROWS : 1;
}

/**
 * `minAppVersion` — mirrors the server's `appVersionString`.
 *
 * Strict `major.minor.patch` because the failure mode of a typo is SILENT: the
 * resolver's compare denies anything unparseable, so `1.1` or `v1.1.0` would
 * send every user of this paywall to the default with nothing saying why.
 */
export const APP_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export const appVersionSchema = z
  .string()
  .trim()
  .regex(APP_VERSION_PATTERN, 'Use major.minor.patch, e.g. 1.1.0 (0.0.0 means no gate)');

/** No gate at all — every install, however old, is eligible for this paywall. */
export const NO_VERSION_GATE = '0.0.0';

/**
 * `-1 | 0 | 1` by NUMERIC 3-tuple — the same comparison the server's
 * `meetsMinVersion` makes. A string compare would call `1.0.99` newer than
 * `1.1.0`. Returns `null` when either side is not a version.
 */
export function compareAppVersions(a: string, b: string): number | null {
  if (!APP_VERSION_PATTERN.test(a.trim()) || !APP_VERSION_PATTERN.test(b.trim())) return null;
  const left = a.trim().split('.').map(Number);
  const right = b.trim().split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export const mediaIdSchema = z
  .string()
  .trim()
  .min(1, 'Media ID is required')
  .max(64, 'Media ID must be 64 characters or fewer')
  .regex(
    SLUG_PATTERN,
    'Use lowercase letters, numbers, and single _ or - separators (e.g. vip_intro_v2)',
  );

export type LocaleTextField =
  | 'title'
  | 'payNowCta'
  | 'cancelAnytimeText'
  | 'refundPolicyText';

/** Label + length cap per shell-copy field — mirrors `AdminPaywallLocaleRow`. */
export const LOCALE_TEXT_FIELDS: {
  name: LocaleTextField;
  label: string;
  max: number;
  hint: string;
}[] = [
  { name: 'title', label: 'Title', max: 120, hint: 'The screen’s headline.' },
  { name: 'payNowCta', label: 'Pay-now button', max: 60, hint: 'The primary button’s label.' },
  {
    name: 'cancelAnytimeText',
    label: 'Cancel-anytime line',
    max: 200,
    hint: 'Shown by layouts that carry the reassurance line.',
  },
  {
    name: 'refundPolicyText',
    label: 'Refund-policy line',
    max: 200,
    hint: 'Shown by layouts that carry the reassurance line.',
  },
];

function textSchema(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);
}

export type HeroMediaType = PaywallHeroMediaPatchRow['mediaType'];

/** One hero row being edited. `key` is local identity only — never sent. */
export interface HeroDraft {
  /**
   * Stable identity for React keys, per-row error maps, and "is this the row
   * that was stored here". An array index cannot do that job: reorder, insert
   * and remove all change it, which would move a row's error onto its neighbour
   * and remount a half-finished upload.
   */
  key: string;
  mediaType: HeroMediaType;
  url: string;
  thumbnailUrl: string | null;
  mediaId: string;
}

/** The editable state of one locale card. */
export interface LocaleDraft {
  title: string;
  payNowCta: string;
  cancelAnytimeText: string;
  refundPolicyText: string;
  hero: HeroDraft[];
}

export interface HeroErrors {
  url?: string;
  mediaId?: string;
}

export interface LocaleErrors {
  fields: Partial<Record<LocaleTextField, string>>;
  /** Keyed by `HeroDraft.key`, not by index. */
  hero: Record<string, HeroErrors>;
  /** Too many hero rows for the SELECTED layout — not tied to one row. */
  heroCount?: string;
}

export const NO_LOCALE_ERRORS: LocaleErrors = { fields: {}, hero: {} };

export function localeHasErrors(errors: LocaleErrors): boolean {
  return (
    errors.heroCount !== undefined ||
    Object.keys(errors.fields).length > 0 ||
    Object.values(errors.hero).some((row) => row.url !== undefined || row.mediaId !== undefined)
  );
}

/** `image` unless the stored row says otherwise — the app can only build two. */
function toHeroMediaType(value: string): HeroMediaType {
  return value === 'video' ? 'video' : 'image';
}

export function draftFromTranslation(t: PaywallTranslation): LocaleDraft {
  return {
    title: t.title,
    payNowCta: t.payNowCta,
    cancelAnytimeText: t.cancelAnytimeText,
    refundPolicyText: t.refundPolicyText,
    hero: [...t.heroMedia]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => ({
        // Deterministic, so re-deriving the originals from a refetch produces
        // the same keys and nothing remounts.
        key: `${t.locale}#${m.sortOrder}`,
        mediaType: toHeroMediaType(m.mediaType),
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
        mediaId: m.mediaId,
      })),
  };
}

let newRowCounter = 0;

/** A blank hero row. Its key is unique for this session — never a stored key. */
export function newHeroDraft(): HeroDraft {
  newRowCounter += 1;
  return {
    key: `new#${newRowCounter}`,
    mediaType: 'image',
    url: '',
    thumbnailUrl: null,
    mediaId: '',
  };
}

/**
 * The wire rows for one locale's hero list. `sortOrder` is the POSITION, so a
 * reorder is expressed by the array order alone and the stored list is always
 * renumbered contiguously from 0 (which is what the seed writes).
 */
export function toHeroPatchRows(hero: HeroDraft[]): PaywallHeroMediaPatchRow[] {
  return hero.map((row, index) => ({
    sortOrder: index,
    mediaType: row.mediaType,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl,
    mediaId: row.mediaId.trim(),
  }));
}

function heroChanged(draft: LocaleDraft, original: LocaleDraft): boolean {
  return (
    JSON.stringify(toHeroPatchRows(draft.hero)) !==
    JSON.stringify(toHeroPatchRows(original.hero))
  );
}

/** Has the editor touched this locale at all? Drives the Save button and "Unsaved:". */
export function isLocaleDirty(draft: LocaleDraft, original: LocaleDraft): boolean {
  return (
    draft.title !== original.title ||
    draft.payNowCta !== original.payNowCta ||
    draft.cancelAnytimeText !== original.cancelAnytimeText ||
    draft.refundPolicyText !== original.refundPolicyText ||
    heroChanged(draft, original)
  );
}

/**
 * Per-field messages for one locale card, or no errors when the row is clean.
 * An untouched locale never produces errors — a seeded row must not light up red
 * before anyone has edited anything.
 *
 * The ONE exception is the hero COUNT, checked before that gate: a locale nobody
 * touched becomes invalid the moment the layout is switched away from the
 * carousel, and that is exactly the case the editor must see before Save.
 */
export function validateLocale(
  draft: LocaleDraft,
  original: LocaleDraft,
  limit: number,
): LocaleErrors {
  const errors: LocaleErrors = { fields: {}, hero: {} };

  if (draft.hero.length > limit) {
    errors.heroCount =
      limit === 1
        ? 'Only the carousel layout shows more than one hero item — remove the extras, or switch this paywall back to the carousel.'
        : `At most ${limit} hero items.`;
  }

  if (!isLocaleDirty(draft, original)) return errors;

  for (const field of LOCALE_TEXT_FIELDS) {
    const parsed = textSchema(field.label, field.max).safeParse(draft[field.name]);
    if (!parsed.success) {
      errors.fields[field.name] = parsed.error.issues[0]?.message ?? `${field.label} is invalid`;
    }
  }

  const storedByKey = new Map(original.hero.map((row) => [row.key, row]));

  for (const row of draft.hero) {
    const rowErrors: HeroErrors = {};

    if (row.url.trim().length === 0) {
      rowErrors.url = 'Upload a file for this item — an empty hero row cannot be saved.';
    }

    const parsed = mediaIdSchema.safeParse(row.mediaId);
    if (!parsed.success) {
      rowErrors.mediaId = parsed.error.issues[0]?.message ?? 'Invalid media ID';
    } else {
      const stored = storedByKey.get(row.key);
      if (stored && stored.url !== row.url && stored.mediaId === row.mediaId) {
        rowErrors.mediaId =
          'This is a new creative, so give it a new media ID — it identifies it in analytics.';
      }
    }

    if (rowErrors.url !== undefined || rowErrors.mediaId !== undefined) {
      errors.hero[row.key] = rowErrors;
    }
  }

  return errors;
}

/** Narrows a read-side locale (tolerant `string`) to the write enum. */
export function toPatchLocale(locale: string): PaywallLocalePatchRow['locale'] | null {
  const parsed = adminLocaleEnum.safeParse(locale);
  return parsed.success ? parsed.data : null;
}

/**
 * The wire row for one locale — only the changed fields — or `null` when nothing
 * changed. Mirrors the server's own diff. `heroMedia`, when present, is the
 * WHOLE list: the server treats it as a replace-set.
 */
export function diffLocale(
  locale: PaywallLocalePatchRow['locale'],
  draft: LocaleDraft,
  original: LocaleDraft,
): PaywallLocalePatchRow | null {
  const row: PaywallLocalePatchRow = { locale };
  let changed = false;

  for (const field of LOCALE_TEXT_FIELDS) {
    const next = draft[field.name].trim();
    if (next !== original[field.name]) {
      row[field.name] = next;
      changed = true;
    }
  }

  if (heroChanged(draft, original)) {
    row.heroMedia = toHeroPatchRows(draft.hero);
    changed = true;
  }

  return changed ? row : null;
}
