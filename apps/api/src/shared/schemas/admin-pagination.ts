import { z } from "zod";

/**
 * Shared ADMIN listing helpers (TAM-82 AC (g); ADR §C2).
 *
 * **This is a considered divergence from `shared/schemas/pagination.ts`, not an
 * oversight.** The public/mobile surfaces use *keyset* pagination (opaque
 * cursor + limit) because content feeds are append-mostly and infinite-scroll
 * needs a stable contract. Admin is the opposite problem: an editor needs
 * "page 7 of 23" and a total row count, and jumps around — neither of which
 * keyset pagination can do. Admin list volumes are thousands of rows, not
 * millions, so offset's cost is irrelevant.
 *
 * Module admin tickets (TAM-88…104) compose these; they do not hand-roll page
 * params or a page envelope.
 */

export const ADMIN_DEFAULT_PAGE_SIZE = 25;
export const ADMIN_MAX_PAGE_SIZE = 100;

/**
 * `{ page?: number, pageSize?: number }` — `page` defaults to 1, `pageSize` to
 * 25 and is **clamped to a max of 100 at the Zod boundary** (a request for
 * 100_000 is a 400, never a table scan). `z.coerce` because querystring values
 * arrive as strings.
 *
 * Kept as a plain (un-`.meta`-tagged) object for the same reason
 * `paginationQuery` is: `@fastify/swagger`'s emitter can't resolve named
 * component refs for querystring parameters, so routes merge this into their
 * own query object with `.extend(...)`.
 */
export const adminPaginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(ADMIN_MAX_PAGE_SIZE)
    .default(ADMIN_DEFAULT_PAGE_SIZE),
});

export type AdminPaginationQuery = z.infer<typeof adminPaginationQuery>;

/**
 * Sort params for an admin list, factory-built per entity.
 *
 * `sort` is a **Zod enum over an explicit per-entity allowlist — never a free
 * string.** This is load-bearing: a free string reaches Prisma's `orderBy` and
 * becomes an ordering-by-arbitrary-column enumeration surface (e.g. sort by
 * `passwordHash` to binary-search hashes). The allowlist should be the
 * entity's already-indexed columns plus `createdAt`/`updatedAt`.
 *
 * `order` defaults to `asc`, mirroring `paginationQuery.limit`'s
 * default-at-the-boundary style, so services never see `undefined`.
 *
 *     const query = adminPaginationQuery.extend(
 *       sortQuery(["title", "sortOrder", "createdAt"]).shape
 *     );
 */
export function sortQuery<const F extends readonly [string, ...string[]]>(allowedFields: F) {
  return z.object({
    sort: z.enum(allowedFields).optional(),
    order: z.enum(["asc", "desc"]).default("asc"),
  });
}

/**
 * Response envelope for a page of `T`: the standard success envelope whose
 * `data` is `{ items, total, page, pageSize }`. `total` is the unpaginated row
 * count (a second `COUNT` query in the same repository method — accepted; it is
 * what makes "page 7 of 23" renderable).
 *
 * Pass a `.meta({ id })`-tagged item schema so the generated clients get a
 * named component for the item type.
 */
export function adminPagedEnvelope<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      items: z.array(item),
      total: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
    }),
  });
}
