/**
 * Query-key convention for the admin panel (ADR D3).
 *
 * EVERY admin query key is `['admin', '<entity>', ...]` so that invalidating a
 * whole entity — every page, every sort, every filter — is one prefix:
 *
 * ```ts
 * qc.invalidateQueries({ queryKey: adminKeys.entity('deities') });
 * ```
 *
 * TanStack Query matches keys by prefix, so `['admin','deities']` matches
 * `['admin','deities','list',{page:3}]` and `['admin','deities','detail','x']`.
 *
 * Do not hand-write key arrays in feature hooks — go through `adminKeys`, so
 * a typo cannot silently produce a key nothing ever invalidates.
 */
export const adminKeys = {
  /** Everything admin. `qc.invalidateQueries({ queryKey: adminKeys.all })`. */
  all: ['admin'] as const,

  /** The `<AdminRoute>` whoami query (`GET /admin/session`). */
  session: () => ['admin', 'session'] as const,

  /** Every query for one entity — the invalidation prefix for its mutations. */
  entity: (entity: string) => ['admin', entity] as const,

  /** One list view of an entity, keyed by its pagination/sort/filter params. */
  list: (entity: string, params?: unknown) =>
    params === undefined
      ? (['admin', entity, 'list'] as const)
      : (['admin', entity, 'list', params] as const),

  /** One row of an entity. */
  detail: (entity: string, id: string) =>
    ['admin', entity, 'detail', id] as const,
};
