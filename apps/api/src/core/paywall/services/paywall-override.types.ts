/**
 * The shape of a `paywall_utm_overrides.overrides` blob, and the narrowing that
 * turns an untrusted `Json` column into it.
 *
 * ── SCOPE: THE DEFAULT PAYWALL, AND ONLY ITS OWN CONTENT ───────────────────
 * An override is always applied to `vip-membership-v1`. It may change ONLY the
 * fields that paywall actually owns per locale, verified against stage on
 * 2026-08-19:
 *
 *   - ONE hero asset  — `paywall_hero_media` holds exactly one `video` row per
 *     locale for this paywall (`vip_intro_v2_1` for `hi`, `vip_intro_v2_2` for
 *     `en`), which is why this is a single asset and not a list. The carousel
 *     lives on `vip-carousel-v1`, a variant no campaign is ever served.
 *   - THE BENEFIT LIST — which of the paywall's benefits show, in what order,
 *     and what each is called. An ordered array that REPLACES the list wholesale
 *     rather than patching it, because "show three of the eight" is the point.
 *
 * `icon` is an ICON KEY, never a URL: the client maps it to a BUNDLED asset, so
 * a campaign may re-use any key the app already ships (`benefit-mandir.png` and
 * the seven others, stage 2026-08-19) but cannot introduce artwork — that is an
 * app release. A key no installed build bundles renders a blank tile, which is
 * why the CMS offers a fixed list rather than a text box.
 *
 * Everything else on the wire is deliberately out of reach: `plans` and
 * `legalLinks` are money and legal text, the four `paywall_translations` copy
 * fields (`title`, `payNowCta`, `cancelAnytimeText`, `refundPolicyText`) are the
 * product's own voice, and `paywallId` is not editable at all — a campaign is a
 * different DRESSING of the default paywall, never a different paywall.
 *
 * ── NOTHING HERE IS EVER WRITTEN BACK ──────────────────────────────────────
 * This is a read-time patch. No path in this module writes to `paywall_configs`,
 * `paywall_translations`, `paywall_hero_media`, `paywall_benefits` or
 * `paywall_benefit_translations` — the CMS edits `paywall_utm_overrides` and
 * nothing else, and `applyPaywallOverride` COPIES the response rather than
 * mutating it. That copy matters most for benefits: the response it patches is
 * the entry shared by every caller on that `(paywallId, locale)`, so renaming a
 * benefit in place would rename it for everyone, campaign or not.
 *
 * ── WHY PER LOCALE ─────────────────────────────────────────────────────────
 * Both underlying tables are keyed `(paywall_id, locale)` and stage really does
 * carry a DIFFERENT video for `en` and `hi`. A single global asset would force
 * one language's creative onto the other.
 *
 * ── STRICT ON WRITE, TOTAL ON READ ─────────────────────────────────────────
 * The admin route owns a Zod schema that REJECTS a bad write with a 400, so an
 * editor is told what is wrong. `parsePaywallOverride` never rejects: a row
 * that predates a field, was hand-edited in psql, or was written by an older
 * deploy degrades key by key to "override nothing", because the alternative on
 * this path is a throw inside `GET /paywall/config` — no purchase screen at
 * all. Strict where a human can fix it, total where a user is waiting.
 */

/** The single hero asset for one locale. Mirrors a `paywall_hero_media` row. */
export interface PaywallOverrideMedia {
  mediaType: "image" | "video";
  url: string;
  thumbnailUrl: string | null;
  /** Analytics identity of the creative — surfaces as `video_id` on paywall events. */
  mediaId: string;
}

/**
 * One entry in a campaign's benefit list.
 *
 * `icon` is a bundled asset KEY (`benefit-mandir.png`), never a URL — see the
 * file header. `benefitId` is the analytics identity the app reports the tile
 * under, so re-using the paywall's own ids keeps a campaign's benefit
 * comparable with the standard paywall's in the warehouse.
 */
export interface PaywallOverrideBenefit {
  benefitId: string;
  icon: string;
  name: string;
}

/** What one locale may override. Every field optional; absent = keep the CMS value. */
export interface PaywallOverrideLocale {
  media?: PaywallOverrideMedia;
  /** Ordered. REPLACES the paywall's list; absent keeps it, `[]` is rejected on write. */
  benefits?: PaywallOverrideBenefit[];
}

/** locale → its overrides. A locale absent here is served entirely from the CMS. */
export interface PaywallOverride {
  locales: Partial<Record<OverrideLocaleCode, PaywallOverrideLocale>>;
}

/**
 * The ONLY locales an override may carry.
 *
 * Not `LanguageCodeSchema`'s nine. The default paywall has content in exactly
 * these two — `paywall_translations` and `paywall_hero_media` each hold an `en`
 * and a `hi` row for `vip-membership-v1` and nothing else (stage, 2026-08-19) —
 * and the locale-fallback chain (`requested → hi → en`) means a caller asking
 * for any of the other seven is SERVED `hi` or `en` anyway. A `mr` block could
 * therefore never be reached, so offering one in the CMS would be an editor
 * translating copy that can never render.
 *
 * The two blocks are INDEPENDENT: a served locale uses its own block or none at
 * all. Filling only one language leaves the other on the standard paywall.
 */
export const OVERRIDE_LOCALES = ["hi", "en"] as const;

export type OverrideLocaleCode = (typeof OVERRIDE_LOCALES)[number];

/**
 * How many benefits a campaign list may carry.
 *
 * Eight is what the default paywall ships and what `card_hero` was laid out
 * against; more would overflow the tile grid on a small screen. A campaign
 * showing FEWER is the normal case.
 */
export const MAX_OVERRIDE_BENEFITS = 8;

/** `{}` for anything that is not a plain object — arrays and `null` included. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** The value when it is a non-blank string, else `undefined`. */
function asText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseMedia(value: unknown): PaywallOverrideMedia | undefined {
  const row = asRecord(value);
  const url = asText(row.url);
  const mediaId = asText(row.mediaId);
  // No URL renders an empty player; no `mediaId` reports every impression as an
  // unnamed creative. Neither is servable, and dropping the media (rather than
  // the whole locale) still lets the campaign's COPY run over the CMS video.
  if (url === undefined || mediaId === undefined) return undefined;
  return {
    // An unrecognised type renders nothing on the client, so normalise here.
    mediaType: row.mediaType === "video" ? "video" : "image",
    url,
    thumbnailUrl: asText(row.thumbnailUrl) ?? null,
    mediaId,
  };
}

/**
 * One benefit, or `undefined` when it could not render.
 *
 * All three fields are required: a tile with no name is blank, and one with no
 * icon key is a hole in the grid. Dropping the ENTRY rather than the whole list
 * keeps the rest of a part-corrupt campaign on screen.
 */
function parseBenefit(value: unknown): PaywallOverrideBenefit | undefined {
  const row = asRecord(value);
  const benefitId = asText(row.benefitId);
  const icon = asText(row.icon);
  const name = asText(row.name);
  if (benefitId === undefined || icon === undefined || name === undefined) return undefined;
  return { benefitId, icon, name };
}

/**
 * The campaign's benefit list, or `undefined` to keep the paywall's own.
 *
 * A non-array, or an array whose every entry is unusable, reads as "not
 * overridden" rather than "show nothing" — an empty benefit grid looks like a
 * broken build, and the standard list is always a safe thing to show. Excess
 * entries are TRUNCATED rather than rejected, because the alternative on this
 * path is dropping a campaign the CMS accepted.
 */
function parseBenefits(value: unknown): PaywallOverrideBenefit[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list: PaywallOverrideBenefit[] = [];
  for (const entry of value) {
    const benefit = parseBenefit(entry);
    if (benefit !== undefined) list.push(benefit);
    if (list.length === MAX_OVERRIDE_BENEFITS) break;
  }
  return list.length === 0 ? undefined : list;
}

function parseLocale(value: unknown): PaywallOverrideLocale | undefined {
  const raw = asRecord(value);
  const entry: PaywallOverrideLocale = {};

  const media = parseMedia(raw.media);
  if (media !== undefined) entry.media = media;

  const benefits = parseBenefits(raw.benefits);
  if (benefits !== undefined) entry.benefits = benefits;

  return Object.keys(entry).length === 0 ? undefined : entry;
}

/**
 * Narrows a stored `overrides` blob. Total: any input yields a valid override,
 * and garbage yields `{ locales: {} }` — which `applyPaywallOverride` treats as
 * "change nothing", so the caller still gets the ordinary default paywall.
 */
export function parsePaywallOverride(value: unknown): PaywallOverride {
  const raw = asRecord(value);
  const stored = asRecord(raw.locales);
  const locales: Partial<Record<OverrideLocaleCode, PaywallOverrideLocale>> = {};

  // Iterating the ALLOWED locales rather than the stored keys drops anything the
  // CMS could not have written — a hand-edited `mr` block cannot start serving
  // through a gap the write schema closes.
  for (const locale of OVERRIDE_LOCALES) {
    const parsed = parseLocale(stored[locale]);
    if (parsed !== undefined) locales[locale] = parsed;
  }

  return { locales };
}
