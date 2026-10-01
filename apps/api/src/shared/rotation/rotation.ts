/**
 * Feed rotation — the whole ordering algorithm, as pure functions.
 *
 * The problem: every public listing in this API orders by `id ASC` forever (the
 * per-item `sort_order` columns were deliberately dropped), so with no new
 * uploads the app looks frozen. Freshness has to come from RE-ORDERING the
 * catalogue we already have, twice a day.
 *
 * #PATH_DECISION — no scheduler. The order is a pure function of
 * `(refresh epoch, catalogue)`, so every ECS task computes the byte-identical
 * plan on its own with no cron job, no `feed_rotation` table, and no Redis
 * coordination. A "12:00 AM / 12:00 PM IST refresh" is just the epoch number
 * ticking over; the first request after the boundary builds the new plan.
 *
 * Nothing here touches the clock or the database — `rotate` and
 * `interleaveByType` are deterministic given their inputs, which is what makes
 * the whole design safe to run on N instances and cheap to test.
 */

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/** Two refreshes a day — 00:00 and 12:00 IST. The PRODUCTION schedule. */
const DEFAULT_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * How often the rotated listings re-order, `FEED_REFRESH_INTERVAL_MS` or the
 * 12h default.
 *
 * Everything time-shaped derives from this one value: the epoch boundary, the
 * plan-cache TTL (`REFRESH_INTERVAL_MS * 2`), and the new-item boost window
 * (`NEW_BOOST_CYCLES` refreshes). A short interval shrinks the boost window
 * proportionally (4 cycles is ~2 days at 12h, 20 minutes at 5 minutes), which
 * is why this is a TESTING AID and not a tuning knob — prod leaves it unset.
 *
 * Read from `process.env` rather than `loadEnv()` on purpose. This module is
 * pure by design — `rotate` and `interleaveByType` are deterministic given
 * their inputs, and that is what makes them safe on N instances and cheap to
 * test. Importing the validated env here would drag the whole schema (database
 * URL, JWT secret, payment credentials) into a unit test that only wants to
 * sort a list. `FEED_REFRESH_INTERVAL_MS` is still declared in
 * `shared/config/env.ts`, so a bad value fails the BOOT loudly; the guard below
 * only catches the unvalidated case (a test or a one-off script), where falling
 * back to the production schedule is the right answer.
 *
 * Resolved once at module load, so the interval cannot change under a running
 * process and split a plan across two epochs mid-request.
 */
const configuredInterval = Number(process.env["FEED_REFRESH_INTERVAL_MS"]);
export const REFRESH_INTERVAL_MS =
  Number.isInteger(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : DEFAULT_REFRESH_INTERVAL_MS;

/**
 * Asia/Kolkata is a FIXED +05:30 offset with no DST, so the boundary can be a
 * constant instead of a timezone library (the analytics warehouse partitions on
 * the same zone — see `apps/events/db/schema.sql`).
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The refresh epoch a given instant falls in. */
export function refreshEpochOf(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / REFRESH_INTERVAL_MS);
}

/** The refresh epoch that is live right now. */
export function currentRefreshEpoch(now: Date = new Date()): number {
  return refreshEpochOf(now.getTime());
}

/** UTC instant at which `epoch` began (i.e. the 00:00 or 12:00 IST boundary). */
export function epochStartMs(epoch: number): number {
  return epoch * REFRESH_INTERVAL_MS - IST_OFFSET_MS;
}

/** `epochStartMs` as an ISO string — the `refresh_time` analytics property. */
export function epochStartIso(epoch: number): string {
  return new Date(epochStartMs(epoch)).toISOString();
}

// ---------------------------------------------------------------------------
// Knobs
// ---------------------------------------------------------------------------

/** Share of a catalogue shown per refresh; the rest is held back. */
export const SHOW_SHARE = 0.65;

/**
 * Share of the SHOWN set swapped out each refresh. 0.31 × 65 ≈ 20 — i.e. of 100
 * items, 65 show, and 20 of those are traded for held-back ones at the next
 * refresh. It must stay below 1 so consecutive windows overlap (that overlap is
 * what makes the feed feel refreshed rather than replaced).
 */
export const SWAP_SHARE = 0.31;

/** Below this size, holding items back would leave the grid looking empty. */
export const MIN_ROTATE_COUNT = 24;

/** Top-N by engagement that resurfacing draws from. */
export const RESURFACE_POOL = 20;

/** How many of that pool get pinned near the top per refresh. */
export const RESURFACE_COUNT = 2;

/** Refresh cycles a newly published item is guaranteed a top slot (~2 days). */
export const NEW_BOOST_CYCLES = 4;

/** Cap on boosted new items per refresh, per content type. */
export const NEW_BOOST_MAX = 2;

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * FNV-1a (32-bit) plus a murmur3-style avalanche. A hash, not a PRNG: same
 * string ⇒ same number on every process, Node version and architecture, which
 * is the property the whole no-scheduler design rests on. `Math.random` and
 * `crypto` are both wrong here.
 *
 * The finalizer is not decoration. Plain FNV-1a barely mixes the LAST bytes it
 * consumes, so hashing `id + salt` shifts every value by the same delta and
 * leaves the sort order unchanged — the "reshuffle" would silently do nothing.
 * Salts are therefore PREFIXED (`seeded`) and the result avalanched.
 */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash `id` under a seed. Seed FIRST — see `hash32`. */
function seeded(seed: string, id: string): number {
  return hash32(`${seed}:${id}`);
}

/** One item competing for a slot. `score` is action-clicks, `0` if unknown. */
export interface RotationCandidate {
  id: string;
  createdAtMs: number;
  score: number;
}

function byHash(seed: string) {
  return (a: RotationCandidate, b: RotationCandidate): number =>
    seeded(seed, a.id) - seeded(seed, b.id) || (a.id < b.id ? -1 : 1);
}

/**
 * Order one module's catalogue for one refresh epoch.
 *
 * 1. RING — sort by `hash(id)`. A fixed circular sequence, identical at every
 *    epoch, so a sliding window over it eventually reaches every item.
 * 2. WINDOW — show `SHOW_SHARE` of the ring starting at `epoch × step`, wrapping
 *    around. Since the window is longer than the step, consecutive refreshes
 *    share most of their items (~20 of 65 swapped) and the union of windows
 *    still covers the whole ring within a few days. Nothing is stranded.
 * 3. RESHUFFLE — re-sort the window by `hash(id + epoch)`, so even the items
 *    that stayed are in a different place.
 * 4. RESURFACE — pin a rotating slice of the top-scoring items to the head.
 * 5. NEW BOOST — pin recently published items above those, capped.
 *
 * Returns ids in display order. Steps 4 and 5 can pull in items the window held
 * back — that's deliberate: a proven or brand-new item outranks the rotation.
 */
export function rotate(candidates: readonly RotationCandidate[], epoch: number): string[] {
  const n = candidates.length;
  if (n === 0) return [];

  const ring = [...candidates].sort(byHash("ring"));

  const size = n <= MIN_ROTATE_COUNT ? n : Math.ceil(n * SHOW_SHARE);
  const step = Math.max(1, Math.round(size * SWAP_SHARE));
  // `%` keeps a negative epoch (pre-1970 clock skew) in range.
  const start = (((epoch * step) % n) + n) % n;
  const window: RotationCandidate[] = [];
  for (let i = 0; i < size; i += 1) {
    const item = ring[(start + i) % n];
    if (item) window.push(item);
  }
  window.sort(byHash(String(epoch)));

  const head = [...boostedNew(candidates, epoch), ...resurfaced(candidates, epoch)];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const item of [...head, ...window]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    ordered.push(item.id);
  }
  return ordered;
}

/**
 * A rotating `RESURFACE_COUNT`-wide slice of the module's top performers. Per
 * module, never globally, so a busy module can't monopolise the top of every
 * shelf. Items with no engagement at all are not "proven" and never resurface.
 */
function resurfaced(
  candidates: readonly RotationCandidate[],
  epoch: number
): RotationCandidate[] {
  const pool = candidates
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
    .slice(0, RESURFACE_POOL);
  if (pool.length === 0) return [];
  // Resurfacing only means something when there is a CHOICE to rotate through.
  // With `pool.length <= RESURFACE_COUNT` every proven item is pinned every
  // refresh, so the head is the same items forever no matter how the start is
  // picked — pinning, not resurfacing. A young catalogue where one or two items
  // have any engagement is exactly that case, so let them take their chances in
  // the shuffle instead of owning the top of the grid.
  const count = Math.min(RESURFACE_COUNT, pool.length);
  if (pool.length <= count) return [];
  // The start is the HASHED epoch, not `epoch * count`. A linear step of 2 only
  // ever lands on EVEN offsets, so an even pool resurfaces the same fixed pairs
  // (0&1, 2&3, …) — half the reachable heads — and a pool of one or two proven
  // items is pinned to one head FOREVER. That is the "the top of the grid never
  // moves" bug: a young catalogue has few items with any engagement, and those
  // few own the first slots of every refresh. Hashing reaches every offset.
  const start = hash32(String(epoch)) % pool.length;
  const picked: RotationCandidate[] = [];
  for (let i = 0; i < count; i += 1) {
    const item = pool[(start + i) % pool.length];
    if (item) picked.push(item);
  }
  return picked;
}

/**
 * Items published within the last `NEW_BOOST_CYCLES` refreshes, newest first,
 * capped at `NEW_BOOST_MAX`. Inert while the catalogue is frozen; the day
 * uploads resume, a new item is guaranteed a top slot for ~2 days despite
 * having no engagement history — and then competes like everything else.
 */
function boostedNew(
  candidates: readonly RotationCandidate[],
  epoch: number
): RotationCandidate[] {
  const oldestBoostedEpoch = epoch - NEW_BOOST_CYCLES + 1;
  return candidates
    .filter((c) => refreshEpochOf(c.createdAtMs) >= oldestBoostedEpoch)
    .sort((a, b) => b.createdAtMs - a.createdAtMs || (a.id < b.id ? -1 : 1))
    .slice(0, NEW_BOOST_MAX);
}

/**
 * Merge per-content-type orders into one mixed feed: a repeating block with one
 * item of each type, the block's internal order rotated per block (and per
 * epoch) so no type is permanently first. A type that runs out simply drops out
 * of later blocks, so the tail is never padded with a single type until it has
 * to be.
 *
 * Keys are sorted first, so the result depends only on the SET of types
 * present, not on Map insertion order.
 */
export function interleaveByType(
  byType: ReadonlyMap<string, readonly string[]>,
  epoch: number
): string[] {
  const types = [...byType.keys()].sort();
  if (types.length === 0) return [];
  const total = types.reduce((sum, t) => sum + (byType.get(t)?.length ?? 0), 0);
  const taken = new Map<string, number>(types.map((t) => [t, 0]));
  const out: string[] = [];

  for (let block = 0; out.length < total; block += 1) {
    const shift = (((epoch + block) % types.length) + types.length) % types.length;
    for (let i = 0; i < types.length; i += 1) {
      const type = types[(shift + i) % types.length];
      if (type === undefined) continue;
      const list = byType.get(type) ?? [];
      const next = taken.get(type) ?? 0;
      const id = list[next];
      if (id === undefined) continue;
      taken.set(type, next + 1);
      out.push(id);
    }
  }
  return out;
}

/**
 * Re-order hydrated rows to match a plan slice. The DB returns rows in ITS
 * order (`WHERE id IN (...)` has no ordering guarantee worth relying on); this
 * puts them back in rotation order and drops anything that vanished between
 * plan build and hydration.
 */
export function orderByPlan<T extends { id: string }>(rows: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered: T[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) ordered.push(row);
  }
  return ordered;
}
