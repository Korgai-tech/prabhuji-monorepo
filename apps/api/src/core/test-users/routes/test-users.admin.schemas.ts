import { z } from "zod";
import { adminPaginationQuery } from "@api/shared/schemas";

/**
 * Zod schemas for `POST /admin/test-users` (TAM-187). Tagged `admin` by
 * `registerAdminRoute`, so none of this reaches `openapi.public.json` or the
 * mobile Dart codegen.
 *
 * The phone fields mirror `core/otp/routes/otp.schemas.ts` exactly — the row is
 * looked up at login by the same compound key, so a looser rule here would
 * create an account the OTP route can never reach.
 */
export const AdminCreateTestUserBody = z
  .object({
    phoneCountryCode: z.literal("+91", {
      message: "Only +91 country code is supported",
    }),
    phoneNumber: z.string().regex(/^[6-9]\d{9}$/, {
      message: "phoneNumber must be a 10-digit Indian mobile starting 6-9",
    }),
    premium: z.boolean(),
    // The abtesting service's bucket space is [0, 1000) (`TOTAL_BUCKETS`).
    bucket: z.number().int().min(0).max(999).nullable().optional(),
    note: z.string().max(200).optional(),
  })
  .meta({ id: "AdminCreateTestUserBody" });

export type AdminCreateTestUserInput = z.infer<typeof AdminCreateTestUserBody>;

const AdminTestUserView = z
  .object({
    userId: z.string(),
    phoneCountryCode: z.string(),
    phoneNumber: z.string(),
    created: z.boolean(),
    premium: z.boolean(),
    bucket: z.object({
      requested: z.number().int().nullable(),
      assigned: z.boolean(),
      error: z.string().nullable(),
    }),
  })
  .meta({ id: "AdminTestUserView" });

export const AdminTestUserResponse = z
  .object({ success: z.literal(true), message: z.string(), data: AdminTestUserView })
  .meta({ id: "AdminTestUserResponse" });

/**
 * `GET /admin/test-users` querystring. Inline / un-`.meta`-tagged for the same
 * reason `AdminUserListQuery` is (swagger cannot resolve named querystring refs).
 * `q` matches part of the national number.
 */
export const AdminTestUserListQuery = adminPaginationQuery.extend({
  q: z.string().trim().regex(/^\d{1,10}$/, "q must be 1-10 digits").optional(),
});
export type AdminTestUserListQueryInput = z.infer<typeof AdminTestUserListQuery>;

const AdminTestUserListItem = z
  .object({
    userId: z.string(),
    phoneCountryCode: z.string().nullable(),
    phoneNumber: z.string().nullable(),
    premium: z.boolean(),
    subscriptionStatus: z.string(),
    complimentary: z.boolean(),
    bucket: z.number().int().nullable(),
    firstLoginAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  })
  .meta({ id: "AdminTestUserListItem" });

export const AdminTestUserListResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      items: z.array(AdminTestUserListItem),
      total: z.number().int(),
      page: z.number().int(),
      pageSize: z.number().int(),
    }),
  })
  .meta({ id: "AdminTestUserListResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "AdminTestUserErrorEnvelope" });
