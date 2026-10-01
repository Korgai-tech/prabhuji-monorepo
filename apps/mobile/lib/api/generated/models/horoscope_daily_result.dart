//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HoroscopeDailyResult {
  /// Returns a new [HoroscopeDailyResult] instance.
  HoroscopeDailyResult({
    required this.zodiacId,
    required this.dateIst,
    required this.localeServed,
    required this.fallbackUsed,
    this.steps = const [],
    required this.media,
  });

  HoroscopeDailyResultZodiacIdEnum zodiacId;

  String dateIst;

  String localeServed;

  bool fallbackUsed;

  List<HoroscopeDailyStep> steps;

  HoroscopeMedia media;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HoroscopeDailyResult &&
    other.zodiacId == zodiacId &&
    other.dateIst == dateIst &&
    other.localeServed == localeServed &&
    other.fallbackUsed == fallbackUsed &&
    _deepEquality.equals(other.steps, steps) &&
    other.media == media;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (zodiacId.hashCode) +
    (dateIst.hashCode) +
    (localeServed.hashCode) +
    (fallbackUsed.hashCode) +
    (steps.hashCode) +
    (media.hashCode);

  @override
  String toString() => 'HoroscopeDailyResult[zodiacId=$zodiacId, dateIst=$dateIst, localeServed=$localeServed, fallbackUsed=$fallbackUsed, steps=$steps, media=$media]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'zodiacId'] = this.zodiacId;
      json[r'dateIst'] = this.dateIst;
      json[r'localeServed'] = this.localeServed;
      json[r'fallbackUsed'] = this.fallbackUsed;
      json[r'steps'] = this.steps;
      json[r'media'] = this.media;
    return json;
  }

  /// Returns a new [HoroscopeDailyResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HoroscopeDailyResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'zodiacId'), 'Required key "HoroscopeDailyResult[zodiacId]" is missing from JSON.');
        assert(json[r'zodiacId'] != null, 'Required key "HoroscopeDailyResult[zodiacId]" has a null value in JSON.');
        assert(json.containsKey(r'dateIst'), 'Required key "HoroscopeDailyResult[dateIst]" is missing from JSON.');
        assert(json[r'dateIst'] != null, 'Required key "HoroscopeDailyResult[dateIst]" has a null value in JSON.');
        assert(json.containsKey(r'localeServed'), 'Required key "HoroscopeDailyResult[localeServed]" is missing from JSON.');
        assert(json[r'localeServed'] != null, 'Required key "HoroscopeDailyResult[localeServed]" has a null value in JSON.');
        assert(json.containsKey(r'fallbackUsed'), 'Required key "HoroscopeDailyResult[fallbackUsed]" is missing from JSON.');
        assert(json[r'fallbackUsed'] != null, 'Required key "HoroscopeDailyResult[fallbackUsed]" has a null value in JSON.');
        assert(json.containsKey(r'steps'), 'Required key "HoroscopeDailyResult[steps]" is missing from JSON.');
        assert(json[r'steps'] != null, 'Required key "HoroscopeDailyResult[steps]" has a null value in JSON.');
        assert(json.containsKey(r'media'), 'Required key "HoroscopeDailyResult[media]" is missing from JSON.');
        assert(json[r'media'] != null, 'Required key "HoroscopeDailyResult[media]" has a null value in JSON.');
        return true;
      }());

      return HoroscopeDailyResult(
        zodiacId: HoroscopeDailyResultZodiacIdEnum.fromJson(json[r'zodiacId'])!,
        dateIst: mapValueOfType<String>(json, r'dateIst')!,
        localeServed: mapValueOfType<String>(json, r'localeServed')!,
        fallbackUsed: mapValueOfType<bool>(json, r'fallbackUsed')!,
        steps: HoroscopeDailyStep.listFromJson(json[r'steps']),
        media: HoroscopeMedia.fromJson(json[r'media'])!,
      );
    }
    return null;
  }

  static List<HoroscopeDailyResult> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeDailyResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeDailyResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HoroscopeDailyResult> mapFromJson(dynamic json) {
    final map = <String, HoroscopeDailyResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HoroscopeDailyResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HoroscopeDailyResult-objects as value to a dart map
  static Map<String, List<HoroscopeDailyResult>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HoroscopeDailyResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HoroscopeDailyResult.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'zodiacId',
    'dateIst',
    'localeServed',
    'fallbackUsed',
    'steps',
    'media',
  };
}


class HoroscopeDailyResultZodiacIdEnum {
  /// Instantiate a new enum with the provided [value].
  const HoroscopeDailyResultZodiacIdEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const aries = HoroscopeDailyResultZodiacIdEnum._(r'aries');
  static const taurus = HoroscopeDailyResultZodiacIdEnum._(r'taurus');
  static const gemini = HoroscopeDailyResultZodiacIdEnum._(r'gemini');
  static const cancer = HoroscopeDailyResultZodiacIdEnum._(r'cancer');
  static const leo = HoroscopeDailyResultZodiacIdEnum._(r'leo');
  static const virgo = HoroscopeDailyResultZodiacIdEnum._(r'virgo');
  static const libra = HoroscopeDailyResultZodiacIdEnum._(r'libra');
  static const scorpio = HoroscopeDailyResultZodiacIdEnum._(r'scorpio');
  static const sagittarius = HoroscopeDailyResultZodiacIdEnum._(r'sagittarius');
  static const capricorn = HoroscopeDailyResultZodiacIdEnum._(r'capricorn');
  static const aquarius = HoroscopeDailyResultZodiacIdEnum._(r'aquarius');
  static const pisces = HoroscopeDailyResultZodiacIdEnum._(r'pisces');

  /// List of all possible values in this [enum][HoroscopeDailyResultZodiacIdEnum].
  static const values = <HoroscopeDailyResultZodiacIdEnum>[
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

  static HoroscopeDailyResultZodiacIdEnum? fromJson(dynamic value) => HoroscopeDailyResultZodiacIdEnumTypeTransformer().decode(value);

  static List<HoroscopeDailyResultZodiacIdEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeDailyResultZodiacIdEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeDailyResultZodiacIdEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HoroscopeDailyResultZodiacIdEnum] to String,
/// and [decode] dynamic data back to [HoroscopeDailyResultZodiacIdEnum].
class HoroscopeDailyResultZodiacIdEnumTypeTransformer {
  factory HoroscopeDailyResultZodiacIdEnumTypeTransformer() => _instance ??= const HoroscopeDailyResultZodiacIdEnumTypeTransformer._();

  const HoroscopeDailyResultZodiacIdEnumTypeTransformer._();

  String encode(HoroscopeDailyResultZodiacIdEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HoroscopeDailyResultZodiacIdEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HoroscopeDailyResultZodiacIdEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'aries': return HoroscopeDailyResultZodiacIdEnum.aries;
        case r'taurus': return HoroscopeDailyResultZodiacIdEnum.taurus;
        case r'gemini': return HoroscopeDailyResultZodiacIdEnum.gemini;
        case r'cancer': return HoroscopeDailyResultZodiacIdEnum.cancer;
        case r'leo': return HoroscopeDailyResultZodiacIdEnum.leo;
        case r'virgo': return HoroscopeDailyResultZodiacIdEnum.virgo;
        case r'libra': return HoroscopeDailyResultZodiacIdEnum.libra;
        case r'scorpio': return HoroscopeDailyResultZodiacIdEnum.scorpio;
        case r'sagittarius': return HoroscopeDailyResultZodiacIdEnum.sagittarius;
        case r'capricorn': return HoroscopeDailyResultZodiacIdEnum.capricorn;
        case r'aquarius': return HoroscopeDailyResultZodiacIdEnum.aquarius;
        case r'pisces': return HoroscopeDailyResultZodiacIdEnum.pisces;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HoroscopeDailyResultZodiacIdEnumTypeTransformer] instance.
  static HoroscopeDailyResultZodiacIdEnumTypeTransformer? _instance;
}


