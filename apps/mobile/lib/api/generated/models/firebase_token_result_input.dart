//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FirebaseTokenResultInput {
  /// Returns a new [FirebaseTokenResultInput] instance.
  FirebaseTokenResultInput({
    required this.deviceId,
    required this.platform,
  });

  String deviceId;

  FirebaseTokenResultInputPlatformEnum platform;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FirebaseTokenResultInput &&
    other.deviceId == deviceId &&
    other.platform == platform;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (deviceId.hashCode) +
    (platform.hashCode);

  @override
  String toString() => 'FirebaseTokenResultInput[deviceId=$deviceId, platform=$platform]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'deviceId'] = this.deviceId;
      json[r'platform'] = this.platform;
    return json;
  }

  /// Returns a new [FirebaseTokenResultInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FirebaseTokenResultInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'deviceId'), 'Required key "FirebaseTokenResultInput[deviceId]" is missing from JSON.');
        assert(json[r'deviceId'] != null, 'Required key "FirebaseTokenResultInput[deviceId]" has a null value in JSON.');
        assert(json.containsKey(r'platform'), 'Required key "FirebaseTokenResultInput[platform]" is missing from JSON.');
        assert(json[r'platform'] != null, 'Required key "FirebaseTokenResultInput[platform]" has a null value in JSON.');
        return true;
      }());

      return FirebaseTokenResultInput(
        deviceId: mapValueOfType<String>(json, r'deviceId')!,
        platform: FirebaseTokenResultInputPlatformEnum.fromJson(json[r'platform'])!,
      );
    }
    return null;
  }

  static List<FirebaseTokenResultInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FirebaseTokenResultInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FirebaseTokenResultInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FirebaseTokenResultInput> mapFromJson(dynamic json) {
    final map = <String, FirebaseTokenResultInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FirebaseTokenResultInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FirebaseTokenResultInput-objects as value to a dart map
  static Map<String, List<FirebaseTokenResultInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FirebaseTokenResultInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FirebaseTokenResultInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'deviceId',
    'platform',
  };
}


class FirebaseTokenResultInputPlatformEnum {
  /// Instantiate a new enum with the provided [value].
  const FirebaseTokenResultInputPlatformEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const ios = FirebaseTokenResultInputPlatformEnum._(r'ios');
  static const android = FirebaseTokenResultInputPlatformEnum._(r'android');

  /// List of all possible values in this [enum][FirebaseTokenResultInputPlatformEnum].
  static const values = <FirebaseTokenResultInputPlatformEnum>[
    ios,
    android,
  ];

  static FirebaseTokenResultInputPlatformEnum? fromJson(dynamic value) => FirebaseTokenResultInputPlatformEnumTypeTransformer().decode(value);

  static List<FirebaseTokenResultInputPlatformEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FirebaseTokenResultInputPlatformEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FirebaseTokenResultInputPlatformEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [FirebaseTokenResultInputPlatformEnum] to String,
/// and [decode] dynamic data back to [FirebaseTokenResultInputPlatformEnum].
class FirebaseTokenResultInputPlatformEnumTypeTransformer {
  factory FirebaseTokenResultInputPlatformEnumTypeTransformer() => _instance ??= const FirebaseTokenResultInputPlatformEnumTypeTransformer._();

  const FirebaseTokenResultInputPlatformEnumTypeTransformer._();

  String encode(FirebaseTokenResultInputPlatformEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a FirebaseTokenResultInputPlatformEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  FirebaseTokenResultInputPlatformEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'ios': return FirebaseTokenResultInputPlatformEnum.ios;
        case r'android': return FirebaseTokenResultInputPlatformEnum.android;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [FirebaseTokenResultInputPlatformEnumTypeTransformer] instance.
  static FirebaseTokenResultInputPlatformEnumTypeTransformer? _instance;
}


