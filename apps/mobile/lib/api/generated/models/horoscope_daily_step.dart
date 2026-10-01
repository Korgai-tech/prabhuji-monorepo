//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HoroscopeDailyStep {
  /// Returns a new [HoroscopeDailyStep] instance.
  HoroscopeDailyStep({
    required this.stepId,
    required this.title,
    required this.displayText,
    required this.ttsText,
    required this.order,
    required this.contentType,
    required this.ttsEnabled,
  });

  String stepId;

  String title;

  String displayText;

  String ttsText;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int order;

  HoroscopeDailyStepContentTypeEnum contentType;

  bool ttsEnabled;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HoroscopeDailyStep &&
    other.stepId == stepId &&
    other.title == title &&
    other.displayText == displayText &&
    other.ttsText == ttsText &&
    other.order == order &&
    other.contentType == contentType &&
    other.ttsEnabled == ttsEnabled;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (stepId.hashCode) +
    (title.hashCode) +
    (displayText.hashCode) +
    (ttsText.hashCode) +
    (order.hashCode) +
    (contentType.hashCode) +
    (ttsEnabled.hashCode);

  @override
  String toString() => 'HoroscopeDailyStep[stepId=$stepId, title=$title, displayText=$displayText, ttsText=$ttsText, order=$order, contentType=$contentType, ttsEnabled=$ttsEnabled]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'stepId'] = this.stepId;
      json[r'title'] = this.title;
      json[r'displayText'] = this.displayText;
      json[r'ttsText'] = this.ttsText;
      json[r'order'] = this.order;
      json[r'contentType'] = this.contentType;
      json[r'ttsEnabled'] = this.ttsEnabled;
    return json;
  }

  /// Returns a new [HoroscopeDailyStep] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HoroscopeDailyStep? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'stepId'), 'Required key "HoroscopeDailyStep[stepId]" is missing from JSON.');
        assert(json[r'stepId'] != null, 'Required key "HoroscopeDailyStep[stepId]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "HoroscopeDailyStep[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "HoroscopeDailyStep[title]" has a null value in JSON.');
        assert(json.containsKey(r'displayText'), 'Required key "HoroscopeDailyStep[displayText]" is missing from JSON.');
        assert(json[r'displayText'] != null, 'Required key "HoroscopeDailyStep[displayText]" has a null value in JSON.');
        assert(json.containsKey(r'ttsText'), 'Required key "HoroscopeDailyStep[ttsText]" is missing from JSON.');
        assert(json[r'ttsText'] != null, 'Required key "HoroscopeDailyStep[ttsText]" has a null value in JSON.');
        assert(json.containsKey(r'order'), 'Required key "HoroscopeDailyStep[order]" is missing from JSON.');
        assert(json[r'order'] != null, 'Required key "HoroscopeDailyStep[order]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'), 'Required key "HoroscopeDailyStep[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "HoroscopeDailyStep[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'ttsEnabled'), 'Required key "HoroscopeDailyStep[ttsEnabled]" is missing from JSON.');
        assert(json[r'ttsEnabled'] != null, 'Required key "HoroscopeDailyStep[ttsEnabled]" has a null value in JSON.');
        return true;
      }());

      return HoroscopeDailyStep(
        stepId: mapValueOfType<String>(json, r'stepId')!,
        title: mapValueOfType<String>(json, r'title')!,
        displayText: mapValueOfType<String>(json, r'displayText')!,
        ttsText: mapValueOfType<String>(json, r'ttsText')!,
        order: mapValueOfType<int>(json, r'order')!,
        contentType: HoroscopeDailyStepContentTypeEnum.fromJson(json[r'contentType'])!,
        ttsEnabled: mapValueOfType<bool>(json, r'ttsEnabled')!,
      );
    }
    return null;
  }

  static List<HoroscopeDailyStep> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeDailyStep>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeDailyStep.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HoroscopeDailyStep> mapFromJson(dynamic json) {
    final map = <String, HoroscopeDailyStep>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HoroscopeDailyStep.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HoroscopeDailyStep-objects as value to a dart map
  static Map<String, List<HoroscopeDailyStep>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HoroscopeDailyStep>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HoroscopeDailyStep.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'stepId',
    'title',
    'displayText',
    'ttsText',
    'order',
    'contentType',
    'ttsEnabled',
  };
}


class HoroscopeDailyStepContentTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const HoroscopeDailyStepContentTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const text = HoroscopeDailyStepContentTypeEnum._(r'text');
  static const number = HoroscopeDailyStepContentTypeEnum._(r'number');
  static const color = HoroscopeDailyStepContentTypeEnum._(r'color');

  /// List of all possible values in this [enum][HoroscopeDailyStepContentTypeEnum].
  static const values = <HoroscopeDailyStepContentTypeEnum>[
    text,
    number,
    color,
  ];

  static HoroscopeDailyStepContentTypeEnum? fromJson(dynamic value) => HoroscopeDailyStepContentTypeEnumTypeTransformer().decode(value);

  static List<HoroscopeDailyStepContentTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeDailyStepContentTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeDailyStepContentTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HoroscopeDailyStepContentTypeEnum] to String,
/// and [decode] dynamic data back to [HoroscopeDailyStepContentTypeEnum].
class HoroscopeDailyStepContentTypeEnumTypeTransformer {
  factory HoroscopeDailyStepContentTypeEnumTypeTransformer() => _instance ??= const HoroscopeDailyStepContentTypeEnumTypeTransformer._();

  const HoroscopeDailyStepContentTypeEnumTypeTransformer._();

  String encode(HoroscopeDailyStepContentTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HoroscopeDailyStepContentTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HoroscopeDailyStepContentTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'text': return HoroscopeDailyStepContentTypeEnum.text;
        case r'number': return HoroscopeDailyStepContentTypeEnum.number;
        case r'color': return HoroscopeDailyStepContentTypeEnum.color;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HoroscopeDailyStepContentTypeEnumTypeTransformer] instance.
  static HoroscopeDailyStepContentTypeEnumTypeTransformer? _instance;
}


