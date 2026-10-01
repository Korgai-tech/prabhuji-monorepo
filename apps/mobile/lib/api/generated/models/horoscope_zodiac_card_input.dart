//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HoroscopeZodiacCardInput {
  /// Returns a new [HoroscopeZodiacCardInput] instance.
  HoroscopeZodiacCardInput({
    required this.zodiacId,
    required this.displayName,
    required this.sortOrder,
  });

  HoroscopeZodiacCardInputZodiacIdEnum zodiacId;

  String displayName;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HoroscopeZodiacCardInput &&
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
  String toString() => 'HoroscopeZodiacCardInput[zodiacId=$zodiacId, displayName=$displayName, sortOrder=$sortOrder]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'zodiacId'] = this.zodiacId;
      json[r'displayName'] = this.displayName;
      json[r'sortOrder'] = this.sortOrder;
    return json;
  }

  /// Returns a new [HoroscopeZodiacCardInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HoroscopeZodiacCardInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'zodiacId'), 'Required key "HoroscopeZodiacCardInput[zodiacId]" is missing from JSON.');
        assert(json[r'zodiacId'] != null, 'Required key "HoroscopeZodiacCardInput[zodiacId]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'), 'Required key "HoroscopeZodiacCardInput[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null, 'Required key "HoroscopeZodiacCardInput[displayName]" has a null value in JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "HoroscopeZodiacCardInput[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "HoroscopeZodiacCardInput[sortOrder]" has a null value in JSON.');
        return true;
      }());

      return HoroscopeZodiacCardInput(
        zodiacId: HoroscopeZodiacCardInputZodiacIdEnum.fromJson(json[r'zodiacId'])!,
        displayName: mapValueOfType<String>(json, r'displayName')!,
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
      );
    }
    return null;
  }

  static List<HoroscopeZodiacCardInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeZodiacCardInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeZodiacCardInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HoroscopeZodiacCardInput> mapFromJson(dynamic json) {
    final map = <String, HoroscopeZodiacCardInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HoroscopeZodiacCardInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HoroscopeZodiacCardInput-objects as value to a dart map
  static Map<String, List<HoroscopeZodiacCardInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HoroscopeZodiacCardInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HoroscopeZodiacCardInput.listFromJson(entry.value, growable: growable,);
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


class HoroscopeZodiacCardInputZodiacIdEnum {
  /// Instantiate a new enum with the provided [value].
  const HoroscopeZodiacCardInputZodiacIdEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const aries = HoroscopeZodiacCardInputZodiacIdEnum._(r'aries');
  static const taurus = HoroscopeZodiacCardInputZodiacIdEnum._(r'taurus');
  static const gemini = HoroscopeZodiacCardInputZodiacIdEnum._(r'gemini');
  static const cancer = HoroscopeZodiacCardInputZodiacIdEnum._(r'cancer');
  static const leo = HoroscopeZodiacCardInputZodiacIdEnum._(r'leo');
  static const virgo = HoroscopeZodiacCardInputZodiacIdEnum._(r'virgo');
  static const libra = HoroscopeZodiacCardInputZodiacIdEnum._(r'libra');
  static const scorpio = HoroscopeZodiacCardInputZodiacIdEnum._(r'scorpio');
  static const sagittarius = HoroscopeZodiacCardInputZodiacIdEnum._(r'sagittarius');
  static const capricorn = HoroscopeZodiacCardInputZodiacIdEnum._(r'capricorn');
  static const aquarius = HoroscopeZodiacCardInputZodiacIdEnum._(r'aquarius');
  static const pisces = HoroscopeZodiacCardInputZodiacIdEnum._(r'pisces');

  /// List of all possible values in this [enum][HoroscopeZodiacCardInputZodiacIdEnum].
  static const values = <HoroscopeZodiacCardInputZodiacIdEnum>[
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

  static HoroscopeZodiacCardInputZodiacIdEnum? fromJson(dynamic value) => HoroscopeZodiacCardInputZodiacIdEnumTypeTransformer().decode(value);

  static List<HoroscopeZodiacCardInputZodiacIdEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeZodiacCardInputZodiacIdEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeZodiacCardInputZodiacIdEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HoroscopeZodiacCardInputZodiacIdEnum] to String,
/// and [decode] dynamic data back to [HoroscopeZodiacCardInputZodiacIdEnum].
class HoroscopeZodiacCardInputZodiacIdEnumTypeTransformer {
  factory HoroscopeZodiacCardInputZodiacIdEnumTypeTransformer() => _instance ??= const HoroscopeZodiacCardInputZodiacIdEnumTypeTransformer._();

  const HoroscopeZodiacCardInputZodiacIdEnumTypeTransformer._();

  String encode(HoroscopeZodiacCardInputZodiacIdEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HoroscopeZodiacCardInputZodiacIdEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HoroscopeZodiacCardInputZodiacIdEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'aries': return HoroscopeZodiacCardInputZodiacIdEnum.aries;
        case r'taurus': return HoroscopeZodiacCardInputZodiacIdEnum.taurus;
        case r'gemini': return HoroscopeZodiacCardInputZodiacIdEnum.gemini;
        case r'cancer': return HoroscopeZodiacCardInputZodiacIdEnum.cancer;
        case r'leo': return HoroscopeZodiacCardInputZodiacIdEnum.leo;
        case r'virgo': return HoroscopeZodiacCardInputZodiacIdEnum.virgo;
        case r'libra': return HoroscopeZodiacCardInputZodiacIdEnum.libra;
        case r'scorpio': return HoroscopeZodiacCardInputZodiacIdEnum.scorpio;
        case r'sagittarius': return HoroscopeZodiacCardInputZodiacIdEnum.sagittarius;
        case r'capricorn': return HoroscopeZodiacCardInputZodiacIdEnum.capricorn;
        case r'aquarius': return HoroscopeZodiacCardInputZodiacIdEnum.aquarius;
        case r'pisces': return HoroscopeZodiacCardInputZodiacIdEnum.pisces;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HoroscopeZodiacCardInputZodiacIdEnumTypeTransformer] instance.
  static HoroscopeZodiacCardInputZodiacIdEnumTypeTransformer? _instance;
}


