import { ValidationError } from "@api/shared/errors";

/**
 * Opaque cursor encode/decode for keyset (cursor) pagination (TAM-57 AC (d)).
 *
 * The stable sort key is `(sortOrder, id)` — a monotonic tuple that uniquely
 * orders every row so paging never skips or duplicates a row even as the CMS
 * appends more (the reason the repo-wide convention is cursor, not offset —
 * see #PATH_DECISION). The cursor is base64url(JSON) of that key: opaque to the
 * client, cheap to decode, and self-describing so a module repository can build
 * the keyset `WHERE` clause from it directly.
 *
 * Decode is defensive: any malformed / tampered cursor throws a
 * `ValidationError` (→ 400 `VALIDATION_ERROR` via the global error handler),
 * never a 500 (spec §"Input Validation").
 */
export interface CursorKey {
  sortOrder: number;
  id: string;
}

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): CursorKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new ValidationError("Invalid pagination cursor", "INVALID_CURSOR");
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    typeof (parsed as CursorKey).sortOrder === "number" &&
    Number.isFinite((parsed as CursorKey).sortOrder) &&
    typeof (parsed as CursorKey).id === "string" &&
    (parsed as CursorKey).id.length > 0
  ) {
    const { sortOrder, id } = parsed as CursorKey;
    return { sortOrder, id };
  }
  throw new ValidationError("Invalid pagination cursor", "INVALID_CURSOR");
}

/**
 * Cursor for a ROTATED listing (`shared/rotation`), where the order is not a DB
 * keyset but a precomputed plan for one refresh epoch.
 *
 * The epoch travels in the cursor on purpose: pages 2..N of an open session
 * keep paging the plan page 1 was served from, so a 00:00/12:00 refresh landing
 * mid-scroll can never reorder or duplicate what the user is already looking at
 * — it applies on the next cold start.
 */
export interface RotationCursor {
  epoch: number;
  offset: number;
  /**
   * TAM-175 — the deity pair this session's order was woven for.
   *
   * The order of a split feed depends on the user's gods as well as the epoch,
   * so pages 2..N can only reproduce page 1 if they know which pair produced
   * it. Without this a preference changing mid-scroll (an ad attribution, an
   * outcome) silently reshuffles everything below the fold — the same failure
   * the epoch is pinned to prevent, from a different input.
   *
   * OPTIONAL, and absent means "this surface is not deity-aware" (ringtone,
   * wallpaper) OR "minted before TAM-175 shipped". Both fall back to the
   * request's current pair, so no cursor in the wild is invalidated.
   * `null` is distinct from absent: it records that the user HAD no deity.
   */
  d1?: string | null;
  d2?: string | null;
}

export function encodeRotationCursor(cursor: RotationCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/**
 * Unlike `decodeCursor` this returns `null` instead of throwing on a shape it
 * doesn't recognise. A client mid-session across the deploy that introduced
 * rotation still holds an old-format `{sortOrder,id}` cursor; that must restart
 * the feed, not 400 the screen.
 */
export function decodeRotationCursor(cursor: string): RotationCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { epoch, offset, d1, d2 } = parsed as RotationCursor;
  if (!Number.isInteger(epoch) || !Number.isInteger(offset) || offset < 0) {
    return null;
  }
  // A deity slug is client-supplied here, so it is shape-checked rather than
  // trusted. It is never spliced into SQL — it only selects which pre-built
  // pool to weave from, and an unknown slug simply selects nothing — but a
  // non-string would reach `weave()` as a bogus Map key.
  if (!isCursorSlug(d1) || !isCursorSlug(d2)) return null;
  return {
    epoch,
    offset,
    // Preserve the absent/null distinction: `undefined` means the cursor is not
    // deity-aware, `null` means the user had no deity when it was minted.
    ...(d1 === undefined ? {} : { d1 }),
    ...(d2 === undefined ? {} : { d2 }),
  };
}

/** A cursor-carried deity slug: absent, explicitly null, or a bounded string. */
function isCursorSlug(value: unknown): value is string | null | undefined {
  if (value === undefined || value === null) return true;
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Turn a "fetch `limit + 1`" row window into a `{ items, nextCursor }` page.
 *
 * The repository over-fetches by one row; if that extra row is present there is
 * a next page and its cursor is the last KEPT row's key. On the last page (or
 * an empty result) `nextCursor` is `null`. `toKey` maps a row to its stable
 * `(sortOrder, id)` key.
 */
export function buildPage<T>(
  rows: T[],
  limit: number,
  toKey: (row: T) => CursorKey
): Page<T> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  if (last === undefined) {
    // limit <= 0 is impossible (Zod clamps to a positive int) — defensive.
    return { items: [], nextCursor: null };
  }
  return { items, nextCursor: encodeCursor(toKey(last)) };
}
