import { z } from "zod";

/**
 * Shared listing / pagination Zod helpers (TAM-57 AC (d)).
 *
 * Repo-wide convention: **cursor-based pagination** (opaque `cursor` + `limit`)
 * for every module list endpoint. Content feeds (Home, Newly Added, Most
 * Played) are append-mostly and shift as the CMS adds rows; cursor pagination
 * avoids the "row skipped/duplicated on page 2" problem offset pagination has
 * and gives mobile infinite-scroll a stable contract (#PATH_DECISION).
 *
 * Every module list route composes `paginationQuery` (request) +
 * `pagedEnvelope<T>` (response) so all list endpoints serialize identically and
 * generate uniform client/Dart types. The opaque cursor is encoded/decoded by
 * `shared/pagination/cursor.ts` — modules never hand-roll it.
 */

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;

/**
 * `{ cursor?: string, limit?: number }` — `limit` defaults to 20 and is clamped
 * to a max of 50 at the Zod boundary. `z.coerce` because querystring values
 * arrive as strings. Kept as a plain (un-`.meta`-tagged) object: `@fastify/
 * swagger`'s emitter can't resolve named component refs for querystring
 * parameters (same reason `PaywallConfigQuery` is inlined), so modules merge
 * this into their own query object via `.extend(...)`.
 */
export const paginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_PAGE_LIMIT)
    .default(DEFAULT_PAGE_LIMIT),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;

/**
 * Response envelope factory for a page of `T`: the standard success envelope
 * whose `data` is `{ items: T[], nextCursor: string | null }`. `nextCursor`
 * is `null` on the last (or empty) page. Pass a `.meta({ id })`-tagged item
 * schema so the generated clients get a named component for the item type.
 */
export function pagedEnvelope<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      items: z.array(item),
      nextCursor: z.string().nullable(),
    }),
  });
}
