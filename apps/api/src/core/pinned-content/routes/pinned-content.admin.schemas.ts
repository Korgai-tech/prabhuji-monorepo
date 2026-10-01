import { z } from "zod";
import { adminPagedEnvelope, adminPaginationQuery } from "@api/shared/schemas";
import { PIN_AUDIT_ACTIONS, PIN_SURFACES } from "@api/core/pinned-content/types";

/**
 * Zod schemas for `/admin/pinned-content/*` (TAM-173). Single source of truth
 * for the emitted OpenAPI contract; every route in this file is tagged `admin`
 * by `registerAdminRoute`, so the TAM-85 filter drops all of these operations
 * from `openapi.public.json` (they must NEVER reach the mobile Dart codegen —
 * #EXPORT_CRITICAL in the spec).
 *
 * Wire shape rules that are worth spelling out here (the service also enforces
 * them, and so does the DB CHECK; the boundary is the FIRST line of defence):
 *   - `deity_slug` is required when `surface = status_deity`, forbidden otherwise;
 *   - `start_at < end_at`;
 *   - `pin_position` is a non-negative integer;
 *   - `expected_updated_at` is the optimistic-concurrency precondition on every
 *     mutating write (matches the TAM-88 exemplar).
 */

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/**
 * Deity slug shape — lowercase alphanumerics joined by single hyphens. Reuses
 * the deity module's own contract so a slug that is valid there is valid here.
 * Absent for `home` and `status_all_gods` pins; required for `status_deity`
 * (enforced at the object level via `.superRefine`).
 */
const deitySlug = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase alphanumerics separated by single hyphens, with no whitespace"
  );

export const pinSurface = z.enum(PIN_SURFACES).meta({ id: "PinSurface" });

export const pinAuditAction = z.enum(PIN_AUDIT_ACTIONS).meta({ id: "PinAuditAction" });

const startAtIso = z.string().datetime();
const endAtIso = z.string().datetime();
const pinPosition = z.number().int().nonnegative();

/** Same optimistic-concurrency precondition shape as TAM-88's exemplar. */
const expectedUpdatedAt = z.string().datetime();

// ---------------------------------------------------------------------------
// request — params
// ---------------------------------------------------------------------------

export const AdminPinIdParams = z.object({ id: z.uuid() });
export type AdminPinIdParamsInput = z.infer<typeof AdminPinIdParams>;

// ---------------------------------------------------------------------------
// request — list query
// ---------------------------------------------------------------------------

/**
 * Filters mirror the CMS Status column: `active` narrows to the temporal
 * bucket, `deity_slug` narrows to a `status_deity` cohort, `surface` is the
 * primary segment. `page`/`pageSize` come from `adminPaginationQuery`.
 */
export const AdminPinListQuery = adminPaginationQuery.extend({
  surface: pinSurface.optional(),
  deitySlug: deitySlug.optional(),
  active: z.enum(["any", "active", "scheduled", "expired"]).default("any"),
});
export type AdminPinListQueryInput = z.infer<typeof AdminPinListQuery>;

// ---------------------------------------------------------------------------
// request — write bodies
// ---------------------------------------------------------------------------

/**
 * Cross-field shape rule shared by create + patch: only `status_deity` pins
 * carry a `deity_slug`. The DB CHECK is the same rule; catching it here first
 * gives the caller a proper 400 with a stable `errorCode` instead of a 500.
 */
function refineSurfaceShape<T extends { surface?: unknown; deitySlug?: string | null }>(
  arg: T,
  ctx: z.RefinementCtx
): void {
  const surface = arg.surface as string | undefined;
  const hasDeity = arg.deitySlug !== undefined && arg.deitySlug !== null;
  if (surface === "status_deity" && !hasDeity) {
    ctx.addIssue({
      code: "custom",
      path: ["deitySlug"],
      message: "deity_slug is required when surface is status_deity",
      params: { errorCode: "deity_slug_required" },
    });
  }
  if (surface !== undefined && surface !== "status_deity" && hasDeity) {
    ctx.addIssue({
      code: "custom",
      path: ["deitySlug"],
      message: "deity_slug is only allowed when surface is status_deity",
      params: { errorCode: "deity_slug_not_allowed" },
    });
  }
}

/**
 * `POST /admin/pinned-content`. `.strict()` — a server-authoritative field on
 * the body is a **400 not a silent strip** (matches TAM-88's shape rule).
 */
export const AdminPinCreateBody = z
  .object({
    surface: pinSurface,
    deitySlug: deitySlug.optional(),
    contentId: z.uuid(),
    pinPosition,
    startAt: startAtIso,
    endAt: endAtIso,
  })
  .strict()
  .superRefine((val, ctx) => {
    refineSurfaceShape(val, ctx);
    if (new Date(val.startAt) >= new Date(val.endAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "start_at must be strictly before end_at",
        params: { errorCode: "invalid_time_window" },
      });
    }
  })
  .meta({ id: "AdminPinCreateBody" });
export type AdminPinCreateInput = z.infer<typeof AdminPinCreateBody>;

/**
 * `PATCH /admin/pinned-content/:id`. Partial update + the `updatedAt`
 * precondition. `.strict()` and NO `surface` — surface is immutable (the
 * `content_id`'s target table depends on it, so a surface swap would silently
 * repoint the pin's target row).
 */
export const AdminPinPatchBody = z
  .object({
    expectedUpdatedAt,
    // deity_slug is not editable — a slug change would repoint a status_deity
    // pin at a different deity's cohort and let a mis-tagged status leak. If
    // ops need to move a pin to a different deity, they delete + recreate.
    contentId: z.uuid().optional(),
    pinPosition: pinPosition.optional(),
    startAt: startAtIso.optional(),
    endAt: endAtIso.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    // Cross-field: start_at < end_at, but ONLY when both are supplied. A partial
    // update touching only one side is validated in the service against the
    // stored row.
    if (
      val.startAt !== undefined &&
      val.endAt !== undefined &&
      new Date(val.startAt) >= new Date(val.endAt)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "start_at must be strictly before end_at",
        params: { errorCode: "invalid_time_window" },
      });
    }
  })
  .meta({ id: "AdminPinPatchBody" });
export type AdminPinPatchInput = z.infer<typeof AdminPinPatchBody>;

/**
 * `DELETE /admin/pinned-content/:id` — SOFT delete (`deleted_at = now()`), never
 * a hard delete (the partial-unique index depends on the tombstone, and the
 * audit trail depends on the row surviving).
 */
export const AdminPinDeleteBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminPinDeleteBody" });
export type AdminPinDeleteInput = z.infer<typeof AdminPinDeleteBody>;

/** `POST /admin/pinned-content/:id/restore` — un-tombstone a soft-deleted pin. */
export const AdminPinRestoreBody = z
  .object({ expectedUpdatedAt })
  .strict()
  .meta({ id: "AdminPinRestoreBody" });
export type AdminPinRestoreInput = z.infer<typeof AdminPinRestoreBody>;

// ---------------------------------------------------------------------------
// response components
// ---------------------------------------------------------------------------

export const PinnedContentView = z
  .object({
    id: z.string(),
    surface: pinSurface,
    deitySlug: z.string().nullable(),
    contentId: z.string(),
    pinPosition: z.number().int(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string(),
    updatedBy: z.string(),
    deletedAt: z.string().datetime().nullable(),
  })
  .meta({ id: "PinnedContentView" });

export const PinnedContentAuditView = z
  .object({
    id: z.string(),
    pinnedContentId: z.string(),
    action: pinAuditAction,
    actorUserId: z.string(),
    snapshot: z.unknown(),
    diff: z.unknown().nullable(),
    createdAt: z.string().datetime(),
  })
  .meta({ id: "PinnedContentAuditView" });

// ---------------------------------------------------------------------------
// response envelopes
// ---------------------------------------------------------------------------

function adminEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

export const AdminPinListResponse = adminPagedEnvelope(PinnedContentView).meta({
  id: "AdminPinListResponse",
});
export const AdminPinDetailResponse = adminEnvelope(PinnedContentView).meta({
  id: "AdminPinDetailResponse",
});
export const AdminPinAuditResponse = adminEnvelope(z.array(PinnedContentAuditView)).meta({
  id: "AdminPinAuditResponse",
});

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "AdminPinErrorEnvelope" });
