import { z } from "zod";
import { loadEnv } from "@api/shared/config";

/**
 * Shared media-URL Zod helper (TAM-57 AC (c); dev carve-out TAM-84 AC (h)).
 *
 * The Prabhuji platform stores ALL media as absolute URLs in plain Postgres
 * TEXT columns — there is no binary/BLOB storage and no `MediaAsset` join table
 * in Phase 1 (TAM-56 scope decision 2; see the comment block in
 * `prisma/schema.prisma`). Every module response schema that carries a media
 * column (`iconUrl`, `audioUrl`, `imageUrl`, `thumbnailUrl`, `coverUrl`, …)
 * composes THIS helper so the OpenAPI contract — and the generated TS + Dart
 * clients — validate the URL shape identically everywhere.
 *
 * Default contract: `https`-only. Rejects `http`, `ftp`, relative paths, and
 * non-URL strings. The `400 VALIDATION_ERROR` a bad value produces is handled
 * by the global error handler (never a 500).
 *
 * DEV CARVE-OUT (TAM-84 / ADR §A7): floci-aws is http-only, so a locally
 * uploaded asset yields `http://localhost:4566/…`, which would fail response
 * serialization → a 500 on read. When `MEDIA_ALLOW_INSECURE_URLS=true` AND
 * `NODE_ENV !== "production"`, this helper ADDITIONALLY accepts `http://` on
 * `localhost` / `127.0.0.1` / `10.0.2.2` (the Android emulator's host alias)
 * origins ONLY. Nothing else. `env.ts` hard-fails the boot if the flag is true
 * under `NODE_ENV=production`, so the carve-out cannot reach stage/prod.
 *
 * WHY A `.refine` AND NOT A UNION / A NARROWED `z.url({protocol})`:
 *   - `z.url()` emits `{ "type": "string", "format": "uri" }` — IDENTICAL to the
 *     old `z.url({ protocol: /^https$/ })` emission (the protocol regex was not
 *     reflected in the JSON Schema). Keeping `z.url()` as the base and moving
 *     the protocol/host rule into a `.refine` therefore keeps the emitted
 *     `MediaUrl` component BYTE-IDENTICAL (verified: no OpenAPI drift), which is
 *     the AC (h) goal. A `.refine` is opaque to the JSON-Schema emitter, so the
 *     contract does not depend on the developer's local `MEDIA_ALLOW_INSECURE_URLS`
 *     — emission is deterministic, and env is read ONLY at validation time (never
 *     at emit time, where `.refine` predicates never run).
 *   - A union (`https | http-localhost`) would emit an `anyOf` that flips with
 *     the local flag → non-deterministic committed openapi.json. Rejected.
 *
 * Pro-gating note: whether a given media URL is premium (full `audioUrl`, book
 * content) is decided SERVER-SIDE by the owning module after an entitlement
 * check — this helper fixes the URL SHAPE only, never the gating.
 */

const INSECURE_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "10.0.2.2"]);

/**
 * RFC1918 private-network ranges (10/8, 172.16/12, 192.168/16). When the dev
 * carve-out is active, `http://` on any address in these ranges is accepted so
 * a laptop-on-LAN address (e.g. `http://10.10.11.158:4566/...`) — the URL
 * shape a real Android phone will receive from floci-aws — validates the same
 * way as `localhost` does for emulator development. Never active in
 * production (env.ts hard-fails the flag under NODE_ENV=production).
 */
function isPrivateNetworkIp(hostname: string): boolean {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [, aStr, bStr] = m;
  const a = Number(aStr);
  const b = Number(bStr);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** True when the dev-only http-on-localhost carve-out is active (never in prod). */
function insecureLocalUrlsAllowed(): boolean {
  const env = loadEnv();
  return env.MEDIA_ALLOW_INSECURE_URLS && env.NODE_ENV !== "production";
}

/**
 * The shape predicate. `https` is always accepted; `http` is accepted only on
 * the three dev host aliases OR any RFC1918 private-network IP, and only
 * when the carve-out is on. Runs at request-validation and response-
 * serialization time — never at OpenAPI emit.
 */
function isAllowedMediaUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false; // unreachable in practice — `z.url()` already rejected it.
  }
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:" && insecureLocalUrlsAllowed()) {
    return (
      INSECURE_LOCAL_HOSTS.has(url.hostname) ||
      isPrivateNetworkIp(url.hostname)
    );
  }
  return false;
}

export const mediaUrl = z
  .url()
  .refine(isAllowedMediaUrl, {
    message: "must be an absolute https URL (http is accepted only on localhost in dev)",
  })
  .meta({ id: "MediaUrl" });

export type MediaUrl = z.infer<typeof mediaUrl>;
