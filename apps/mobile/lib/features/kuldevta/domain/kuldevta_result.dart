import 'package:equatable/equatable.dart';

import '../../../api/generated/openapi.dart';

/// Deity gender — the two normalised values the server emits
/// (`kuldevta-reasons.service.ts:27-30` guarantees exactly `"devi"` or
/// `"devta"`). Drives every gender-conditional copy on the result screen
/// and the chat persona header.
enum KuldevtaGender {
  devi,
  devta;

  static KuldevtaGender? tryParse(String? raw) {
    switch (raw) {
      case 'devi':
        return KuldevtaGender.devi;
      case 'devta':
        return KuldevtaGender.devta;
      default:
        return null;
    }
  }
}

/// Client projection of the `POST /kuldevta/identify` success payload
/// (`KuldevtaIdentifyResponseData`).
///
/// Deliberately narrower than the generated DTO:
///
///  * `candidates` is IGNORED in v1 (spec §Scope › OUT of scope — the
///    candidate picker is a v2 UI decision). Not carried on the domain
///    projection so no widget can accidentally branch on it.
///  * `imageUrl` is narrowed to `String?` (empty → null) — the generated
///    model marks the field required, but the schema's `mediaUrl` codec
///    lets it be effectively-nullable. The result screen's variant branch
///    is `imageUrl == null || imageUrl.isEmpty` → sun-ray fallback.
///  * `gender` is narrowed to the [KuldevtaGender] enum so widget code
///    can `switch` exhaustively.
///  * `tier` stays as a plain string — carried on analytics only, no UI
///    branch (spec §API Contract › tier).
class KuldevtaResult extends Equatable {
  const KuldevtaResult({
    required this.slug,
    required this.nameRoman,
    required this.nameDevanagari,
    required this.gender,
    required this.imageUrl,
    required this.location,
    required this.reasons,
    required this.tier,
    required this.matchedOn,
  });

  final String slug;
  final String nameRoman;
  final String nameDevanagari;
  final KuldevtaGender gender;

  /// The deity's hero image URL. `null` OR empty → the result screen
  /// renders the sun-ray fallback in place of the image variant.
  final String? imageUrl;

  /// Single-line, already server-joined from `village, district, state`.
  /// `null` → the card renders only `nameRoman` (spec locked).
  final String? location;

  /// Always ≥ 1 (schema `.min(1)`, `kuldevta.schemas.ts:42`). Every entry
  /// renders as ONE cream reason card with the hardcoded trishul icon
  /// (spec §Reason card rendering — no per-line classification, no
  /// `matchedOn` read at render time).
  final List<String> reasons;

  /// One of `confirmed | likely | possible | fallback` — carried on the
  /// `kuldevta_identify_succeeded` event as `tier`. NOT surfaced in the
  /// UI in v1.
  final String tier;

  /// Server-side tier-ladder keys (`alias`, `community`, `gotra`, etc.) —
  /// raw analytics / debugging fact, not consulted by any widget (spec
  /// §Reason card rendering).
  final List<String> matchedOn;

  /// Convenience — the boolean surfaced on
  /// `kuldevta_result_shown.image_variant` and used for the widget
  /// dispatch between hero variants.
  bool get hasImage => imageUrl != null && imageUrl!.isNotEmpty;

  /// Adapter from the generated Dart DTO. Kept on the domain projection so
  /// the repository is a two-line envelope-unwrap.
  factory KuldevtaResult.fromDto(KuldevtaIdentifyResponseData dto) {
    final rawImage = dto.imageUrl;
    return KuldevtaResult(
      slug: dto.slug,
      nameRoman: dto.nameRoman,
      nameDevanagari: dto.nameDevanagari,
      // `tryParse` returns null on an unexpected string; the server
      // guarantees `devi` | `devta` per `kuldevta-reasons.service.ts:27-30`,
      // so a null here is a server bug — default to `devta` so the UI
      // renders without crashing and analytics carry the raw string.
      gender: KuldevtaGender.tryParse(dto.gender) ?? KuldevtaGender.devta,
      imageUrl: rawImage.isEmpty ? null : rawImage,
      location: dto.location,
      reasons: List<String>.unmodifiable(dto.reasons),
      tier: dto.tier.value,
      matchedOn: List<String>.unmodifiable(dto.matchedOn),
    );
  }

  @override
  List<Object?> get props => <Object?>[
        slug,
        nameRoman,
        nameDevanagari,
        gender,
        imageUrl,
        location,
        reasons,
        tier,
        matchedOn,
      ];
}
