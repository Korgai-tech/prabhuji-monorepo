//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class KuldevtaIdentifyResponseData {
  /// Returns a new [KuldevtaIdentifyResponseData] instance.
  KuldevtaIdentifyResponseData({
    required this.slug,
    required this.nameRoman,
    required this.nameDevanagari,
    required this.gender,
    required this.imageUrl,
    required this.location,
    this.reasons = const [],
    required this.temple,
    required this.tier,
    this.matchedOn = const [],
    this.candidates = const [],
  });

  String slug;

  String nameRoman;

  String nameDevanagari;

  String gender;

  String imageUrl;

  String? location;

  List<String> reasons;

  KuldevtaIdentifyResponseDataTemple temple;

  KuldevtaIdentifyResponseDataTierEnum tier;

  List<String> matchedOn;

  List<String> candidates;

  @override
  bool operator ==(Object other) => identical(this, other) || other is KuldevtaIdentifyResponseData &&
    other.slug == slug &&
    other.nameRoman == nameRoman &&
    other.nameDevanagari == nameDevanagari &&
    other.gender == gender &&
    other.imageUrl == imageUrl &&
    other.location == location &&
    _deepEquality.equals(other.reasons, reasons) &&
    other.temple == temple &&
    other.tier == tier &&
    _deepEquality.equals(other.matchedOn, matchedOn) &&
    _deepEquality.equals(other.candidates, candidates);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (slug.hashCode) +
    (nameRoman.hashCode) +
    (nameDevanagari.hashCode) +
    (gender.hashCode) +
    (imageUrl.hashCode) +
    (location == null ? 0 : location!.hashCode) +
    (reasons.hashCode) +
    (temple.hashCode) +
    (tier.hashCode) +
    (matchedOn.hashCode) +
    (candidates.hashCode);

  @override
  String toString() => 'KuldevtaIdentifyResponseData[slug=$slug, nameRoman=$nameRoman, nameDevanagari=$nameDevanagari, gender=$gender, imageUrl=$imageUrl, location=$location, reasons=$reasons, temple=$temple, tier=$tier, matchedOn=$matchedOn, candidates=$candidates]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'slug'] = this.slug;
      json[r'nameRoman'] = this.nameRoman;
      json[r'nameDevanagari'] = this.nameDevanagari;
      json[r'gender'] = this.gender;
      json[r'imageUrl'] = this.imageUrl;
    if (this.location != null) {
      json[r'location'] = this.location;
    } else {
      json[r'location'] = null;
    }
      json[r'reasons'] = this.reasons;
      json[r'temple'] = this.temple;
      json[r'tier'] = this.tier;
      json[r'matchedOn'] = this.matchedOn;
      json[r'candidates'] = this.candidates;
    return json;
  }

  /// Returns a new [KuldevtaIdentifyResponseData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static KuldevtaIdentifyResponseData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'slug'), 'Required key "KuldevtaIdentifyResponseData[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "KuldevtaIdentifyResponseData[slug]" has a null value in JSON.');
        assert(json.containsKey(r'nameRoman'), 'Required key "KuldevtaIdentifyResponseData[nameRoman]" is missing from JSON.');
        assert(json[r'nameRoman'] != null, 'Required key "KuldevtaIdentifyResponseData[nameRoman]" has a null value in JSON.');
        assert(json.containsKey(r'nameDevanagari'), 'Required key "KuldevtaIdentifyResponseData[nameDevanagari]" is missing from JSON.');
        assert(json[r'nameDevanagari'] != null, 'Required key "KuldevtaIdentifyResponseData[nameDevanagari]" has a null value in JSON.');
        assert(json.containsKey(r'gender'), 'Required key "KuldevtaIdentifyResponseData[gender]" is missing from JSON.');
        assert(json[r'gender'] != null, 'Required key "KuldevtaIdentifyResponseData[gender]" has a null value in JSON.');
        assert(json.containsKey(r'imageUrl'), 'Required key "KuldevtaIdentifyResponseData[imageUrl]" is missing from JSON.');
        assert(json[r'imageUrl'] != null, 'Required key "KuldevtaIdentifyResponseData[imageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'location'), 'Required key "KuldevtaIdentifyResponseData[location]" is missing from JSON.');
        assert(json.containsKey(r'reasons'), 'Required key "KuldevtaIdentifyResponseData[reasons]" is missing from JSON.');
        assert(json[r'reasons'] != null, 'Required key "KuldevtaIdentifyResponseData[reasons]" has a null value in JSON.');
        assert(json.containsKey(r'temple'), 'Required key "KuldevtaIdentifyResponseData[temple]" is missing from JSON.');
        assert(json[r'temple'] != null, 'Required key "KuldevtaIdentifyResponseData[temple]" has a null value in JSON.');
        assert(json.containsKey(r'tier'), 'Required key "KuldevtaIdentifyResponseData[tier]" is missing from JSON.');
        assert(json[r'tier'] != null, 'Required key "KuldevtaIdentifyResponseData[tier]" has a null value in JSON.');
        assert(json.containsKey(r'matchedOn'), 'Required key "KuldevtaIdentifyResponseData[matchedOn]" is missing from JSON.');
        assert(json[r'matchedOn'] != null, 'Required key "KuldevtaIdentifyResponseData[matchedOn]" has a null value in JSON.');
        return true;
      }());

      return KuldevtaIdentifyResponseData(
        slug: mapValueOfType<String>(json, r'slug')!,
        nameRoman: mapValueOfType<String>(json, r'nameRoman')!,
        nameDevanagari: mapValueOfType<String>(json, r'nameDevanagari')!,
        gender: mapValueOfType<String>(json, r'gender')!,
        imageUrl: mapValueOfType<String>(json, r'imageUrl')!,
        location: mapValueOfType<String>(json, r'location'),
        reasons: json[r'reasons'] is Iterable
            ? (json[r'reasons'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        temple: KuldevtaIdentifyResponseDataTemple.fromJson(json[r'temple'])!,
        tier: KuldevtaIdentifyResponseDataTierEnum.fromJson(json[r'tier'])!,
        matchedOn: json[r'matchedOn'] is Iterable
            ? (json[r'matchedOn'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        candidates: json[r'candidates'] is Iterable
            ? (json[r'candidates'] as Iterable).cast<String>().toList(growable: false)
            : const [],
      );
    }
    return null;
  }

  static List<KuldevtaIdentifyResponseData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <KuldevtaIdentifyResponseData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = KuldevtaIdentifyResponseData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, KuldevtaIdentifyResponseData> mapFromJson(dynamic json) {
    final map = <String, KuldevtaIdentifyResponseData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = KuldevtaIdentifyResponseData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of KuldevtaIdentifyResponseData-objects as value to a dart map
  static Map<String, List<KuldevtaIdentifyResponseData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<KuldevtaIdentifyResponseData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = KuldevtaIdentifyResponseData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'slug',
    'nameRoman',
    'nameDevanagari',
    'gender',
    'imageUrl',
    'location',
    'reasons',
    'temple',
    'tier',
    'matchedOn',
  };
}


class KuldevtaIdentifyResponseDataTierEnum {
  /// Instantiate a new enum with the provided [value].
  const KuldevtaIdentifyResponseDataTierEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const confirmed = KuldevtaIdentifyResponseDataTierEnum._(r'confirmed');
  static const likely = KuldevtaIdentifyResponseDataTierEnum._(r'likely');
  static const possible = KuldevtaIdentifyResponseDataTierEnum._(r'possible');
  static const fallback = KuldevtaIdentifyResponseDataTierEnum._(r'fallback');

  /// List of all possible values in this [enum][KuldevtaIdentifyResponseDataTierEnum].
  static const values = <KuldevtaIdentifyResponseDataTierEnum>[
    confirmed,
    likely,
    possible,
    fallback,
  ];

  static KuldevtaIdentifyResponseDataTierEnum? fromJson(dynamic value) => KuldevtaIdentifyResponseDataTierEnumTypeTransformer().decode(value);

  static List<KuldevtaIdentifyResponseDataTierEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <KuldevtaIdentifyResponseDataTierEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = KuldevtaIdentifyResponseDataTierEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [KuldevtaIdentifyResponseDataTierEnum] to String,
/// and [decode] dynamic data back to [KuldevtaIdentifyResponseDataTierEnum].
class KuldevtaIdentifyResponseDataTierEnumTypeTransformer {
  factory KuldevtaIdentifyResponseDataTierEnumTypeTransformer() => _instance ??= const KuldevtaIdentifyResponseDataTierEnumTypeTransformer._();

  const KuldevtaIdentifyResponseDataTierEnumTypeTransformer._();

  String encode(KuldevtaIdentifyResponseDataTierEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a KuldevtaIdentifyResponseDataTierEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  KuldevtaIdentifyResponseDataTierEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'confirmed': return KuldevtaIdentifyResponseDataTierEnum.confirmed;
        case r'likely': return KuldevtaIdentifyResponseDataTierEnum.likely;
        case r'possible': return KuldevtaIdentifyResponseDataTierEnum.possible;
        case r'fallback': return KuldevtaIdentifyResponseDataTierEnum.fallback;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [KuldevtaIdentifyResponseDataTierEnumTypeTransformer] instance.
  static KuldevtaIdentifyResponseDataTierEnumTypeTransformer? _instance;
}


