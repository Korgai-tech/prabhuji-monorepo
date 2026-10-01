//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HoroscopeDailyResultInput {
  /// Returns a new [HoroscopeDailyResultInput] instance.
  HoroscopeDailyResultInput({
    required this.zodiacId,
    required this.dateIst,
    required this.localeServed,
    required this.fallbackUsed,
    this.steps = const [],
    required this.media,
  });

  HoroscopeDailyResultInputZodiacIdEnum zodiacId;

  String dateIst;

  String localeServed;

  bool fallbackUsed;

  List<HoroscopeDailyStepInput> steps;

  HoroscopeMediaInput media;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HoroscopeDailyResultInput &&
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
  String toString() => 'HoroscopeDailyResultInput[zodiacId=$zodiacId, dateIst=$dateIst, localeServed=$localeServed, fallbackUsed=$fallbackUsed, steps=$steps, media=$media]';

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

  /// Returns a new [HoroscopeDailyResultInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HoroscopeDailyResultInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'zodiacId'), 'Required key "HoroscopeDailyResultInput[zodiacId]" is missing from JSON.');
        assert(json[r'zodiacId'] != null, 'Required key "HoroscopeDailyResultInput[zodiacId]" has a null value in JSON.');
        assert(json.containsKey(r'dateIst'), 'Required key "HoroscopeDailyResultInput[dateIst]" is missing from JSON.');
        assert(json[r'dateIst'] != null, 'Required key "HoroscopeDailyResultInput[dateIst]" has a null value in JSON.');
        assert(json.containsKey(r'localeServed'), 'Required key "HoroscopeDailyResultInput[localeServed]" is missing from JSON.');
        assert(json[r'localeServed'] != null, 'Required key "HoroscopeDailyResultInput[localeServed]" has a null value in JSON.');
        assert(json.containsKey(r'fallbackUsed'), 'Required key "HoroscopeDailyResultInput[fallbackUsed]" is missing from JSON.');
        assert(json[r'fallbackUsed'] != null, 'Required key "HoroscopeDailyResultInput[fallbackUsed]" has a null value in JSON.');
        assert(json.containsKey(r'steps'), 'Required key "HoroscopeDailyResultInput[steps]" is missing from JSON.');
        assert(json[r'steps'] != null, 'Required key "HoroscopeDailyResultInput[steps]" has a null value in JSON.');
        assert(json.containsKey(r'media'), 'Required key "HoroscopeDailyResultInput[media]" is missing from JSON.');
        assert(json[r'media'] != null, 'Required key "HoroscopeDailyResultInput[media]" has a null value in JSON.');
        return true;
      }());

      return HoroscopeDailyResultInput(
        zodiacId: HoroscopeDailyResultInputZodiacIdEnum.fromJson(json[r'zodiacId'])!,
        dateIst: mapValueOfType<String>(json, r'dateIst')!,
        localeServed: mapValueOfType<String>(json, r'localeServed')!,
        fallbackUsed: mapValueOfType<bool>(json, r'fallbackUsed')!,
        steps: HoroscopeDailyStepInput.listFromJson(json[r'steps']),
        media: HoroscopeMediaInput.fromJson(json[r'media'])!,
      );
    }
    return null;
  }

  static List<HoroscopeDailyResultInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeDailyResultInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeDailyResultInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HoroscopeDailyResultInput> mapFromJson(dynamic json) {
    final map = <String, HoroscopeDailyResultInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HoroscopeDailyResultInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HoroscopeDailyResultInput-objects as value to a dart map
  static Map<String, List<HoroscopeDailyResultInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HoroscopeDailyResultInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HoroscopeDailyResultInput.listFromJson(entry.value, growable: growable,);
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


class HoroscopeDailyResultInputZodiacIdEnum {
  /// Instantiate a new enum with the provided [value].
  const HoroscopeDailyResultInputZodiacIdEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const aries = HoroscopeDailyResultInputZodiacIdEnum._(r'aries');
  static const taurus = HoroscopeDailyResultInputZodiacIdEnum._(r'taurus');
  static const gemini = HoroscopeDailyResultInputZodiacIdEnum._(r'gemini');
  static const cancer = HoroscopeDailyResultInputZodiacIdEnum._(r'cancer');
  static const leo = HoroscopeDailyResultInputZodiacIdEnum._(r'leo');
  static const virgo = HoroscopeDailyResultInputZodiacIdEnum._(r'virgo');
  static const libra = HoroscopeDailyResultInputZodiacIdEnum._(r'libra');
  static const scorpio = HoroscopeDailyResultInputZodiacIdEnum._(r'scorpio');
  static const sagittarius = HoroscopeDailyResultInputZodiacIdEnum._(r'sagittarius');
  static const capricorn = HoroscopeDailyResultInputZodiacIdEnum._(r'capricorn');
  static const aquarius = HoroscopeDailyResultInputZodiacIdEnum._(r'aquarius');
  static const pisces = HoroscopeDailyResultInputZodiacIdEnum._(r'pisces');

  /// List of all possible values in this [enum][HoroscopeDailyResultInputZodiacIdEnum].
  static const values = <HoroscopeDailyResultInputZodiacIdEnum>[
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

  static HoroscopeDailyResultInputZodiacIdEnum? fromJson(dynamic value) => HoroscopeDailyResultInputZodiacIdEnumTypeTransformer().decode(value);

  static List<HoroscopeDailyResultInputZodiacIdEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeDailyResultInputZodiacIdEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeDailyResultInputZodiacIdEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HoroscopeDailyResultInputZodiacIdEnum] to String,
/// and [decode] dynamic data back to [HoroscopeDailyResultInputZodiacIdEnum].
class HoroscopeDailyResultInputZodiacIdEnumTypeTransformer {
  factory HoroscopeDailyResultInputZodiacIdEnumTypeTransformer() => _instance ??= const HoroscopeDailyResultInputZodiacIdEnumTypeTransformer._();

  const HoroscopeDailyResultInputZodiacIdEnumTypeTransformer._();

  String encode(HoroscopeDailyResultInputZodiacIdEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HoroscopeDailyResultInputZodiacIdEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HoroscopeDailyResultInputZodiacIdEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'aries': return HoroscopeDailyResultInputZodiacIdEnum.aries;
        case r'taurus': return HoroscopeDailyResultInputZodiacIdEnum.taurus;
        case r'gemini': return HoroscopeDailyResultInputZodiacIdEnum.gemini;
        case r'cancer': return HoroscopeDailyResultInputZodiacIdEnum.cancer;
        case r'leo': return HoroscopeDailyResultInputZodiacIdEnum.leo;
        case r'virgo': return HoroscopeDailyResultInputZodiacIdEnum.virgo;
        case r'libra': return HoroscopeDailyResultInputZodiacIdEnum.libra;
        case r'scorpio': return HoroscopeDailyResultInputZodiacIdEnum.scorpio;
        case r'sagittarius': return HoroscopeDailyResultInputZodiacIdEnum.sagittarius;
        case r'capricorn': return HoroscopeDailyResultInputZodiacIdEnum.capricorn;
        case r'aquarius': return HoroscopeDailyResultInputZodiacIdEnum.aquarius;
        case r'pisces': return HoroscopeDailyResultInputZodiacIdEnum.pisces;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HoroscopeDailyResultInputZodiacIdEnumTypeTransformer] instance.
  static HoroscopeDailyResultInputZodiacIdEnumTypeTransformer? _instance;
}


