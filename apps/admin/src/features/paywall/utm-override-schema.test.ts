import { expect, test } from 'vitest';

import type { UtmOverride } from './use-utm-overrides';
import {
  MAX_OVERRIDE_BENEFITS,
  buildDocument,
  diffOverride,
  draftFromOverride,
  hasOverrideErrors,
  newOverrideDraft,
  validateOverride,
} from './utm-override-schema';

/**
 * The wire rules of the override DOCUMENT, in isolation from the page.
 *
 * These are the ones that bite: the bodies are `.strict()` (an unknown or
 * empty-string key is a 400), `locales` is REQUIRED even when nothing is
 * overridden, `media` is a single object that is all-or-nothing — a URL with no
 * media id is a 400 — and `benefits` is an ORDERED replace-set that is rejected
 * when empty, so "keep the paywall's own list" is expressed by omitting the key.
 */

const HERO_URL = 'https://cdn.example.com/media/paywall/hero.mp4';

function row(overrides: UtmOverride['overrides']): UtmOverride {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    utmGroup: 'Diwali Prospecting — Broad',
    enabled: true,
    overrides,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}

const storedMedia = {
  mediaType: 'video' as const,
  url: HERO_URL,
  thumbnailUrl: null,
  mediaId: 'diwali_hero_v1',
};

const mandir = { benefitId: 'mandir', icon: 'benefit-mandir.png', name: 'मंदिर' };
const wallpaper = { benefitId: 'wallpaper', icon: 'benefit-wallpaper.png', name: 'वॉलपेपर' };

test('an untouched blank draft is `{ locales: {} }` — never `{}` and never empty strings', () => {
  expect(buildDocument(newOverrideDraft())).toEqual({ locales: {} });
});

test('a locale with nothing set is omitted, and a partly-filled one carries only its filled keys', () => {
  const draft = newOverrideDraft();
  const en = draft.locales.en;
  if (!en) throw new Error('en locale missing from the draft');
  en.benefits = [{ benefitId: 'mandir', icon: 'benefit-mandir.png', name: '  Mandir  ' }];

  expect(buildDocument(draft)).toEqual({
    locales: { en: { benefits: [{ ...mandir, name: 'Mandir' }] } },
  });
});

test('an empty benefit list omits the key — `[]` is a 400, not "show nothing"', () => {
  const stored = row({ locales: { hi: { media: storedMedia, benefits: [mandir] } } });
  const draft = draftFromOverride(stored);
  const hi = draft.locales.hi;
  if (!hi) throw new Error('hi locale missing from the draft');
  hi.benefits = [];

  expect(buildDocument(draft)).toEqual({ locales: { hi: { media: storedMedia } } });
});

test('a half-filled media omits the whole object rather than sending a partial one', () => {
  const draft = newOverrideDraft();
  draft.utmGroup = 'Broad';
  const hi = draft.locales.hi;
  if (!hi) throw new Error('hi locale missing from the draft');
  hi.url = HERO_URL; // no media id yet

  expect(buildDocument(draft)).toEqual({ locales: {} });
  expect(validateOverride(draft).locales.hi?.mediaId).toBeTruthy();
});

test('a complete media round-trips as one object under its locale', () => {
  const draft = draftFromOverride(row({ locales: { hi: { media: storedMedia } } }));
  expect(buildDocument(draft)).toEqual({ locales: { hi: { media: storedMedia } } });
});

test('the benefit list keeps its order — the array position IS the render order', () => {
  const stored = row({ locales: { hi: { benefits: [mandir, wallpaper] } } });
  const original = draftFromOverride(stored);
  const draft = draftFromOverride(stored);
  const hi = draft.locales.hi;
  if (!hi) throw new Error('hi locale missing from the draft');
  hi.benefits = [wallpaper, mandir];

  expect(diffOverride(draft, original)).toEqual({
    overrides: { locales: { hi: { benefits: [wallpaper, mandir] } } },
  });
});

test('renaming one benefit leaves utmGroup/enabled out and ships the whole document', () => {
  const stored = row({ locales: { en: { media: storedMedia, benefits: [mandir] } } });
  const original = draftFromOverride(stored);
  const draft = draftFromOverride(stored);
  const benefit = draft.locales.en?.benefits[0];
  if (!benefit) throw new Error('en benefit missing from the draft');
  benefit.name = 'Your temple';

  expect(diffOverride(draft, original)).toEqual({
    overrides: {
      locales: {
        en: { media: storedMedia, benefits: [{ ...mandir, name: 'Your temple' }] },
      },
    },
  });
});

test('toggling enabled alone leaves the document out of the patch entirely', () => {
  const stored = row({ locales: { en: { benefits: [mandir] } } });
  const draft = draftFromOverride(stored);
  draft.enabled = false;
  expect(diffOverride(draft, draftFromOverride(stored))).toEqual({ enabled: false });
});

test('an unchanged draft diffs to null — no request at all', () => {
  const stored = row({ locales: { en: { media: storedMedia, benefits: [mandir] } } });
  expect(diffOverride(draftFromOverride(stored), draftFromOverride(stored))).toBeNull();
});

test('the ad group name is required; every other field is optional', () => {
  const blank = validateOverride(newOverrideDraft());
  expect(blank.utmGroup).toBeTruthy();
  expect(hasOverrideErrors(blank)).toBe(true);

  const named = newOverrideDraft();
  named.utmGroup = 'Diwali Prospecting — Broad';
  expect(hasOverrideErrors(validateOverride(named))).toBe(false);
});

test('a malformed media id and a media id with no file are rejected before the request', () => {
  const draft = newOverrideDraft();
  draft.utmGroup = 'Broad';
  const en = draft.locales.en;
  if (!en) throw new Error('en locale missing from the draft');
  en.mediaId = 'Not A Slug!';

  const errors = validateOverride(draft);
  expect(errors.locales.en?.mediaId).toBeTruthy();
  expect(errors.locales.en?.url).toBeTruthy();
  expect(hasOverrideErrors(errors)).toBe(true);
});

test('a benefit row must be complete and correctly shaped — the server 400s on each of these', () => {
  const draft = newOverrideDraft();
  draft.utmGroup = 'Broad';
  const en = draft.locales.en;
  if (!en) throw new Error('en locale missing from the draft');
  en.benefits = [
    { benefitId: 'Aarti Bhajans', icon: 'benefit-mandir.png', name: 'Aarti' },
    { benefitId: 'mandir', icon: 'https://cdn.example.com/icon.png', name: 'Mandir' },
    { benefitId: 'wallpaper', icon: 'benefit-wallpaper.png', name: '   ' },
    { benefitId: 'ringtone', icon: 'benefit-ringtone.png', name: 'x'.repeat(61) },
  ];

  const errors = validateOverride(draft).locales.en;
  expect(errors?.rows[0]?.benefitId).toBeTruthy();
  expect(errors?.rows[1]?.icon).toBeTruthy();
  expect(errors?.rows[2]?.name).toBeTruthy();
  expect(errors?.rows[3]?.name).toBeTruthy();
  expect(hasOverrideErrors(validateOverride(draft))).toBe(true);
});

test('the same benefit twice is rejected — the app would double-count its impressions', () => {
  const draft = newOverrideDraft();
  draft.utmGroup = 'Broad';
  const hi = draft.locales.hi;
  if (!hi) throw new Error('hi locale missing from the draft');
  hi.benefits = [mandir, { ...mandir, name: 'मंदिर 2' }];

  expect(validateOverride(draft).locales.hi?.benefits).toBeTruthy();
});

test(`more than ${MAX_OVERRIDE_BENEFITS} benefits is rejected`, () => {
  const draft = newOverrideDraft();
  draft.utmGroup = 'Broad';
  const hi = draft.locales.hi;
  if (!hi) throw new Error('hi locale missing from the draft');
  hi.benefits = Array.from({ length: MAX_OVERRIDE_BENEFITS + 1 }, (_, i) => ({
    benefitId: `benefit_${i}`,
    icon: 'benefit-mandir.png',
    name: `Benefit ${i}`,
  }));

  expect(validateOverride(draft).locales.hi?.benefits).toBeTruthy();
});

test('an empty benefit list is not an error — it means "keep the paywall’s own"', () => {
  const draft = newOverrideDraft();
  draft.utmGroup = 'Broad';
  expect(hasOverrideErrors(validateOverride(draft))).toBe(false);
});
