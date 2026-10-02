/**
 * Slot weaving (TAM-175) — merge several rotated pools into one ordered feed
 * according to a fixed slot map.
 *
 * #PATH_DECISION — ROTATION STAYS SHARED, SLOTTING IS PER-USER.
 *
 * The 2h rotation is a pure function of `(epoch, catalogue)`, built once and
 * published to the whole fleet (see `plan-cache.ts`). Personalising the feed
 * must not break that: a plan per user would be a cache entry per user, and a
 * catalogue read per user per refresh.
 *
 * So rotation is unchanged and runs per POOL — `rotate()` over one deity's
 * catalogue is still shared by every user who has that deity. The per-user part
 * is only this file: given the handful of already-built pools, place their ids
 * into slots. It is pure array indexing over cached arrays, so it costs
 * microseconds and needs no cache of its own.
 *
 * Everything here is deterministic given its inputs, which is what lets pages
 * 2..N of a session reproduce page 1's order exactly from the same cursor.
 */

/**
 * Where each leading slot draws from, and what happens past the slot map.
 *
 * `slots[0]` is slot 1. Every entry is a pool key; `priority` is the
 * fall-through order used when a slot's own pool has nothing left.
 */
export interface WeaveSpec {
  /** Pool key per leading slot, slot 1 first. */
  readonly slots: readonly string[];
  /**
   * Fall-through order for an exhausted slot, most-preferred first.
   *
   * A slot never goes empty while ANY pool still has content: its own pool is
   * tried first, then the rest of this list in order. The list must end with a
   * pool that holds the whole catalogue (the "any" pool), which is what makes
   * "never empty" true rather than merely likely.
   */
  readonly priority: readonly string[];
  /** Pool that continues the feed past the last slot ("slot N+1 onwards"). */
  readonly tail: string;
}

/**
 * Build a `WeaveSpec`'s `slots` array from the slot NUMBERS each pool owns —
 * the same shape the product spec is written in:
 *
 *     slotsFromMap({ main: [1, 2, 3, 5], second: [4] })
 *
 * Transcribing twenty positions into a flat array by hand is a typo surface
 * with no upside, and a mistake there is invisible in review: the feed simply
 * shows a slightly wrong mix. This throws instead, at module load, if the
 * numbers do not tile 1..N exactly once — so a duplicate or a gap is a failed
 * boot, not a subtly wrong feed.
 */
export function slotsFromMap(map: Readonly<Record<string, readonly number[]>>): string[] {
  const bySlot = new Map<number, string>();
  let highest = 0;
  for (const [pool, positions] of Object.entries(map)) {
    for (const position of positions) {
      if (!Number.isInteger(position) || position < 1) {
        throw new Error(`slot positions must be positive integers, got ${position} for "${pool}"`);
      }
      const existing = bySlot.get(position);
      if (existing !== undefined) {
        throw new Error(`slot ${position} claimed by both "${existing}" and "${pool}"`);
      }
      bySlot.set(position, pool);
      if (position > highest) highest = position;
    }
  }
  const slots: string[] = [];
  for (let position = 1; position <= highest; position += 1) {
    const pool = bySlot.get(position);
    if (pool === undefined) throw new Error(`slot ${position} is not assigned to any pool`);
    slots.push(pool);
  }
  return slots;
}

/**
 * Lay the pools out across the slot map, then continue with the tail pool.
 *
 * Rules, in the order they matter:
 *
 *   1. AN ID APPEARS AT MOST ONCE. The pools overlap by construction — the
 *      "any" pool contains every item, and a user's two deity pools are subsets
 *      of it — so "skip anything already placed" is the whole game, not an edge
 *      case.
 *   2. A slot whose pool is exhausted FALLS THROUGH `spec.priority` rather than
 *      going empty. A user whose second god has three items must not get a feed
 *      pocked with holes at slots 4, 10, 14 and 18.
 *   3. Past the last slot the tail pool continues in its own order, minus what
 *      the slots already took — "slot N+1 onwards: unchanged".
 *
 * ABSENT OR EMPTY POOLS ARE THE INTERESTING CASE, not a degenerate one: a user
 * with no deity preference has empty main/second pools, every slot falls
 * through to the tail, and the result is byte-identical to the unpersonalised
 * feed. That is requirement 6 satisfied by construction rather than by a
 * separate branch.
 */
export function weave(
  spec: WeaveSpec,
  pools: ReadonlyMap<string, readonly string[]>
): string[] {
  const cursors = new Map<string, number>();
  const placed = new Set<string>();
  const ordered: string[] = [];

  /** Next unplaced id from `poolKey`, advancing its cursor; null when spent. */
  const take = (poolKey: string): string | null => {
    const pool = pools.get(poolKey);
    if (pool === undefined) return null;
    let index = cursors.get(poolKey) ?? 0;
    // Walk past ids another pool already contributed. The cursor is persisted
    // below so this skipping is paid once per id across the whole weave, not
    // once per slot — the pools overlap heavily and re-scanning would make this
    // quadratic on a large catalogue.
    while (index < pool.length) {
      const candidate = pool[index];
      if (candidate !== undefined && !placed.has(candidate)) {
        cursors.set(poolKey, index + 1);
        return candidate;
      }
      index += 1;
    }
    cursors.set(poolKey, index);
    return null;
  };

  for (const slotPool of spec.slots) {
    // Own pool first, then the rest of the priority order. Built per slot
    // rather than precomputed because the spec is tiny and the intent reads
    // better here than in a lookup table.
    const chain = [slotPool, ...spec.priority.filter((p) => p !== slotPool)];
    for (const poolKey of chain) {
      const id = take(poolKey);
      if (id !== null) {
        placed.add(id);
        ordered.push(id);
        break;
      }
    }
    // Every pool empty ⇒ the catalogue is exhausted. Keep going rather than
    // breaking: a later slot cannot succeed where this one failed, but the loop
    // is bounded by the slot map and the tail below still runs.
  }

  for (const id of pools.get(spec.tail) ?? []) {
    if (placed.has(id)) continue;
    placed.add(id);
    ordered.push(id);
  }

  return ordered;
}
