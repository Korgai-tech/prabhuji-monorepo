import { z } from 'zod';

import type { paths } from '@repo/api-client';

type PinnedContentView =
  paths['/admin/pinned-content']['get']['responses'][200]['content']['application/json']['data']['items'][number];

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Pinned-content form schema — mirrors TAM-173's write bodies.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Client Zod is FAST FEEDBACK — the server's Zod at the route boundary is the
 * enforcement point (`AdminPinCreateBody` / `AdminPinPatchBody`, see the API
 * module `apps/api/src/core/pinned-content/schemas/`). Keep this file in sync
 * by hand; a disagreement means the server wins and its message surfaces.
 *
 * Two module-specific rules encoded here so the editor never gets a 400 the
 * page could have caught:
 *  1. `surface` ⇔ `deitySlug` — `deitySlug` is required IFF surface =
 *     `status_deity`. Empty on any other surface.
 *  2. `endAt > startAt` — a zero-length or backwards window is a 400 upstream.
 *
 * All wire fields carry ISO-8601 UTC datetimes (`toISOString()` output). The
 * form itself edits IST-local strings — the conversion helpers live here so
 * the page never sees a timezone shift and only ever handles UTC ISO on the
 * wire.
 */

export const PIN_SURFACES = ['home', 'status_all_gods', 'status_deity'] as const;
export type PinSurface = (typeof PIN_SURFACES)[number];

export const PIN_STATUS_FILTERS = ['any', 'active', 'scheduled', 'expired'] as const;
export type PinStatusFilter = (typeof PIN_STATUS_FILTERS)[number];

/** The four labels the list column and the audit rows both render. */
export type PinRuntimeStatus = 'active' | 'scheduled' | 'expired' | 'deleted';

export const SURFACE_OPTIONS: { label: string; value: PinSurface }[] = [
  { label: 'Home feed', value: 'home' },
  { label: 'Status — all gods', value: 'status_all_gods' },
  { label: 'Status — per deity', value: 'status_deity' },
];

export function surfaceLabel(surface: PinSurface): string {
  return SURFACE_OPTIONS.find((option) => option.value === surface)?.label ?? surface;
}

// ── The form values (what state the modal edits) ─────────────────────────────

/**
 * Editor-owned representation. `startAtLocal` / `endAtLocal` are the exact
 * strings emitted by `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`) —
 * treated as IST wall-clock. The wire body carries `startAt`/`endAt` as UTC
 * ISO once the form converts them on submit.
 */
export interface PinnedContentFormValues extends Record<string, unknown> {
  surface: PinSurface;
  deitySlug: string;
  contentId: string;
  pinPosition: number | '';
  startAtLocal: string;
  endAtLocal: string;
  /**
   * Helper only — never on the wire. When Start and Duration are set, End
   * auto-fills; if the user then edits End directly, Duration is recomputed.
   */
  durationDays: number | '';
}

const surfaceEnum = z.enum(PIN_SURFACES);

const pinPositionSchema = z
  .number({ message: 'Position is required' })
  .int('Position must be a whole number')
  .min(1, 'Position must be 1 or greater');

/** A `datetime-local` string (`YYYY-MM-DDTHH:mm`), IST wall-clock. */
const istDateTimeLocalSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/,
    'Enter a valid date and time',
  );

export const PinnedContentFormSchema = z
  .object({
    surface: surfaceEnum,
    deitySlug: z.string(),
    contentId: z.string().min(1, 'Pick a content item'),
    pinPosition: pinPositionSchema,
    startAtLocal: istDateTimeLocalSchema,
    endAtLocal: istDateTimeLocalSchema,
    durationDays: z.union([z.number().int().min(0), z.literal('')]).optional(),
  })
  .superRefine((values, ctx) => {
    // Surface ⇔ deity_slug shape rule (mirrors the server CHECK constraint).
    if (values.surface === 'status_deity') {
      if (values.deitySlug.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['deitySlug'],
          message: 'Pick a deity — required for status_deity pins',
        });
      }
    } else if (values.deitySlug.trim() !== '') {
      ctx.addIssue({
        code: 'custom',
        path: ['deitySlug'],
        message: 'Deity must be empty when the surface is not status_deity',
      });
    }

    // Time-window rule (mirrors the server `invalid_time_window` 400).
    const startMs = istLocalToUtcDate(values.startAtLocal)?.getTime();
    const endMs = istLocalToUtcDate(values.endAtLocal)?.getTime();
    if (startMs === undefined) {
      ctx.addIssue({ code: 'custom', path: ['startAtLocal'], message: 'Enter a valid date and time' });
    }
    if (endMs === undefined) {
      ctx.addIssue({ code: 'custom', path: ['endAtLocal'], message: 'Enter a valid date and time' });
    }
    if (startMs !== undefined && endMs !== undefined && endMs <= startMs) {
      ctx.addIssue({
        code: 'custom',
        path: ['endAtLocal'],
        message: 'End must be after start',
      });
    }
  });

// ── IST ↔ UTC conversion helpers ─────────────────────────────────────────────

/**
 * IST is a fixed +05:30 offset — no DST, so we can synthesise a real `Date`
 * by pinning the offset onto the local string. `datetime-local` values omit
 * seconds by default (`YYYY-MM-DDTHH:mm`), so we normalise before appending.
 */
export function istLocalToUtcIso(local: string): string | null {
  const date = istLocalToUtcDate(local);
  return date === null ? null : date.toISOString();
}

function istLocalToUtcDate(local: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(local)) return null;
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  const date = new Date(`${withSeconds}+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The inverse — takes a UTC ISO string and produces an IST-local
 * `datetime-local` value. Used to hydrate the edit form.
 */
export function utcIsoToIstLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = pad(shifted.getUTCMonth() + 1);
  const dd = pad(shifted.getUTCDate());
  const hh = pad(shifted.getUTCHours());
  const mi = pad(shifted.getUTCMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Pretty IST rendering for the list columns and the audit drawer. */
export function formatIst(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const formatted = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date);
  return `${formatted} IST`;
}

// ── Duration helper (Start + N days → End; End edit recomputes N) ────────────

/** Days between two IST-local strings, rounded to the nearest whole day. */
export function daysBetween(startLocal: string, endLocal: string): number | '' {
  const start = istLocalToUtcDate(startLocal);
  const end = istLocalToUtcDate(endLocal);
  if (start === null || end === null) return '';
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return '';
  return Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

/** Add N whole days to an IST-local string; returns the new IST-local string. */
export function addDays(startLocal: string, days: number): string {
  const start = istLocalToUtcDate(startLocal);
  if (start === null) return '';
  const next = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return utcIsoToIstLocal(next.toISOString());
}

// ── Runtime-status classifier (Active / Scheduled / Expired / Deleted) ───────

export function classifyStatus(
  row: Pick<PinnedContentView, 'startAt' | 'endAt' | 'deletedAt'>,
  nowMs: number = Date.now(),
): PinRuntimeStatus {
  if (row.deletedAt !== null) return 'deleted';
  const start = new Date(row.startAt).getTime();
  const end = new Date(row.endAt).getTime();
  if (nowMs < start) return 'scheduled';
  if (nowMs >= end) return 'expired';
  return 'active';
}
