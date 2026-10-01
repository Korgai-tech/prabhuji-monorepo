import type { UserRole } from "@api/shared/schemas";
import type { DeityPreference, UserPublic } from "@api/core/users/types";

/**
 * Public facade for the users module.
 *
 * Other modules (e.g. TAM-45 paywall wanting to key config on
 * `selectedLanguage`, TAM-47 subscription checks needing profile state)
 * consume users via `performServiceCall("users", …)`. They never import
 * `core/users/*` directly — the facade + `GlobalServiceMap` key are the
 * only cross-module surface.
 */
export interface IUsersApi {
  /**
   * Look up a user by id and return the public projection (nullable when
   * the user doesn't exist). Callers should treat `null` as "unknown user"
   * without leaking whether the ID was ever valid — DO NOT branch on it
   * beyond routing decisions.
   */
  getUserPublic(userId: string): Promise<UserPublic | null>;

  /**
   * Resolve a user's authorization role (TAM-82). **Read-only** — this is
   * deliberately the entire authorization surface of this facade. It does NOT
   * widen the users module's write surface: there is no `setRole` here and
   * there must never be one. `role` is promoted only by a direct DB write or
   * the boot-time bootstrap-admin path, never from a request.
   *
   * Consumed by `adminMiddleware` on every `/admin/*` request via
   * `performServiceCall("users", u => u.getRole(id), …)`.
   *
   * REJECTS (does not return `null`) when the user doesn't exist, unlike
   * `getUserPublic`. That asymmetry is intentional: the only caller is a
   * fail-closed guard, and a nullable return invites a caller to write
   * `role ?? "user"` and then treat "unknown user" as a *successful* lookup.
   * A throw forces the deny branch.
   */
  getRole(userId: string): Promise<UserRole>;

  /**
   * The payer's Razorpay customer handle (`cust_xxx`), or null if they have
   * never had one.
   *
   * Exists because a Razorpay customer describes the HUMAN, not the mandate:
   * Razorpay refuses to create a second for the same contact and offers no
   * lookup-by-phone, so `core/payment` must be able to ask "do we already have
   * one for this person" before it tries. That question is about a user, so it
   * is answered here rather than by the payment module reading `"User"` — which
   * it may not do.
   *
   * Read-only pair with `rememberRazorpayCustomerId`; deliberately NOT a general
   * `updateUser` surface.
   */
  getRazorpayCustomerId(userId: string): Promise<string | null>;

  /**
   * Record the handle Razorpay minted, if this user has none yet.
   *
   * IDEMPOTENT AND NON-DESTRUCTIVE: a populated column is left alone. Replacing
   * one would strand every token hanging off the previous customer, since tokens
   * are listed by customer id and a mandate whose customer moved becomes
   * unreadable — so two concurrent registrations race harmlessly, first write
   * wins.
   */
  rememberRazorpayCustomerId(userId: string, customerId: string): Promise<void>;

  /**
   * TAM-175 — this user's mirrored deity preference, or `null` when nothing has
   * been synced for them.
   *
   * Consumed by the discovery surfaces (`core/home`, `core/status`) to pick the
   * main/second/any pools for the split feed. It lives on the users facade
   * because the preference is a property OF A USER; the feed modules must not
   * reach the `user_deity_preferences` table themselves.
   *
   * `null` IS A NORMAL ANSWER and callers must treat it as "no preference", not
   * as a failure: both pools end up empty, everything falls through to "any
   * god", and the surface serves exactly what it served before this feature.
   * That is also the shape of the degraded mode when the warehouse sync is
   * behind — stale personalisation, never a broken feed.
   *
   * A primary-key read against Postgres. It deliberately does NOT reach
   * ClickHouse: see `UserDeityPreference` in `schema.prisma` for why the source
   * of truth stays out of the request path.
   */
  getDeityPreference(userId: string): Promise<DeityPreference | null>;
}
