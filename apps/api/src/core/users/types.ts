import type { LanguageCode } from "@api/shared/language.schema";

/**
 * Public projection of a `User` — the ONLY shape ever returned to a client.
 *
 * PII / secret hygiene:
 *   - `email` NEVER included (null on a phone account; private on an admin one).
 *   - `passwordHash` NEVER included (obvious).
 *   - `phoneNumber` IS included — the app has no other identity fact about its
 *     own user, and it needs to show which number payment notifications reach.
 *
 * Fields marked `null` when the corresponding column is unset in the DB —
 * unset in the onboarding funnel until the profile-save step (TAM-44) fills
 * them in.
 */
export interface UserPublic {
  id: string;
  name: string | null;
  selectedLanguage: LanguageCode | null;
  /**
   * ISO-8601 datetime string (the wire format) — the service converts the
   * Prisma `Date` to `.toISOString()` at the boundary so the response
   * serializer's `z.string().datetime()` check succeeds and downstream
   * clients (mobile / admin) get a stable string.
   */
  onboardingCompletedAt: string | null;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
}

/**
 * Patch payload accepted by `updateMe` on the users service. Both fields are
 * optional; at least one must be present (validated at the Zod boundary in
 * `routes/users.schemas.ts`).
 *
 * The server explicitly does NOT accept `onboardingCompletedAt` from the
 * client — it derives that value from the resulting user's fields.
 */
export interface UpdateMeInput {
  name?: string;
  selectedLanguage?: LanguageCode;
}

/**
 * TAM-175 — a user's mirrored deity preference, as the feed reads it.
 *
 * Every field is nullable and `null` means "unknown", never "none of them":
 * a null `primaryDeitySlug` makes the main pool empty, which falls through to
 * the "any god" pool and reproduces the pre-personalisation feed exactly.
 */
export interface DeityPreference {
  /** Warehouse `first_preferred_shared_deity_id` — the MAIN pool. */
  primaryDeitySlug: string | null;
  /** Warehouse `second_preferred_shared_deity_id` — the SECOND pool. */
  secondaryDeitySlug: string | null;
  /** Warehouse `ad_god_name` (a slug). Mirrored but not read by the feed yet. */
  adDeitySlug: string | null;
  /** Warehouse `preferred_shared_deity_source`, verbatim. */
  source: string | null;
}

/** One warehouse row on its way into the mirror — `DeityPreference` + its key and stamp. */
export interface DeityPreferenceSyncRow extends DeityPreference {
  userId: string;
  /** The source row's `updated_at`; becomes the sync watermark. */
  warehouseUpdatedAt: Date;
}

/**
 * Why the user got the module they got — the `landing_source` analytics
 * dimension.
 *
 * `bucket_assigned` is the one the original ticket had no value for: a user sent
 * to Status purely by bucket is not `utm_matched` (no ad was involved) and is
 * emphatically not `not_in_experiment`.
 *
 * `utm_missing` (no first touch at all) and `utm_unmatched` (a touch carrying no
 * code we know) stay separate because they mean different things to whoever
 * reads the funnel: the first is organic traffic landing in the arm, the second
 * is an ad-group naming mistake.
 */
export type LandingSource =
  | "utm_matched"
  | "utm_missing"
  | "utm_unmatched"
  | "bucket_assigned"
  | "not_in_experiment";

/**
 * Everything about the user the landing ladder reads. One row, three columns.
 *
 * Lives here rather than beside the resolver so the repository can name its
 * return type without importing from `services/` — which `arch-boundaries.json`
 * forbids, and rightly: a repository that knows about a service is a repository
 * that will eventually call one.
 */
export interface LandingUserRow {
  /** The first successful OTP verify — the moment `registration_successful` fires. */
  phoneVerifiedAt: Date | null;
  /** `adgroup_name` of the first captured touch, verbatim. */
  firstUtmGroup: string | null;
  /** When the one-time ad landing was served, if ever. */
  adLandingConsumedAt: Date | null;
}

/**
 * TAM-258 — where the app should land this user on open, resolved server-side
 * and published on `GET /users/me`.
 *
 * The client OBEYS this; it holds no bucket, reads no UTM and keeps no one-shot
 * state. That is what lets the codes, the ranges and the arms change without an
 * app release.
 *
 * `utmCode` is reported even when `module` is `home` — "we read STS and still
 * sent them Home" and "there was nothing to read" are different facts, and the
 * funnel needs to tell them apart.
 */
export interface LandingConfig {
  /**
   * WHERE to open, as an app deep link (`prabhuji://status`,
   * `prabhuji://ringtone/<id>`), or `""` for the default Home landing.
   *
   * A deep link rather than a destination enum so a new landing page is a
   * server change: the app already parses this scheme, and already knows to put
   * Home underneath an externally-arriving navigation. A slug this build's
   * parser does not know lands on Home — the client treats the string as a hint
   * it may refuse, never as an order it must obey.
   */
  deeplink: string;
  /**
   * The analytics label — the deep link's slug, or `home`. DERIVED from
   * `deeplink` so the two cannot disagree, and not narrowed to a closed set: a
   * console that starts sending `prabhuji://wallpaper/123` should read as
   * `wallpaper` in the funnel.
   */
  module: string;
  source: LandingSource;
  /** The code read from the user's first ad group, or `""` when there was none. */
  utmCode: string;
}
