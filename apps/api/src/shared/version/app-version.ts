/**
 * TAM-132 backwards-compat gate — tolerant semver parsing + comparison for the
 * mobile `app_version` request header (see `apps/mobile/lib/core/dio_client.dart`).
 *
 * Shared infrastructure: it started module-local in `core/home/services/` with
 * a note to promote it the moment a second module needed a version gate. TAM-258
 * is that second module — the landing resolver floors the experiment at the
 * release that can actually render its destinations — so this is that promotion.
 * Nothing about the parsing changed; only where it lives.
 *
 * The header value is `PackageInfo.version` — the SEMVER string only (e.g.
 * `"1.0.4"`), NOT `versionName+buildNumber`. It can also be `""` if
 * `PackageInfo.fromPlatform()` throws on the client (falls back to `''` in
 * `device_context.dart:_resolveAppVersion`). Both undefined and empty parse to
 * `null` and are treated as "very old client" by the caller.
 */

/**
 * Parse a semver-like string into a `[major, minor, patch]` tuple of
 * non-negative integers. Deliberately tolerant — we take the FIRST three
 * dot-segments, strip a leading `v`, and drop any build/pre-release suffix
 * (anything after the first `+` or `-`). Returns `null` on parse failure or
 * empty input, so the caller can treat a garbled header the same as a missing
 * one.
 *
 * The tolerance is load-bearing: an unexpected/older/newer wire shape must
 * never crash the endpoint. It never has to; parse failures fall back to
 * "cannot satisfy any non-null gate", which is the safe default.
 */
export function parseAppVersion(
  raw: string | undefined | null
): [number, number, number] | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Strip a leading `v` (`v1.2.3`) and any pre-release / build suffix
  // (`1.2.3-rc.1`, `1.2.3+42`).
  const noPrefix = trimmed.replace(/^v/i, "");
  const core = noPrefix.split(/[+-]/)[0] ?? "";
  const segments = core.split(".");
  if (segments.length === 0) return null;

  const parsed: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const seg = segments[i] ?? "0";
    // A segment must be pure non-negative digits — reject "1a", "-1", NaN…
    if (!/^\d+$/.test(seg)) return null;
    const n = Number.parseInt(seg, 10);
    if (!Number.isFinite(n) || n < 0) return null;
    parsed.push(n);
  }

  const major = parsed[0];
  const minor = parsed[1];
  const patch = parsed[2];
  if (major === undefined || minor === undefined || patch === undefined) {
    return null;
  }
  return [major, minor, patch];
}

/**
 * `true` iff `actual >= minimum` under semver ordering (major, then minor, then
 * patch).
 *
 * Boundary behaviours (all load-bearing for the shortcut filter):
 *   - `minimum` null / undefined ⇒ ALWAYS true (no gate ⇒ visible to everyone).
 *   - `actual` null / undefined / unparseable ⇒ ALWAYS false (an unknown
 *     client version can never satisfy a real gate — treat as "very old").
 *   - Both parseable ⇒ triple-lexicographic compare.
 */
export function semverGte(
  actual: string | undefined | null,
  minimum: string | undefined | null
): boolean {
  const min = parseAppVersion(minimum);
  if (min === null) return true;
  const act = parseAppVersion(actual);
  if (act === null) return false;
  for (let i = 0; i < 3; i += 1) {
    const a = act[i] ?? 0;
    const m = min[i] ?? 0;
    if (a > m) return true;
    if (a < m) return false;
  }
  return true; // equal
}
