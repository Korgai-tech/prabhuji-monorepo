//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RingtoneSetCountBodyInput {
  /// Returns a new [RingtoneSetCountBodyInput] instance.
  RingtoneSetCountBodyInput({
    required this.setTarget,
  });

  RingtoneSetCountBodyInputSetTargetEnum setTarget;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RingtoneSetCountBodyInput &&
    other.setTarget == setTarget;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (setTarget.hashCode);

  @override
  String toString() => 'RingtoneSetCountBodyInput[setTarget=$setTarget]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'setTarget'] = this.setTarget;
    return json;
  }

  /// Returns a new [RingtoneSetCountBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RingtoneSetCountBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'setTarget'), 'Required key "RingtoneSetCountBodyInput[setTarget]" is missing from JSON.');
        assert(json[r'setTarget'] != null, 'Required key "RingtoneSetCountBodyInput[setTarget]" has a null value in JSON.');
        return true;
      }());

      return RingtoneSetCountBodyInput(
        setTarget: RingtoneSetCountBodyInputSetTargetEnum.fromJson(json[r'setTarget'])!,
      );
    }
    return null;
  }

  static List<RingtoneSetCountBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RingtoneSetCountBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RingtoneSetCountBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RingtoneSetCountBodyInput> mapFromJson(dynamic json) {
    final map = <String, RingtoneSetCountBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RingtoneSetCountBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RingtoneSetCountBodyInput-objects as value to a dart map
  static Map<String, List<RingtoneSetCountBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RingtoneSetCountBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RingtoneSetCountBodyInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'setTarget',
  };
}


class RingtoneSetCountBodyInputSetTargetEnum {
  /// Instantiate a new enum with the provided [value].
  const RingtoneSetCountBodyInputSetTargetEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const phoneRingtone = RingtoneSetCountBodyInputSetTargetEnum._(r'phone_ringtone');

  /// List of all possible values in this [enum][RingtoneSetCountBodyInputSetTargetEnum].
  static const values = <RingtoneSetCountBodyInputSetTargetEnum>[
    phoneRingtone,
  ];

  static RingtoneSetCountBodyInputSetTargetEnum? fromJson(dynamic value) => RingtoneSetCountBodyInputSetTargetEnumTypeTransformer().decode(value);

  static List<RingtoneSetCountBodyInputSetTargetEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RingtoneSetCountBodyInputSetTargetEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RingtoneSetCountBodyInputSetTargetEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [RingtoneSetCountBodyInputSetTargetEnum] to String,
/// and [decode] dynamic data back to [RingtoneSetCountBodyInputSetTargetEnum].
class RingtoneSetCountBodyInputSetTargetEnumTypeTransformer {
  factory RingtoneSetCountBodyInputSetTargetEnumTypeTransformer() => _instance ??= const RingtoneSetCountBodyInputSetTargetEnumTypeTransformer._();

  const RingtoneSetCountBodyInputSetTargetEnumTypeTransformer._();

  String encode(RingtoneSetCountBodyInputSetTargetEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a RingtoneSetCountBodyInputSetTargetEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  RingtoneSetCountBodyInputSetTargetEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'phone_ringtone': return RingtoneSetCountBodyInputSetTargetEnum.phoneRingtone;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [RingtoneSetCountBodyInputSetTargetEnumTypeTransformer] instance.
  static RingtoneSetCountBodyInputSetTargetEnumTypeTransformer? _instance;
}


