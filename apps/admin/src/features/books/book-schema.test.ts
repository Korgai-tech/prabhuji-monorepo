import { expect, test } from 'vitest';

import { ChapterFormSchema, ContentFormSchema, type ContentFormValues } from './book-schema';

/**
 * Smoke tests for the load-bearing invariants of TAM-103's client Zod mirrors:
 * the `contentType` discrimination and the "never mangle scripture" rule. The
 * server is authoritative; these only guard the fast-feedback layer.
 */

const base: ContentFormValues = {
  slug: 'ganesh-chalisa',
  contentType: 'major_book',
  title: 'Ganesh Chalisa',
  coverImageUrl: 'https://cdn.example.com/cover.png',
  author: '',
  languages: [],
  sortOrder: 0,
  offlineCacheEligible: true,
  isNewlyAdded: false,
  active: true,
  contentBody: '',
  category: '',
};

test('major_book does not require contentBody or category', () => {
  expect(ContentFormSchema.safeParse(base).success).toBe(true);
});

test('direct_scripture requires contentBody and category', () => {
  const missing = ContentFormSchema.safeParse({ ...base, contentType: 'direct_scripture' });
  expect(missing.success).toBe(false);

  const ok = ContentFormSchema.safeParse({
    ...base,
    contentType: 'direct_scripture',
    contentBody: 'श्री गणेश',
    category: 'Chalisa',
  });
  expect(ok.success).toBe(true);
});

test('scripture whitespace is preserved — the schema never trims contentBody', () => {
  const body = '  श्री गणेश \n\n  जय हो  ';
  const parsed = ContentFormSchema.safeParse({
    ...base,
    contentType: 'direct_scripture',
    contentBody: body,
    category: 'Aarti',
  });
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data.contentBody).toBe(body);
});

test('chapter audioUrl is optional (empty passes) but a partial value is rejected', () => {
  const noAudio = ChapterFormSchema.safeParse({
    slug: 'ch-1',
    title: 'Chapter 1',
    order: 0,
    bodyText: 'text',
    audioUrl: '',
  });
  expect(noAudio.success).toBe(true);

  const badAudio = ChapterFormSchema.safeParse({
    slug: 'ch-1',
    title: 'Chapter 1',
    order: 0,
    bodyText: 'text',
    audioUrl: 'not-a-url',
  });
  expect(badAudio.success).toBe(false);
});
