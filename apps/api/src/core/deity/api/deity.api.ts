import type { DeitySummary, LocalizedDeity } from "@api/core/deity/types";

/**
 * Public facade for the deity module (TAM-57).
 *
 * The ONLY surface content modules (TAM-61…76) use to reach the deity taxonomy
 * — via `performServiceCall("deity", …)`, never by importing this module's
 * files. Registered into `GlobalServiceMap` from the composition root.
 *
 *   ```ts
 *   const deity = await performServiceCall(
 *     "deity",
 *     api => api.getBySlug(tag),
 *     "aarti:create",
 *     "failed to validate deity tag"
 *   );
 *   if (!deity?.active) throw new ValidationError("Unknown deity");
 *   ```
 */
export interface IDeityApi {
  /**
   * Full active taxonomy, localized to `locale` (falling back to `en`, then the
   * slug). Ordered by `(sortOrder, id)`. Modules use this to render a deity
   * filter without an HTTP hop.
   */
  getActiveDeities(params: { locale: string }): Promise<LocalizedDeity[]>;

  /**
   * Locale-independent summary for a slug, or `null` if no such deity exists.
   * The deity-tag validation hook — the caller decides whether `active: false`
   * is acceptable.
   */
  getBySlug(slug: string): Promise<DeitySummary | null>;
}
