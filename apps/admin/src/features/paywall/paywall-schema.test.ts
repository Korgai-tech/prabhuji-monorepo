import { expect, test } from 'vitest';

import {
  type LocaleDraft,
  appVersionSchema,
  compareAppVersions,
  diffLocale,
  draftFromTranslation,
  heroLimit,
  isLocaleDirty,
  localeHasErrors,
  newHeroDraft,
  toPatchLocale,
  validateLocale,
} from './paywall-schema';
import type { PaywallTranslation } from './use-paywall-config';

/**
 * Pure-logic coverage for the paywall draft rules (TAM-159). These are the
 * pieces that keep the request honest: never send an untouched locale (the
 * server's media-ownership gate would reject a seeded external URL), never let a
 * new creative inherit the old one's analytics identity, and express a reorder
 * as a whole renumbered list — which is what the server's replace-set expects.
 */

/** The carousel's cap; every other layout is checked with `heroLimit(layout)`. */
const MANY = 10;

const SEEDED_IMAGE = 'https://picsum.photos/seed/x/720/1280';
const SEEDED_VIDEO = 'https://cdn.jsdelivr.net/gh/x/big_buck_bunny.mp4';
const SEEDED_POSTER = 'https://picsum.photos/seed/y/720/1280';
const UPLOADED = 'https://cdn.example.com/paywall/paywall-hero-media/new.mp4';

const translation: PaywallTranslation = {
  locale: 'hi',
  title: 'VIP सदस्यता खोलें',
  cancelAnytimeText: 'कभी भी रद्द करें',
  refundPolicyText: 'कोई रिफंड नहीं',
  payNowCta: 'अभी भुगतान करें',
  heroMedia: [
    {
      sortOrder: 0,
      mediaType: 'image',
      url: SEEDED_IMAGE,
      thumbnailUrl: null,
      mediaId: 'vip_hero_v1',
    },
    {
      sortOrder: 1,
      mediaType: 'video',
      url: SEEDED_VIDEO,
      thumbnailUrl: SEEDED_POSTER,
      mediaId: 'vip_intro_v1',
    },
  ],
};

const original = draftFromTranslation(translation);
const clone = (): LocaleDraft => ({ ...original, hero: original.hero.map((r) => ({ ...r })) });

test('draftFromTranslation orders the hero by sortOrder and keys rows stably', () => {
  const reversed = draftFromTranslation({
    ...translation,
    heroMedia: [...translation.heroMedia].reverse(),
  });

  expect(reversed.hero.map((r) => r.mediaId)).toEqual(['vip_hero_v1', 'vip_intro_v1']);
  // Re-deriving from a refetch must produce identical keys, or every re-render
  // would remount the rows (and any in-flight upload with them).
  expect(reversed.hero.map((r) => r.key)).toEqual(original.hero.map((r) => r.key));
});

test('an untouched locale is not dirty, reports no errors, and produces no patch row', () => {
  const draft = clone();
  expect(isLocaleDirty(draft, original)).toBe(false);
  expect(localeHasErrors(validateLocale(draft, original, MANY))).toBe(false);
  expect(diffLocale('hi', draft, original)).toBeNull();
});

test('only the changed copy field reaches the wire — the hero list is not resent', () => {
  const draft = { ...clone(), title: 'New title' };

  expect(isLocaleDirty(draft, original)).toBe(true);
  expect(diffLocale('hi', draft, original)).toEqual({ locale: 'hi', title: 'New title' });
});

test('copy is trimmed, and an emptied required field is caught locally', () => {
  expect(diffLocale('hi', { ...clone(), payNowCta: '  Pay now  ' }, original)).toEqual({
    locale: 'hi',
    payNowCta: 'Pay now',
  });

  const errors = validateLocale({ ...clone(), title: '   ' }, original, MANY);
  expect(errors.fields.title).toMatch(/required/i);
  expect(localeHasErrors(errors)).toBe(true);
});

test('copy longer than the server cap is caught locally', () => {
  const errors = validateLocale({ ...clone(), payNowCta: 'x'.repeat(61) }, original, MANY);
  expect(errors.fields.payNowCta).toMatch(/60 characters/);
});

test('a reorder ships the WHOLE list, renumbered — the server treats it as a replace-set', () => {
  const draft = clone();
  draft.hero.reverse();

  expect(isLocaleDirty(draft, original)).toBe(true);
  expect(diffLocale('hi', draft, original)).toEqual({
    locale: 'hi',
    heroMedia: [
      {
        sortOrder: 0,
        mediaType: 'video',
        url: SEEDED_VIDEO,
        thumbnailUrl: SEEDED_POSTER,
        mediaId: 'vip_intro_v1',
      },
      {
        sortOrder: 1,
        mediaType: 'image',
        url: SEEDED_IMAGE,
        thumbnailUrl: null,
        mediaId: 'vip_hero_v1',
      },
    ],
  });
});

test('removing a row renumbers the survivors from zero', () => {
  const draft = clone();
  draft.hero = draft.hero.slice(1);

  expect(diffLocale('hi', draft, original)).toEqual({
    locale: 'hi',
    heroMedia: [
      {
        sortOrder: 0,
        mediaType: 'video',
        url: SEEDED_VIDEO,
        thumbnailUrl: SEEDED_POSTER,
        mediaId: 'vip_intro_v1',
      },
    ],
  });
});

test('clearing the hero is expressible — an empty list is a real value, not "untouched"', () => {
  const draft = { ...clone(), hero: [] };
  expect(diffLocale('hi', draft, original)).toEqual({ locale: 'hi', heroMedia: [] });
});

test('a new row with no uploaded asset cannot be saved', () => {
  const row = newHeroDraft();
  const draft = { ...clone(), hero: [...clone().hero, { ...row, mediaId: 'vip_hero_v2' }] };

  expect(validateLocale(draft, original, MANY).hero[row.key]?.url).toMatch(/upload/i);
});

test('a malformed media id is caught locally', () => {
  const row = { ...newHeroDraft(), url: UPLOADED, mediaId: 'VIP Intro v2!' };
  const draft = { ...clone(), hero: [...clone().hero, row] };

  expect(validateLocale(draft, original, MANY).hero[row.key]?.mediaId).toBeTruthy();
});

test('a new row is valid once it has an asset and a well-formed media id', () => {
  const row = { ...newHeroDraft(), url: UPLOADED, mediaId: 'vip_hero_v2' };
  const draft = { ...clone(), hero: [...clone().hero, row] };

  expect(localeHasErrors(validateLocale(draft, original, MANY))).toBe(false);
  expect(diffLocale('hi', draft, original)?.heroMedia).toHaveLength(3);
});

test('replacing a stored asset while keeping its media id is rejected before the request', () => {
  const draft = clone();
  const first = draft.hero[0];
  if (!first) throw new Error('fixture');
  first.url = UPLOADED;

  expect(validateLocale(draft, original, MANY).hero[first.key]?.mediaId).toMatch(/new media ID/i);
});

test('replacing a stored asset with a new media id is valid', () => {
  const draft = clone();
  const first = draft.hero[0];
  if (!first) throw new Error('fixture');
  first.url = UPLOADED;
  first.mediaId = 'vip_hero_v2';

  expect(localeHasErrors(validateLocale(draft, original, MANY))).toBe(false);
});

test('a poster swap alone needs no media id change', () => {
  const draft = clone();
  const first = draft.hero[0];
  if (!first) throw new Error('fixture');
  first.thumbnailUrl = 'https://cdn.example.com/paywall/paywall-hero-media/poster.jpg';

  expect(localeHasErrors(validateLocale(draft, original, MANY))).toBe(false);
  expect(diffLocale('hi', draft, original)?.heroMedia?.[0]?.thumbnailUrl).toBe(
    'https://cdn.example.com/paywall/paywall-hero-media/poster.jpg',
  );
});

test('only the carousel takes more than one hero', () => {
  expect(heroLimit('carousel')).toBe(10);
  expect(heroLimit('card_hero')).toBe(1);
  expect(heroLimit('video_bleed')).toBe(1);
  expect(heroLimit('icon_grid')).toBe(1);
  // An unknown (newer) layout is treated as single-hero — the safe direction:
  // the server rejects >1 for anything that is not the carousel.
  expect(heroLimit('whatever_v9')).toBe(1);
});

test('a locale nobody touched still goes red when the layout stops taking multiples', () => {
  // The stored, unedited two-item list under `card_hero`: the server would take
  // this PATCH (its hero diff is empty), and the app would silently draw one of
  // the two. Caught here, before Save.
  const draft = clone();
  expect(isLocaleDirty(draft, original)).toBe(false);

  const errors = validateLocale(draft, original, heroLimit('card_hero'));
  expect(errors.heroCount).toMatch(/only the carousel/i);
  expect(localeHasErrors(errors)).toBe(true);

  // …and trimming to one clears it.
  const trimmed = { ...clone(), hero: clone().hero.slice(0, 1) };
  expect(localeHasErrors(validateLocale(trimmed, original, heroLimit('card_hero')))).toBe(false);
});

test('minAppVersion mirrors the server: strict major.minor.patch, 0.0.0 = no gate', () => {
  expect(appVersionSchema.safeParse('1.1.0').success).toBe(true);
  expect(appVersionSchema.safeParse('0.0.0').success).toBe(true);
  expect(appVersionSchema.safeParse('10.20.30').success).toBe(true);
  // Every one of these is denied by `meetsMinVersion`, so it would send EVERY
  // user of this paywall to the default with nothing saying why.
  expect(appVersionSchema.safeParse('1.1').success).toBe(false);
  expect(appVersionSchema.safeParse('v1.1.0').success).toBe(false);
  expect(appVersionSchema.safeParse('1.1.0-beta').success).toBe(false);
  expect(appVersionSchema.safeParse('').success).toBe(false);
});

test('versions compare numerically — 1.0.99 is older than 1.1.0, not newer', () => {
  expect(compareAppVersions('1.0.99', '1.1.0')).toBe(-1);
  expect(compareAppVersions('1.1.0', '1.0.99')).toBe(1);
  expect(compareAppVersions('1.1.0', '1.1.0')).toBe(0);
  expect(compareAppVersions('2.0.0', '10.0.0')).toBe(-1);
  expect(compareAppVersions('1.1.0', 'nonsense')).toBeNull();
});

test('a read-side locale is narrowed before it is written', () => {
  expect(toPatchLocale('hi')).toBe('hi');
  expect(toPatchLocale('xx')).toBeNull();
});
