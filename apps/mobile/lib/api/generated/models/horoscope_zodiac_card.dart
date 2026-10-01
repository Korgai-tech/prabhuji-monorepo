//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HoroscopeZodiacCard {
  /// Returns a new [HoroscopeZodiacCard] instance.
  HoroscopeZodiacCard({
    required this.zodiacId,
    required this.displayName,
    required this.sortOrder,
  });

  HoroscopeZodiacCardZodiacIdEnum zodiacId;

  String displayName;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HoroscopeZodiacCard &&
    other.zodiacId == zodiacId &&
    other.displayName == displayName &&
    other.sortOrder == sortOrder;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (zodiacId.hashCode) +
    (displayName.hashCode) +
    (sortOrder.hashCode);

  @override
  String toString() => 'HoroscopeZodiacCard[zodiacId=$zodiacId, displayName=$displayName, sortOrder=$sortOrder]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'zodiacId'] = this.zodiacId;
      json[r'displayName'] = this.displayName;
      json[r'sortOrder'] = this.sortOrder;
    return json;
  }

  /// Returns a new [HoroscopeZodiacCard] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HoroscopeZodiacCard? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'zodiacId'), 'Required key "HoroscopeZodiacCard[zodiacId]" is missing from JSON.');
        assert(json[r'zodiacId'] != null, 'Required key "HoroscopeZodiacCard[zodiacId]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'), 'Required key "HoroscopeZodiacCard[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null, 'Required key "HoroscopeZodiacCard[displayName]" has a null value in JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "HoroscopeZodiacCard[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "HoroscopeZodiacCard[sortOrder]" has a null value in JSON.');
        return true;
      }());

      return HoroscopeZodiacCard(
        zodiacId: HoroscopeZodiacCardZodiacIdEnum.fromJson(json[r'zodiacId'])!,
        displayName: mapValueOfType<String>(json, r'displayName')!,
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
      );
    }
    return null;
  }

  static List<HoroscopeZodiacCard> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeZodiacCard>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeZodiacCard.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HoroscopeZodiacCard> mapFromJson(dynamic json) {
    final map = <String, HoroscopeZodiacCard>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HoroscopeZodiacCard.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HoroscopeZodiacCard-objects as value to a dart map
  static Map<String, List<HoroscopeZodiacCard>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HoroscopeZodiacCard>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HoroscopeZodiacCard.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'zodiacId',
    'displayName',
    'sortOrder',
  };
}


class HoroscopeZodiacCardZodiacIdEnum {
  /// Instantiate a new enum with the provided [value].
  const HoroscopeZodiacCardZodiacIdEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const aries = HoroscopeZodiacCardZodiacIdEnum._(r'aries');
  static const taurus = HoroscopeZodiacCardZodiacIdEnum._(r'taurus');
  static const gemini = HoroscopeZodiacCardZodiacIdEnum._(r'gemini');
  static const cancer = HoroscopeZodiacCardZodiacIdEnum._(r'cancer');
  static const leo = HoroscopeZodiacCardZodiacIdEnum._(r'leo');
  static const virgo = HoroscopeZodiacCardZodiacIdEnum._(r'virgo');
  static const libra = HoroscopeZodiacCardZodiacIdEnum._(r'libra');
  static const scorpio = HoroscopeZodiacCardZodiacIdEnum._(r'scorpio');
  static const sagittarius = HoroscopeZodiacCardZodiacIdEnum._(r'sagittarius');
  static const capricorn = HoroscopeZodiacCardZodiacIdEnum._(r'capricorn');
  static const aquarius = HoroscopeZodiacCardZodiacIdEnum._(r'aquarius');
  static const pisces = HoroscopeZodiacCardZodiacIdEnum._(r'pisces');

  /// List of all possible values in this [enum][HoroscopeZodiacCardZodiacIdEnum].
  static const values = <HoroscopeZodiacCardZodiacIdEnum>[
    aries,
    taurus,
    gemini,
    cancer,
    leo,
    virgo,
    libra,
    scorpio,
    sagittarius,
    capricorn,
    aquarius,
    pisces,
  ];

  static HoroscopeZodiacCardZodiacIdEnum? fromJson(dynamic value) => HoroscopeZodiacCardZodiacIdEnumTypeTransformer().decode(value);

  static List<HoroscopeZodiacCardZodiacIdEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeZodiacCardZodiacIdEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeZodiacCardZodiacIdEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HoroscopeZodiacCardZodiacIdEnum] to String,
/// and [decode] dynamic data back to [HoroscopeZodiacCardZodiacIdEnum].
class HoroscopeZodiacCardZodiacIdEnumTypeTransformer {
  factory HoroscopeZodiacCardZodiacIdEnumTypeTransformer() => _instance ??= const HoroscopeZodiacCardZodiacIdEnumTypeTransformer._();

  const HoroscopeZodiacCardZodiacIdEnumTypeTransformer._();

  String encode(HoroscopeZodiacCardZodiacIdEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HoroscopeZodiacCardZodiacIdEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HoroscopeZodiacCardZodiacIdEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'aries': return HoroscopeZodiacCardZodiacIdEnum.aries;
        case r'taurus': return HoroscopeZodiacCardZodiacIdEnum.taurus;
        case r'gemini': return HoroscopeZodiacCardZodiacIdEnum.gemini;
        case r'cancer': return HoroscopeZodiacCardZodiacIdEnum.cancer;
        case r'leo': return HoroscopeZodiacCardZodiacIdEnum.leo;
        case r'virgo': return HoroscopeZodiacCardZodiacIdEnum.virgo;
        case r'libra': return HoroscopeZodiacCardZodiacIdEnum.libra;
        case r'scorpio': return HoroscopeZodiacCardZodiacIdEnum.scorpio;
        case r'sagittarius': return HoroscopeZodiacCardZodiacIdEnum.sagittarius;
        case r'capricorn': return HoroscopeZodiacCardZodiacIdEnum.capricorn;
        case r'aquarius': return HoroscopeZodiacCardZodiacIdEnum.aquarius;
        case r'pisces': return HoroscopeZodiacCardZodiacIdEnum.pisces;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HoroscopeZodiacCardZodiacIdEnumTypeTransformer] instance.
  static HoroscopeZodiacCardZodiacIdEnumTypeTransformer? _instance;
}


