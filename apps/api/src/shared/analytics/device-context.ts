import type { IncomingHttpHeaders } from "node:http";
import { LRUCache } from "lru-cache";
import { getRedis } from "@api/shared/database";
import { createModuleLogger } from "@api/shared/logs";
import { isSystemActor } from "./events.js";

const log = createModuleLogger("analytics:device-context");

/**
 * The device/app facts the Flutter client stamps on every request, in the
 * TOP-LEVEL Amplitude field names the collector already accepts
 * (`apps/events/src/core/events/handlers/amplitude.schemas.ts`) — not
 * `event_properties`. They are a property of the DEVICE, not of the action, and
 * the warehouse has a promoted column per field.
 *
 * Every field is optional and every absent one is OMITTED on the wire, never
 * sent as null: ClickHouse's JSON type drops null-valued keys at ingest, so a
 * key we cannot populate is a query that silently returns nothing (the same
 * rule documented on the property bag in `events.ts`).
 */
export interface DeviceContext {
  /** → warehouse column `app_version`; the collector renames it. */
  version_name?: string;
  device_model?: string;
  device_brand?: string;
  os_version?: string;
  carrier?: string;
  language?: string;
  os_name?: string;
  platform?: string;
}

/**
 * Inbound header → event field. THE mapping; nothing else derives these names.
 *
 * Fastify lower-cases header names, so the lookups are the client's snake_case
 * as sent (`apps/mobile/lib/core/dio_client.dart`, `deviceHeaderInterceptor`).
 *
 * ⚠️ The client sends only the first SIX. `os_name` and `platform` are read
 * here and simply never arrive today — they are omitted rather than derived,
 * because guessing "android" from an `android_version` header would put a
 * fabricated value in a column analysts will read as observed fact.
 */
const HEADER_TO_FIELD: ReadonlyArray<readonly [string, keyof DeviceContext]> = [
  ["app_version", "version_name"],
  ["device_model", "device_model"],
  ["device_brand", "device_brand"],
  ["android_version", "os_version"],
  ["network_operator", "carrier"],
  ["device_language", "language"],
  ["os_name", "os_name"],
  ["platform", "platform"],
];

const KNOWN_FIELDS = HEADER_TO_FIELD.map(([, field]) => field);

/**
 * Ceiling on a stored value. Most of these land in `LowCardinality(String)`
 * columns, where a caller spraying long junk headers is not just noise but a
 * dictionary-growth problem. A real `device_model` is well under this.
 */
const MAX_VALUE_CHARS = 64;

/**
 * 30 days.
 *
 * The cache only has to bridge the gap between one request and the next, and
 * every authenticated request rewrites it — so for an active user any TTL above
 * a few minutes behaves identically. What the length actually buys is the
 * REQUEST-LESS producers: the billing cycle task charges (and emits) for users
 * who have not opened the app in weeks, and a shorter TTL would leave exactly
 * those events context-less. 30 days covers a monthly renewal; much beyond that
 * we would be reporting a device the user may no longer own.
 */
const CONTEXT_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Ceiling on any single Redis call from this file — same reasoning as
 * `shared/rotation/plan-cache.ts`: the shared client keeps ioredis' offline
 * queue and 20 retries, so a SICK Redis stalls a command for seconds rather
 * than refusing it. Enrichment is a nice-to-have; it may never hold up a send
 * the billing task is awaiting.
 */
const REDIS_CALL_TIMEOUT_MS = 200;


/**
 * Suppresses the re-write of an UNCHANGED context. Without it every
 * authenticated request would issue a Redis SET for a value that changes only
 * when the user upgrades the app or changes phone. Per-process and short-lived,
 * so the worst case is a skipped write that would have been byte-identical.
 */
const recentWrites = new LRUCache<string, string>({
  max: 5_000,
  ttl: 10 * 60 * 1000,
});

const cacheKey = (userId: string): string => `analytics:device-ctx:${userId}`;

/**
 * Pull the device context off a request's headers. Never throws; returns null
 * when the request carried nothing usable (every non-mobile caller — the admin
 * SPA, a health check, curl).
 */
export function readDeviceContext(headers: IncomingHttpHeaders): DeviceContext | null {
  const context: DeviceContext = {};
  let found = false;
  for (const [header, field] of HEADER_TO_FIELD) {
    const value = firstHeaderValue(headers[header]);
    if (value === undefined) continue;
    context[field] = value;
    found = true;
  }
  return found ? context : null;
}

function firstHeaderValue(raw: string | string[] | undefined): string | undefined {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  // The client sends fields it could not resolve as EMPTY STRINGS rather than
  // omitting them (`deviceHeaderInterceptor`), so "" means "unknown" and must
  // not become a stored key.
  if (!value) return undefined;
  return value.slice(0, MAX_VALUE_CHARS);
}

/**
 * Remember a user's device context for the events they are about to produce.
 *
 * Best-effort in every direction: no Redis (the normal local-dev state) is a
 * silent no-op, and a failure is logged and swallowed. Callers may `void` it.
 */
export async function cacheDeviceContext(
  userId: string,
  context: DeviceContext
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const serialised = JSON.stringify(context);
  if (recentWrites.get(userId) === serialised) return;
  try {
    await withTimeout("set", () =>
      redis.set(cacheKey(userId), serialised, "EX", CONTEXT_TTL_SECONDS)
    );
    recentWrites.set(userId, serialised);
  } catch (err) {
    log.warn({ err, user_id: userId }, "device context cache write failed");
  }
}

/**
 * Load the context for a batch of user ids — ONE round trip, whatever the batch
 * size, and duplicates (the normal case: several events for one user) collapse
 * to a single key.
 *
 * Never throws and never returns a partial failure: a miss, a timeout or a dead
 * Redis all produce an empty map, which leaves the events exactly as they were.
 */
export async function loadDeviceContexts(
  userIds: readonly string[]
): Promise<Map<string, DeviceContext>> {
  const contexts = new Map<string, DeviceContext>();
  const redis = getRedis();
  if (!redis) return contexts;
  try {
    // Deriving the id list INSIDE the try is deliberate. `send()` awaits this
    // function before entering its own try, so anything that escapes here
    // escapes into the caller — a billing tick, or a request path. `startsWith`
    // on a `user_id` that was not a string would be exactly that. TypeScript
    // already forbids it; this makes the non-blocking guarantee independent of
    // the type system holding at runtime.
    // Synthetic producers (`SYSTEM_ACTOR_ID`) have no device behind them.
    const ids = [...new Set(userIds)].filter((id) => !isSystemActor(id));
    if (ids.length === 0) return contexts;
    const raw = await withTimeout("mget", () => redis.mget(ids.map(cacheKey)));
    ids.forEach((id, index) => {
      const parsed = parseContext(raw[index]);
      if (parsed) contexts.set(id, parsed);
    });
  } catch (err) {
    log.warn(
      { err, users: userIds.length },
      "device context lookup failed — sending unenriched"
    );
  }
  return contexts;
}

/**
 * Parse a stored blob back into a context, keeping only known string fields.
 *
 * The filtering is not paranoia about our own writes: this value is spread
 * straight onto an outbound event, so an older or corrupted blob must not be
 * able to introduce a key the analytics contract never agreed to.
 */
function parseContext(raw: string | null): DeviceContext | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const context: DeviceContext = {};
  let found = false;
  for (const field of KNOWN_FIELDS) {
    const value = record[field];
    if (typeof value !== "string" || value.length === 0) continue;
    context[field] = value;
    found = true;
  }
  return found ? context : null;
}

/**
 * Race a Redis call against the ceiling. The loser is abandoned with its
 * rejection swallowed so it cannot surface as an unhandled rejection.
 */
async function withTimeout<T>(op: string, run: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const pending = run();
  pending.catch(() => {
    /* abandoned — the caller has already fallen back to no enrichment */
  });
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`redis ${op} exceeded ${REDIS_CALL_TIMEOUT_MS}ms`)),
          REDIS_CALL_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Test-only: drop the in-process write-suppression memory. */
export function clearDeviceContextWriteCache(): void {
  recentWrites.clear();
}
