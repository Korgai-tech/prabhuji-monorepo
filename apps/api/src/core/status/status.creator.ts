import { loadEnv } from "@api/shared/config";
import type { StatusCreator } from "@api/core/status/types";

/**
 * TAM-N — the house creator account.
 *
 * Every status is CMS-authored deity content with no real author, but the app
 * must attribute each one to a reportable account (app-store UGC-reporting
 * compliance). Rather than add a `created_by_user_id` column to `status_items`
 * for content that genuinely has no author, one house account stands in as the
 * creator of every status.
 *
 * The uuid is PINNED, not generated: the same literal appears in the data
 * migration `20260928080000_tam_n_seed_house_creator` that actually inserts the
 * row, so stage and prod carry the same id and `reports.reported_user_id` always
 * resolves. `__tests__/status.creator.test.ts` asserts the two agree — if they
 * drift, the first report filed writes a dangling reference and nobody notices
 * until someone tries to read the table.
 *
 * WHEN REAL USER-GENERATED STATUS ARRIVES: `StatusCard.creator` is already on
 * the wire, so only the RESOLUTION changes here — from this constant to a
 * per-row lookup (batched like `resolveDeityNames`, never N+1). No client change.
 */

/** Pinned uuid v7. MUST equal the literal in the seed-house-creator migration. */
export const HOUSE_CREATOR_ID = "019f8c40-0000-7000-8000-000000000001";

/** Display name shown on the credit chip. MUST equal `User.name` in that migration. */
export const HOUSE_CREATOR_NAME = "Amit";

/**
 * Object key of the creator's avatar, relative to `MEDIA_PUBLIC_BASE_URL`.
 *
 * `null` ships a null `avatarUrl` and the app falls back to its generic person
 * glyph. That is deliberate while the real asset does not exist: pointing at a
 * key that 404s would give every card a broken-image slot instead.
 *
 * To fill in later: upload through the existing admin presign flow, then set
 * this to the returned object key. Nothing else changes — no migration, no
 * schema change, no client change.
 */
export const HOUSE_CREATOR_AVATAR_KEY: string | null = null;

/**
 * Absolute avatar URL, or null.
 *
 * The HOST comes from `MEDIA_PUBLIC_BASE_URL` and is read per call, never baked
 * in — the same rule `chat.constants.ts` follows, so an environment that moves
 * its CDN does not strand this asset.
 */
export function houseCreatorAvatarUrl(): string | null {
  if (HOUSE_CREATOR_AVATAR_KEY === null) return null;
  const base = loadEnv().MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, "");
  return `${base}/${HOUSE_CREATOR_AVATAR_KEY.replace(/^\/+/, "")}`;
}

/** Memoized so the shape is built ONCE per process — see [houseCreator]. */
let cached: StatusCreator | null = null;

/**
 * The creator attached to every status card.
 *
 * Resolved ONCE per process, not once per card. `toCard` runs per row over a
 * whole feed page, and the previous version rebuilt this object — and, the day
 * an avatar key is configured, re-read the environment — on every single one.
 * Nothing here can change at runtime (two module constants plus an env var read
 * at boot), so the object is built on first use and shared thereafter.
 *
 * Safe to share: `StatusCreator` is treated as immutable by every caller, and it
 * is serialized straight onto the wire rather than mutated.
 */
export function houseCreator(): StatusCreator {
  return (cached ??= {
    id: HOUSE_CREATOR_ID,
    name: HOUSE_CREATOR_NAME,
    avatarUrl: houseCreatorAvatarUrl(),
  });
}

/**
 * Drop the memo. Tests only — a suite that changes `MEDIA_PUBLIC_BASE_URL`
 * between cases must call this alongside `resetEnvCache()`, or it reads the
 * value the first case happened to cache.
 */
export function resetHouseCreatorCache(): void {
  cached = null;
}
