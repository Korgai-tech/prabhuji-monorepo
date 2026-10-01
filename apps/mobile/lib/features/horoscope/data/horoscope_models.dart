import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

import '../../../api/generated/openapi.dart';

/// How a step's value is presented (TAM-73 contract `HoroscopeDailyStep.contentType`).
///
/// This is NOT cosmetic metadata — the design renders a `number` step's value at
/// 32px vs 16px for `text`/`color` (Figma node 1162:4276 "7" vs 1162:4244
/// "Sky Blue"). See `AppText.horoscopeResultNumber`.
enum HoroscopeContentType {
  text,
  number,
  color;

  /// Unknown/absent values degrade to [text] — a future server-side content type
  /// must never blank out a step (the text always renders).
  static HoroscopeContentType fromWire(String? raw) {
    switch (raw) {
      case 'number':
        return HoroscopeContentType.number;
      case 'color':
        return HoroscopeContentType.color;
      default:
        return HoroscopeContentType.text;
    }
  }
}

/// One zodiac sign on the FREE discovery grid (`GET /horoscope/zodiac-signs`).
@immutable
class HoroscopeZodiacSign extends Equatable {
  const HoroscopeZodiacSign({
    required this.zodiacId,
    required this.displayName,
    required this.sortOrder,
  });

  /// The contract's closed enum value (`aries` … `pisces`). Also the key for the
  /// bundled Figma glyph — see `zodiacGlyphAsset`.
  final String zodiacId;

  /// Server-provided label. The API fixes the Figma layer-name typos, so this is
  /// always `Sagittarius` / `Capricorn` — never "Saittarius" / "Capricon".
  final String displayName;

  final int sortOrder;

  /// Maps the generated DTO. `iconAssetUrl` is deliberately DROPPED: the seed
  /// serves a `placehold.co` placeholder there, and the zodiac set is a closed
  /// 12-value enum whose real art is the Figma "Zodiac Icons" section — which we
  /// bundle and key by [zodiacId] (TAM-56 STRICT gate). See TOKENS.md.
  factory HoroscopeZodiacSign.fromWire(HoroscopeZodiacCard card) {
    return HoroscopeZodiacSign(
      zodiacId: card.zodiacId.value,
      displayName: card.displayName,
      sortOrder: card.sortOrder,
    );
  }

  @override
  List<Object?> get props => [zodiacId, displayName, sortOrder];
}

/// One ordered, backend-configured section of a daily result.
///
/// The 8 sections in Figma are EXAMPLES. Admin can add/remove/rename/reorder/
/// disable steps server-side (PRD §6.5/§10), so the client never hardcodes them:
/// it renders whatever list arrives, in the order it arrives.
@immutable
class HoroscopeStep extends Equatable {
  const HoroscopeStep({
    required this.stepId,
    required this.title,
    required this.displayText,
    required this.ttsText,
    required this.order,
    required this.contentType,
    required this.ttsEnabled,
  });

  final String stepId;
  final String title;
  final String displayText;

  /// What TTS narrates. Falls back to [displayText] when the server sends it
  /// blank (AC: "reading step heading + ttsText (falls back to displayText)").
  final String ttsText;
  final int order;
  final HoroscopeContentType contentType;

  /// Server switch for narrating THIS step. A `false` step still renders its
  /// text — narration is best-effort, text never is.
  final bool ttsEnabled;

  /// The text TTS should speak: the heading, then the body.
  String get spokenText {
    final body = ttsText.trim().isEmpty ? displayText : ttsText;
    return '$title. $body';
  }

  factory HoroscopeStep.fromWire(HoroscopeDailyStep step) {
    return HoroscopeStep(
      stepId: step.stepId,
      title: step.title,
      displayText: step.displayText,
      ttsText: step.ttsText,
      order: step.order,
      contentType: HoroscopeContentType.fromWire(step.contentType.value),
      ttsEnabled: step.ttsEnabled,
    );
  }

  @override
  List<Object?> get props =>
      [stepId, title, displayText, ttsText, order, contentType, ttsEnabled];
}

/// The result background media (video + its static fallback).
@immutable
class HoroscopeMediaData extends Equatable {
  const HoroscopeMediaData({
    required this.backgroundVideoUrl,
    required this.backgroundStaticFallbackUrl,
  });

  final String backgroundVideoUrl;

  /// CMS-configured still. Tried when the video fails; if THIS also fails
  /// (offline), the bundled Figma still is the last resort.
  final String backgroundStaticFallbackUrl;

  factory HoroscopeMediaData.fromWire(HoroscopeMedia media) {
    return HoroscopeMediaData(
      backgroundVideoUrl: media.backgroundVideoUrl,
      backgroundStaticFallbackUrl: media.backgroundStaticFallbackUrl,
    );
  }

  @override
  List<Object?> get props =>
      [backgroundVideoUrl, backgroundStaticFallbackUrl];
}

/// A Pro-gated daily result (`GET /horoscope/daily`).
@immutable
class HoroscopeDailyResultData extends Equatable {
  /// Normalizes on construction: [steps] is ALWAYS sorted by `order` and
  /// unmodifiable.
  ///
  /// The invariant lives here, in the type, rather than only in [fromWire] — the
  /// reading sequence is the product promise, and it must hold however the model
  /// was built (a proxy that reshuffles the JSON array, a cache, a test
  /// fixture). Enforcing it at one call site would leave every other path free
  /// to scramble the order.
  factory HoroscopeDailyResultData({
    required String zodiacId,
    required String dateIst,
    required String localeServed,
    required bool fallbackUsed,
    required List<HoroscopeStep> steps,
    required HoroscopeMediaData media,
  }) {
    final sorted = [...steps]..sort((a, b) => a.order.compareTo(b.order));
    return HoroscopeDailyResultData._(
      zodiacId: zodiacId,
      dateIst: dateIst,
      localeServed: localeServed,
      fallbackUsed: fallbackUsed,
      steps: List<HoroscopeStep>.unmodifiable(sorted),
      media: media,
    );
  }

  const HoroscopeDailyResultData._({
    required this.zodiacId,
    required this.dateIst,
    required this.localeServed,
    required this.fallbackUsed,
    required this.steps,
    required this.media,
  });

  final String zodiacId;

  /// IST civil date (`YYYY-MM-DD`) the server resolved.
  final String dateIst;

  /// The locale actually served after the server's `requested → hi → en` chain.
  /// TTS narrates in THIS locale, not the requested one (spec q2).
  final String localeServed;
  final bool fallbackUsed;

  /// Ordered, enabled steps exactly as the server returned them.
  final List<HoroscopeStep> steps;
  final HoroscopeMediaData media;

  /// Maps the generated DTO. The constructor sorts by `order`, so the reading
  /// sequence survives a proxy that reshuffles the JSON array.
  factory HoroscopeDailyResultData.fromWire(HoroscopeDailyResult result) {
    return HoroscopeDailyResultData(
      zodiacId: result.zodiacId.value,
      dateIst: result.dateIst,
      localeServed: result.localeServed,
      fallbackUsed: result.fallbackUsed,
      steps: result.steps.map(HoroscopeStep.fromWire).toList(),
      media: HoroscopeMediaData.fromWire(result.media),
    );
  }

  @override
  List<Object?> get props =>
      [zodiacId, dateIst, localeServed, fallbackUsed, steps, media];
}

/// Why a daily fetch failed — the client branches on this, never on a message.
enum HoroscopeErrorKind {
  /// 403 — free user. Routes to the paywall; NEVER renders a preview.
  proRequired,

  /// 409 — the mode has zero enabled steps (server-side config error).
  emptyConfig,

  /// 404 — unknown zodiac / no result generated for today.
  notFound,

  /// No connectivity.
  offline,

  /// 5xx / malformed / anything else.
  unknown,
}

/// Typed failure from the horoscope endpoints.
class HoroscopeException implements Exception {
  const HoroscopeException(this.kind, [this.message]);
  final HoroscopeErrorKind kind;
  final String? message;

  @override
  String toString() => 'HoroscopeException($kind, $message)';
}

/// The current IST civil date as the contract's `YYYY-MM-DD`.
///
/// **Why the client computes this.** The design puts the IST date on the FREE
/// grid (Figma node 379:2578), but `GET /horoscope/zodiac-signs` does not serve
/// a date — only the **Pro-gated** `GET /horoscope/daily` returns `dateIst`
/// (TAM-73), and a free user never calls it. So the grid header has no server
/// date to render. IST is a fixed UTC+05:30 with no DST, so deriving the civil
/// date from the device clock is exact (the same arithmetic the API's
/// `date-ist.ts` does), with the device clock as the only trust assumption.
///
/// The RESULT screen never uses this — it renders the server's authoritative
/// `dateIst`. Flagged to BSA as a contract gap: if `zodiac-signs` ever serves
/// `dateIst`, prefer it and delete this.
String istCivilDateNow({DateTime? now}) {
  const istOffset = Duration(hours: 5, minutes: 30);
  final ist = (now ?? DateTime.now()).toUtc().add(istOffset);
  final mm = ist.month.toString().padLeft(2, '0');
  final dd = ist.day.toString().padLeft(2, '0');
  return '${ist.year}-$mm-$dd';
}

/// Formats the contract's `dateIst` (`YYYY-MM-DD`) as the design's
/// "15 June, 2026" (Figma nodes 379:2578 / 387:2616).
///
/// Deliberately NOT `intl`-localized: the server owns localization (it returns
/// `localeServed`), and Phase 1 ships no localized month table. An unparseable
/// value passes through verbatim rather than throwing.
String formatHoroscopeDate(String dateIst) {
  final parsed = DateTime.tryParse(dateIst);
  if (parsed == null) return dateIst;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return '${parsed.day} ${months[parsed.month - 1]}, ${parsed.year}';
}
