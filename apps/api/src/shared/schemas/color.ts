import { z } from "zod";

/**
 * Shared hex-colour Zod helper (TAM-174).
 *
 * The first CMS-authored COLOUR on the platform. Every module schema that
 * carries one composes this helper, so the OpenAPI contract — and the generated
 * TS + Dart clients — validate the shape identically everywhere, exactly as
 * `mediaUrl` does for media columns.
 *
 * ── WHY A VALUE, NOT AN ALLOWLISTED KEY ─────────────────────────────────────
 * `destinationValue` and `iconKey` are deliberately stable KEYS the client
 * resolves through a hardcoded allowlist, because a CMS string must never be
 * able to become a navigable route or a fetched URL (#EXPORT_CRITICAL). A
 * colour is neither: it is consumed by the renderer and nothing else, and the
 * worst a bad value can do is produce an ugly tile — which the client's own
 * parse-failure fallback already contains. Making colours keys instead would
 * mean an app release every time design retunes a palette, reintroducing the
 * exact constraint TAM-132 removed for artwork.
 *
 * ── THE CONTRACT ────────────────────────────────────────────────────────────
 * Exactly `#RRGGBB`. Deliberately NARROW:
 *   - no 3-digit shorthand (`#FFF`) — Dart's `Color` parsing in the client
 *     takes a fixed-width value, and supporting both widths at the boundary
 *     would push the branch into every consumer;
 *   - no 8-digit `#AARRGGBB` — alpha belongs to the widget that composites the
 *     layer, not to a CMS column, and an alpha nobody expects is invisible
 *     until it renders wrong on one screen;
 *   - no CSS names (`rebeccapurple`), no `rgb()`, no bare `RRGGBB`.
 *
 * Case-insensitive on input — Figma exports lowercase, designers paste
 * uppercase, and rejecting one of those would be a papercut with no safety
 * value. The value is NOT normalised: it is stored and served exactly as
 * written, so a CMS round trip never silently rewrites what ops typed.
 *
 * A bad value is a `400 VALIDATION_ERROR` from the global error handler, never
 * a 500.
 */
export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex colour, e.g. #FC7304")
  .describe("A `#RRGGBB` colour. No alpha, no shorthand, no CSS colour names.");

export type HexColor = z.infer<typeof hexColor>;

/**
 * A gradient-handle position, as a fraction of the painted box.
 *
 * DELIBERATELY NOT CLAMPED TO [0,1]. Figma gradient handles may sit outside the
 * node they paint — the `set_wallpaper` shortcut tile is authored `0.14734 →
 * 1.4734`, i.e. its lower colour stop lies half a card-height BELOW the card.
 * Clamping here would silently flatten that gradient to something the design
 * never specified.
 *
 * The `[-1, 3]` envelope is a sanity bound, not a design one: it is wide enough
 * for any real handle and narrow enough that a unit mix-up (a percentage pasted
 * as `147.34` rather than `1.4734`) is rejected at the boundary instead of
 * rendering as a flat block of one colour.
 *
 * Consumers must NOT pass these to Flutter's `LinearGradient.stops`, which
 * requires `[0,1]` and throws otherwise — the client maps them onto `Alignment`,
 * which accepts out-of-range values. See TAM-174's stop-to-alignment decision.
 */
export const gradientStop = z
  .number()
  .finite()
  .min(-1)
  .max(3)
  .describe(
    "Gradient handle position as a fraction of the painted box. NOT clamped to [0,1] — Figma handles may sit outside the node (e.g. 1.4734). Map to `Alignment`, never to Flutter's `stops`."
  );
