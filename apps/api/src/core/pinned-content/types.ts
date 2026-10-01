/**
 * Pinned-content module public types (TAM-173).
 *
 * A pin is a **pure per-request overlay** on the twice-daily rotation. This
 * module owns the CRUD surface at `/admin/pinned-content/*`, the append-log
 * audit table, and the read-side `getActivePinnedIds` facade the Home / Status
 * feed services call on every request. See `specs/TAM-173-pinned-content-cms.md`
 * for the load-bearing decisions (rotation cache untouched, no public wire
 * change, deity check via the facade not the repo).
 */

/**
 * The three launch surfaces. Values match the Postgres enum
 * (`pin_surface`) and the string tokens the feed services pass to
 * `getActivePinnedIds`. The enum, and this tuple, are the single vocabulary
 * for cross-module and wire calls — no free strings.
 */
export const PIN_SURFACES = ["home", "status_all_gods", "status_deity"] as const;
export type PinSurface = (typeof PIN_SURFACES)[number];

/** Append-log actions — one row per mutating write. */
export const PIN_AUDIT_ACTIONS = ["create", "update", "delete", "restore"] as const;
export type PinAuditAction = (typeof PIN_AUDIT_ACTIONS)[number];

/**
 * Wire-facing pin row, as returned from the admin CRUD routes. Wire shape
 * matches the Zod response schema; timestamps are already `.toISOString()`d
 * so the service stays Prisma-free.
 */
export interface PinnedContentView {
  id: string;
  surface: PinSurface;
  deitySlug: string | null;
  contentId: string;
  pinPosition: number;
  startAt: string;
  endAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  deletedAt: string | null;
}

/**
 * One audit-log entry as returned from `GET /admin/pinned-content/:id/audit`.
 * `snapshot` and `diff` are opaque JSON blobs — the admin renders them as
 * a `<pre>` or a keyed diff; validating them at the boundary would freeze the
 * shape the moment a new field is added.
 */
export interface PinnedContentAuditView {
  id: string;
  pinnedContentId: string;
  action: PinAuditAction;
  actorUserId: string;
  snapshot: unknown;
  diff: unknown;
  createdAt: string;
}

/** A page of pins + the unpaginated total (admin offset pagination, ADR §C2). */
export interface PinnedContentPage {
  items: PinnedContentView[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Admin list-filter shape. `active` narrows to one of three temporal buckets
 * — the CMS UI's Status column. `any` (the default) returns every non-deleted
 * pin.
 */
export type PinnedContentActiveFilter = "any" | "active" | "scheduled" | "expired";

/** Cross-module read payload — the shape `IPinnedContentApi.getActivePinnedIds` returns. */
export interface ActivePinnedId {
  /** The pin row id. Admins use this to open the pin's audit trail. */
  id: string;
  /** The `home_feed` / `status_items` id the pin points at. */
  contentId: string;
  /** Order within the pin block. `1` = topmost. */
  pinPosition: number;
}
