//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HoroscopeDailyStepInput {
  /// Returns a new [HoroscopeDailyStepInput] instance.
  HoroscopeDailyStepInput({
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

  HoroscopeDailyStepInputContentTypeEnum contentType;

  bool ttsEnabled;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HoroscopeDailyStepInput &&
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
  String toString() => 'HoroscopeDailyStepInput[stepId=$stepId, title=$title, displayText=$displayText, ttsText=$ttsText, order=$order, contentType=$contentType, ttsEnabled=$ttsEnabled]';

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

  /// Returns a new [HoroscopeDailyStepInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HoroscopeDailyStepInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'stepId'), 'Required key "HoroscopeDailyStepInput[stepId]" is missing from JSON.');
        assert(json[r'stepId'] != null, 'Required key "HoroscopeDailyStepInput[stepId]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "HoroscopeDailyStepInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "HoroscopeDailyStepInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'displayText'), 'Required key "HoroscopeDailyStepInput[displayText]" is missing from JSON.');
        assert(json[r'displayText'] != null, 'Required key "HoroscopeDailyStepInput[displayText]" has a null value in JSON.');
        assert(json.containsKey(r'ttsText'), 'Required key "HoroscopeDailyStepInput[ttsText]" is missing from JSON.');
        assert(json[r'ttsText'] != null, 'Required key "HoroscopeDailyStepInput[ttsText]" has a null value in JSON.');
        assert(json.containsKey(r'order'), 'Required key "HoroscopeDailyStepInput[order]" is missing from JSON.');
        assert(json[r'order'] != null, 'Required key "HoroscopeDailyStepInput[order]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'), 'Required key "HoroscopeDailyStepInput[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "HoroscopeDailyStepInput[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'ttsEnabled'), 'Required key "HoroscopeDailyStepInput[ttsEnabled]" is missing from JSON.');
        assert(json[r'ttsEnabled'] != null, 'Required key "HoroscopeDailyStepInput[ttsEnabled]" has a null value in JSON.');
        return true;
      }());

      return HoroscopeDailyStepInput(
        stepId: mapValueOfType<String>(json, r'stepId')!,
        title: mapValueOfType<String>(json, r'title')!,
        displayText: mapValueOfType<String>(json, r'displayText')!,
        ttsText: mapValueOfType<String>(json, r'ttsText')!,
        order: mapValueOfType<int>(json, r'order')!,
        contentType: HoroscopeDailyStepInputContentTypeEnum.fromJson(json[r'contentType'])!,
        ttsEnabled: mapValueOfType<bool>(json, r'ttsEnabled')!,
      );
    }
    return null;
  }

  static List<HoroscopeDailyStepInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeDailyStepInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeDailyStepInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HoroscopeDailyStepInput> mapFromJson(dynamic json) {
    final map = <String, HoroscopeDailyStepInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HoroscopeDailyStepInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HoroscopeDailyStepInput-objects as value to a dart map
  static Map<String, List<HoroscopeDailyStepInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HoroscopeDailyStepInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HoroscopeDailyStepInput.listFromJson(entry.value, growable: growable,);
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


class HoroscopeDailyStepInputContentTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const HoroscopeDailyStepInputContentTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const text = HoroscopeDailyStepInputContentTypeEnum._(r'text');
  static const number = HoroscopeDailyStepInputContentTypeEnum._(r'number');
  static const color = HoroscopeDailyStepInputContentTypeEnum._(r'color');

  /// List of all possible values in this [enum][HoroscopeDailyStepInputContentTypeEnum].
  static const values = <HoroscopeDailyStepInputContentTypeEnum>[
    text,
    number,
    color,
  ];

  static HoroscopeDailyStepInputContentTypeEnum? fromJson(dynamic value) => HoroscopeDailyStepInputContentTypeEnumTypeTransformer().decode(value);

  static List<HoroscopeDailyStepInputContentTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeDailyStepInputContentTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeDailyStepInputContentTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HoroscopeDailyStepInputContentTypeEnum] to String,
/// and [decode] dynamic data back to [HoroscopeDailyStepInputContentTypeEnum].
class HoroscopeDailyStepInputContentTypeEnumTypeTransformer {
  factory HoroscopeDailyStepInputContentTypeEnumTypeTransformer() => _instance ??= const HoroscopeDailyStepInputContentTypeEnumTypeTransformer._();

  const HoroscopeDailyStepInputContentTypeEnumTypeTransformer._();

  String encode(HoroscopeDailyStepInputContentTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HoroscopeDailyStepInputContentTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HoroscopeDailyStepInputContentTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'text': return HoroscopeDailyStepInputContentTypeEnum.text;
        case r'number': return HoroscopeDailyStepInputContentTypeEnum.number;
        case r'color': return HoroscopeDailyStepInputContentTypeEnum.color;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HoroscopeDailyStepInputContentTypeEnumTypeTransformer] instance.
  static HoroscopeDailyStepInputContentTypeEnumTypeTransformer? _instance;
}


