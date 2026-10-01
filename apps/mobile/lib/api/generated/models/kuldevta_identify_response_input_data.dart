//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class KuldevtaIdentifyResponseInputData {
  /// Returns a new [KuldevtaIdentifyResponseInputData] instance.
  KuldevtaIdentifyResponseInputData({
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

  KuldevtaIdentifyResponseInputDataTemple temple;

  KuldevtaIdentifyResponseInputDataTierEnum tier;

  List<String> matchedOn;

  List<String> candidates;

  @override
  bool operator ==(Object other) => identical(this, other) || other is KuldevtaIdentifyResponseInputData &&
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
  String toString() => 'KuldevtaIdentifyResponseInputData[slug=$slug, nameRoman=$nameRoman, nameDevanagari=$nameDevanagari, gender=$gender, imageUrl=$imageUrl, location=$location, reasons=$reasons, temple=$temple, tier=$tier, matchedOn=$matchedOn, candidates=$candidates]';

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

  /// Returns a new [KuldevtaIdentifyResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static KuldevtaIdentifyResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'slug'), 'Required key "KuldevtaIdentifyResponseInputData[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "KuldevtaIdentifyResponseInputData[slug]" has a null value in JSON.');
        assert(json.containsKey(r'nameRoman'), 'Required key "KuldevtaIdentifyResponseInputData[nameRoman]" is missing from JSON.');
        assert(json[r'nameRoman'] != null, 'Required key "KuldevtaIdentifyResponseInputData[nameRoman]" has a null value in JSON.');
        assert(json.containsKey(r'nameDevanagari'), 'Required key "KuldevtaIdentifyResponseInputData[nameDevanagari]" is missing from JSON.');
        assert(json[r'nameDevanagari'] != null, 'Required key "KuldevtaIdentifyResponseInputData[nameDevanagari]" has a null value in JSON.');
        assert(json.containsKey(r'gender'), 'Required key "KuldevtaIdentifyResponseInputData[gender]" is missing from JSON.');
        assert(json[r'gender'] != null, 'Required key "KuldevtaIdentifyResponseInputData[gender]" has a null value in JSON.');
        assert(json.containsKey(r'imageUrl'), 'Required key "KuldevtaIdentifyResponseInputData[imageUrl]" is missing from JSON.');
        assert(json[r'imageUrl'] != null, 'Required key "KuldevtaIdentifyResponseInputData[imageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'location'), 'Required key "KuldevtaIdentifyResponseInputData[location]" is missing from JSON.');
        assert(json.containsKey(r'reasons'), 'Required key "KuldevtaIdentifyResponseInputData[reasons]" is missing from JSON.');
        assert(json[r'reasons'] != null, 'Required key "KuldevtaIdentifyResponseInputData[reasons]" has a null value in JSON.');
        assert(json.containsKey(r'temple'), 'Required key "KuldevtaIdentifyResponseInputData[temple]" is missing from JSON.');
        assert(json[r'temple'] != null, 'Required key "KuldevtaIdentifyResponseInputData[temple]" has a null value in JSON.');
        assert(json.containsKey(r'tier'), 'Required key "KuldevtaIdentifyResponseInputData[tier]" is missing from JSON.');
        assert(json[r'tier'] != null, 'Required key "KuldevtaIdentifyResponseInputData[tier]" has a null value in JSON.');
        assert(json.containsKey(r'matchedOn'), 'Required key "KuldevtaIdentifyResponseInputData[matchedOn]" is missing from JSON.');
        assert(json[r'matchedOn'] != null, 'Required key "KuldevtaIdentifyResponseInputData[matchedOn]" has a null value in JSON.');
        return true;
      }());

      return KuldevtaIdentifyResponseInputData(
        slug: mapValueOfType<String>(json, r'slug')!,
        nameRoman: mapValueOfType<String>(json, r'nameRoman')!,
        nameDevanagari: mapValueOfType<String>(json, r'nameDevanagari')!,
        gender: mapValueOfType<String>(json, r'gender')!,
        imageUrl: mapValueOfType<String>(json, r'imageUrl')!,
        location: mapValueOfType<String>(json, r'location'),
        reasons: json[r'reasons'] is Iterable
            ? (json[r'reasons'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        temple: KuldevtaIdentifyResponseInputDataTemple.fromJson(json[r'temple'])!,
        tier: KuldevtaIdentifyResponseInputDataTierEnum.fromJson(json[r'tier'])!,
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

  static List<KuldevtaIdentifyResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <KuldevtaIdentifyResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = KuldevtaIdentifyResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, KuldevtaIdentifyResponseInputData> mapFromJson(dynamic json) {
    final map = <String, KuldevtaIdentifyResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = KuldevtaIdentifyResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of KuldevtaIdentifyResponseInputData-objects as value to a dart map
  static Map<String, List<KuldevtaIdentifyResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<KuldevtaIdentifyResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = KuldevtaIdentifyResponseInputData.listFromJson(entry.value, growable: growable,);
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


class KuldevtaIdentifyResponseInputDataTierEnum {
  /// Instantiate a new enum with the provided [value].
  const KuldevtaIdentifyResponseInputDataTierEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const confirmed = KuldevtaIdentifyResponseInputDataTierEnum._(r'confirmed');
  static const likely = KuldevtaIdentifyResponseInputDataTierEnum._(r'likely');
  static const possible = KuldevtaIdentifyResponseInputDataTierEnum._(r'possible');
  static const fallback = KuldevtaIdentifyResponseInputDataTierEnum._(r'fallback');

  /// List of all possible values in this [enum][KuldevtaIdentifyResponseInputDataTierEnum].
  static const values = <KuldevtaIdentifyResponseInputDataTierEnum>[
    confirmed,
    likely,
    possible,
    fallback,
  ];

  static KuldevtaIdentifyResponseInputDataTierEnum? fromJson(dynamic value) => KuldevtaIdentifyResponseInputDataTierEnumTypeTransformer().decode(value);

  static List<KuldevtaIdentifyResponseInputDataTierEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <KuldevtaIdentifyResponseInputDataTierEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = KuldevtaIdentifyResponseInputDataTierEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [KuldevtaIdentifyResponseInputDataTierEnum] to String,
/// and [decode] dynamic data back to [KuldevtaIdentifyResponseInputDataTierEnum].
class KuldevtaIdentifyResponseInputDataTierEnumTypeTransformer {
  factory KuldevtaIdentifyResponseInputDataTierEnumTypeTransformer() => _instance ??= const KuldevtaIdentifyResponseInputDataTierEnumTypeTransformer._();

  const KuldevtaIdentifyResponseInputDataTierEnumTypeTransformer._();

  String encode(KuldevtaIdentifyResponseInputDataTierEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a KuldevtaIdentifyResponseInputDataTierEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  KuldevtaIdentifyResponseInputDataTierEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'confirmed': return KuldevtaIdentifyResponseInputDataTierEnum.confirmed;
        case r'likely': return KuldevtaIdentifyResponseInputDataTierEnum.likely;
        case r'possible': return KuldevtaIdentifyResponseInputDataTierEnum.possible;
        case r'fallback': return KuldevtaIdentifyResponseInputDataTierEnum.fallback;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [KuldevtaIdentifyResponseInputDataTierEnumTypeTransformer] instance.
  static KuldevtaIdentifyResponseInputDataTierEnumTypeTransformer? _instance;
}


