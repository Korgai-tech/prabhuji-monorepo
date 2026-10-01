import { expect, test } from 'vitest';

import { buildFeedPrefill } from './add-to-feed';

/**
 * The prefill is the whole point of "Add to feed": every value here is one an
 * editor would otherwise retype, and a wrong one is a 400 at save time or, worse,
 * a card that silently routes nowhere. Typecheck covers the enums; these cover the
 * derivations it cannot see.
 */

const WALLPAPER = { slug: 'prb-wlp-all-static-shiva-0004-v1', title: 'Shiv Static Wallpaper 0004' };

test('derives every field an editor would otherwise retype', () => {
  const p = buildFeedPrefill('wallpaper', WALLPAPER);
  expect(p).toMatchObject({
    slug: 'feed-prb-wlp-all-static-shiva-0004-v1',
    title: 'Shiv Static Wallpaper 0004',
    contentType: 'wallpaper',
    module: 'wallpaper',
    headerDestinationModule: 'wallpaper',
    ctaLabel: 'Set Wallpaper',
    ctaDestinationValue: 'prb-wlp-all-static-shiva-0004-v1',
    shareTitle: 'Shiv Static Wallpaper 0004',
  });
});

test('the CTA routes at the ITEM, not the module index', () => {
  // `linked_module` would open the wallpaper list and lose which item the card is
  // about — the whole point of the card. The api also validates that a
  // linked_module value IS a module key, so `content_detail` is what lets the
  // destination be the content's own slug.
  const p = buildFeedPrefill('wallpaper', WALLPAPER);
  expect(p.ctaDestinationType).toBe('content_detail');
  expect(p.ctaDestinationValue).toBe(WALLPAPER.slug);
});

test('reuses the content image as the hero when given one', () => {
  // The api's reusable-media path accepts a URL minted for another field, so the
  // content's own image becomes the hero with NO duplicate upload. This is the
  // whole point of the feature the user asked for.
  const p = buildFeedPrefill('status', {
    slug: 's-1', title: 'S',
    imageUrl: 'https://cdn.example.com/status/status-item/abc.webp',
  });
  expect(p.heroImageUrl).toBe('https://cdn.example.com/status/status-item/abc.webp');
});

test('omits the hero when the content has no image to reuse', () => {
  // No image ⇒ no heroImageUrl key, so the editor picks/uploads one rather than
  // the form carrying an empty string that looks set.
  const p = buildFeedPrefill('status', { slug: 's-1', title: 'S' });
  expect(p).not.toHaveProperty('heroImageUrl');
});

test('never prefills a badge — that is an editorial claim', () => {
  const p = buildFeedPrefill('wallpaper', WALLPAPER);
  expect(p).not.toHaveProperty('badge');
  expect(p).not.toHaveProperty('trendingScore');
});

test('the card slug cannot collide with the content it came from', () => {
  // Both live in unique-slug namespaces of their own, but a `feed-` prefix keeps
  // the card readable and stops a feed card and a future content row colliding.
  const p = buildFeedPrefill('aarti', { slug: 'ram-ram-arathi', title: 'Ram Arathi' });
  expect(p.slug).toBe('feed-ram-ram-arathi');
  expect(p.slug).not.toBe('ram-ram-arathi');
});

test('slug stays within the api limit for a long content slug', () => {
  const long = 'x'.repeat(120);
  const p = buildFeedPrefill('wallpaper', { slug: long, title: 'Long' });
  expect(p.slug!.length).toBeLessThanOrEqual(96);
});

test.each([
  ['wallpaper', 'Set Wallpaper', 'wallpaper'],
  ['status', 'View Status', 'status'],
  ['aarti', 'Listen Now', 'aarti'],
  ['mantra', 'Listen Now', 'mantra'],
  ['ringtone', 'Set Ringtone', 'ringtone'],
] as const)('%s frames its own CTA + module', (module, ctaLabel, moduleKey) => {
  const p = buildFeedPrefill(module, { slug: 'c-1', title: 'C' });
  expect(p.ctaLabel).toBe(ctaLabel);
  expect(p.module).toBe(moduleKey);
  expect(p.contentType).toBe(module);
});

test('shareDeepLink is an absolute URL (the api validates it as one)', () => {
  for (const m of ['wallpaper', 'status', 'aarti', 'mantra', 'ringtone'] as const) {
    const p = buildFeedPrefill(m, { slug: 'c-1', title: 'C' });
    expect(() => new URL(p.shareDeepLink!)).not.toThrow();
    expect(p.shareDeepLink).toContain('c-1');
  }
});

test('share text is non-empty — the api requires min 1 char', () => {
  const p = buildFeedPrefill('mantra', { slug: 'm-1', title: 'Ram Chalisa' });
  expect(p.shareText!.length).toBeGreaterThan(0);
  expect(p.shareText).toContain('Ram Chalisa');
});
