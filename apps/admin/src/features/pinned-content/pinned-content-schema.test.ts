import { expect, test } from 'vitest';

import {
  PinnedContentFormSchema,
  addDays,
  classifyStatus,
  daysBetween,
  formatIst,
  istLocalToUtcIso,
  utcIsoToIstLocal,
  type PinnedContentFormValues,
} from './pinned-content-schema';

/**
 * The wire rules of the pinned-content form, in isolation from the modal.
 * These are the ones that bite:
 *  - `endAt > startAt` (upstream 400 `invalid_time_window`);
 *  - `deitySlug` required IFF surface = `status_deity` (upstream 400
 *    `deity_slug_required` / `deity_slug_not_allowed`);
 *  - IST wall-clock ↔ UTC ISO round-trip — a wrong offset is a 5.5-hour
 *    shift in production;
 *  - Duration-days two-way binding — start + N days → end, and editing end
 *    re-derives N.
 */

function baseValues(): PinnedContentFormValues {
  return {
    surface: 'home',
    deitySlug: '',
    contentId: '11111111-1111-1111-1111-111111111111',
    pinPosition: 1,
    startAtLocal: '2026-09-08T10:00',
    endAtLocal: '2026-09-15T10:00',
    durationDays: 7,
  };
}

test('a well-formed home pin passes validation', () => {
  const result = PinnedContentFormSchema.safeParse(baseValues());
  expect(result.success).toBe(true);
});

test('status_deity without a deitySlug fails on the deitySlug field', () => {
  const values: PinnedContentFormValues = {
    ...baseValues(),
    surface: 'status_deity',
    deitySlug: '',
  };
  const result = PinnedContentFormSchema.safeParse(values);
  expect(result.success).toBe(false);
  if (result.success) return;
  const issue = result.error.issues.find((i) => i.path[0] === 'deitySlug');
  expect(issue).toBeTruthy();
  expect(issue?.message).toMatch(/deity/i);
});

test('a non-status_deity surface with a deitySlug fails — the API rejects it as deity_slug_not_allowed', () => {
  const values: PinnedContentFormValues = {
    ...baseValues(),
    surface: 'home',
    deitySlug: 'ganesh',
  };
  const result = PinnedContentFormSchema.safeParse(values);
  expect(result.success).toBe(false);
  if (result.success) return;
  const issue = result.error.issues.find((i) => i.path[0] === 'deitySlug');
  expect(issue).toBeTruthy();
});

test('status_deity with a deitySlug passes', () => {
  const values: PinnedContentFormValues = {
    ...baseValues(),
    surface: 'status_deity',
    deitySlug: 'ganesh',
  };
  expect(PinnedContentFormSchema.safeParse(values).success).toBe(true);
});

test('endAt equal to startAt is a zero-length window and is rejected', () => {
  const values: PinnedContentFormValues = {
    ...baseValues(),
    endAtLocal: baseValues().startAtLocal,
  };
  const result = PinnedContentFormSchema.safeParse(values);
  expect(result.success).toBe(false);
  if (result.success) return;
  const issue = result.error.issues.find((i) => i.path[0] === 'endAtLocal');
  expect(issue?.message).toMatch(/after start/i);
});

test('endAt before startAt is rejected', () => {
  const values: PinnedContentFormValues = {
    ...baseValues(),
    startAtLocal: '2026-09-15T10:00',
    endAtLocal: '2026-09-08T10:00',
  };
  const result = PinnedContentFormSchema.safeParse(values);
  expect(result.success).toBe(false);
});

test('a zero position is rejected', () => {
  const values: PinnedContentFormValues = { ...baseValues(), pinPosition: 0 };
  const result = PinnedContentFormSchema.safeParse(values);
  expect(result.success).toBe(false);
  if (result.success) return;
  const issue = result.error.issues.find((i) => i.path[0] === 'pinPosition');
  expect(issue).toBeTruthy();
});

test('an empty content id is rejected', () => {
  const values: PinnedContentFormValues = { ...baseValues(), contentId: '' };
  const result = PinnedContentFormSchema.safeParse(values);
  expect(result.success).toBe(false);
});

// ── IST helpers ──────────────────────────────────────────────────────────────

test('IST-local `10:00` on Sep 8 is `04:30Z` on the wire (a +05:30 offset)', () => {
  const iso = istLocalToUtcIso('2026-09-08T10:00');
  expect(iso).toBe('2026-09-08T04:30:00.000Z');
});

test('utcIsoToIstLocal round-trips against istLocalToUtcIso', () => {
  const iso = istLocalToUtcIso('2026-09-08T10:00');
  if (iso === null) throw new Error('istLocalToUtcIso returned null');
  expect(utcIsoToIstLocal(iso)).toBe('2026-09-08T10:00');
});

test('istLocalToUtcIso rejects malformed input', () => {
  expect(istLocalToUtcIso('not a date')).toBeNull();
  expect(istLocalToUtcIso('')).toBeNull();
});

test('formatIst pretty-prints a UTC ISO in Asia/Kolkata', () => {
  const out = formatIst('2026-09-08T04:30:00.000Z');
  expect(out).toMatch(/IST$/);
  // ICU output varies but includes "Sep" and the IST hour "10" from the +05:30 shift.
  expect(out).toMatch(/Sep/);
  expect(out).toMatch(/10:00/);
});

test('formatIst returns an em-dash for empty / invalid input', () => {
  expect(formatIst(null)).toBe('—');
  expect(formatIst(undefined)).toBe('—');
  expect(formatIst('')).toBe('—');
  expect(formatIst('nope')).toBe('—');
});

// ── Duration helper ──────────────────────────────────────────────────────────

test('daysBetween returns the whole-day count between two IST-local strings', () => {
  expect(daysBetween('2026-09-08T10:00', '2026-09-15T10:00')).toBe(7);
});

test('daysBetween returns empty when the window is zero-length or backwards', () => {
  expect(daysBetween('2026-09-15T10:00', '2026-09-15T10:00')).toBe('');
  expect(daysBetween('2026-09-15T10:00', '2026-09-08T10:00')).toBe('');
});

test('addDays advances an IST-local start by N whole days, staying on the same IST wall clock', () => {
  expect(addDays('2026-09-08T10:00', 7)).toBe('2026-09-15T10:00');
});

test('addDays returns empty when the input is malformed', () => {
  expect(addDays('not a date', 3)).toBe('');
});

// ── Runtime-status classifier ───────────────────────────────────────────────

test('classifyStatus returns `active` when now is inside the window', () => {
  const row = {
    startAt: '2026-09-01T00:00:00.000Z',
    endAt: '2026-09-30T00:00:00.000Z',
    deletedAt: null,
  };
  expect(classifyStatus(row, new Date('2026-09-15T00:00:00.000Z').getTime())).toBe('active');
});

test('classifyStatus returns `scheduled` before startAt', () => {
  const row = {
    startAt: '2026-09-15T00:00:00.000Z',
    endAt: '2026-09-30T00:00:00.000Z',
    deletedAt: null,
  };
  expect(classifyStatus(row, new Date('2026-09-01T00:00:00.000Z').getTime())).toBe('scheduled');
});

test('classifyStatus returns `expired` at/after endAt', () => {
  const row = {
    startAt: '2026-08-01T00:00:00.000Z',
    endAt: '2026-08-31T00:00:00.000Z',
    deletedAt: null,
  };
  expect(classifyStatus(row, new Date('2026-09-01T00:00:00.000Z').getTime())).toBe('expired');
});

test('classifyStatus returns `deleted` when deletedAt is set, regardless of the window', () => {
  const row = {
    startAt: '2026-09-01T00:00:00.000Z',
    endAt: '2026-09-30T00:00:00.000Z',
    deletedAt: '2026-09-05T00:00:00.000Z',
  };
  expect(classifyStatus(row, new Date('2026-09-15T00:00:00.000Z').getTime())).toBe('deleted');
});
