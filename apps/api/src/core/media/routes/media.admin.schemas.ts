import { z } from "zod";
import { mediaUrl } from "@api/shared/schemas";
import { isFinalMediaKey, lookupAllowlist } from "@api/core/media/media.allowlist.js";

/**
 * Zod schemas for `POST /admin/media/presign` (TAM-84). Single source of truth
 * for the (admin-only) OpenAPI contract and the generated admin TS client.
 *
 * The `(module, entity, field)` triple is validated against the allowlist
 * registry at the boundary (a refinement, NOT a free string — #PLAN_UNCERTAINTY:
 * the vocabulary is frozen in `media.allowlist.ts`), so an unknown triple fails
 * closed with a 400 VALIDATION_ERROR before it reaches the controller. The
 * per-field content-type and per-class size cap are enforced in `MediaService`
 * (they depend on the resolved triple), keeping the registry the one authority.
 */
export const PresignBody = z
  .object({
    module: z.string().min(1),
    entity: z.string().min(1),
    field: z.string().min(1),
    /** The client's original filename — echoed for UX; influences NOTHING in the key. */
    filename: z.string().min(1),
    contentType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
  })
  .superRefine((body, ctx) => {
    if (!lookupAllowlist(body.module, body.entity, body.field)) {
      ctx.addIssue({
        code: "custom",
        path: ["field"],
        message: `unknown media target ${body.module}.${body.entity}.${body.field}`,
      });
    }
  });

export type PresignBodyInput = z.infer<typeof PresignBody>;

export const PresignData = z
  .object({
    /** The presigned S3 PUT URL (signed Content-Type/Length/Cache-Control). */
    uploadUrl: z.url(),
    /** The durable public (CDN) GET URL, built from MEDIA_PUBLIC_BASE_URL. */
    publicUrl: mediaUrl,
    key: z.string(),
    expiresAt: z.iso.datetime(),
    /**
     * The exact headers the client must put on the PUT. Every one is SIGNED, so
     * omitting any is an S3 403 `SignatureDoesNotMatch` — send them verbatim and
     * do not reconstruct them client-side (a client that guessed the set sent
     * only Content-Type and 403'd every upload against real S3).
     */
    headers: z.record(z.string(), z.string()),
    /**
     * TAM-267. `true` → `uploadUrl` signs a staging key the media optimizer
     * compresses into `key`; poll `GET /admin/media/status?key=<key>` until
     * `ready` before saving `publicUrl` (saving earlier is a 400). `false` →
     * the object exists at `key` as soon as the PUT succeeds.
     */
    processing: z.boolean(),
  })
  .meta({ id: "MediaPresignData" });

/**
 * `GET /admin/media/status` (TAM-267). `key` is the FINAL key presign returned —
 * `<module>/<entity>/<uuid>.<ext>`, never the `incoming/` staging key. A
 * malformed key fails closed with 400 VALIDATION_ERROR at the boundary.
 */
export const MediaStatusQuery = z.object({
  key: z
    .string()
    .min(1)
    .max(512)
    .refine(isFinalMediaKey, {
      message: "must be a final media object key (<module>/<entity>/<uuid>.<ext>)",
    }),
});

export type MediaStatusQueryInput = z.infer<typeof MediaStatusQuery>;

export const MediaStatusData = z
  .object({
    /** The final object exists — `publicUrl` is now safe to save. */
    ready: z.boolean(),
  })
  .meta({ id: "MediaStatusData" });

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data,
  });
}

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "MediaErrorEnvelope" });
