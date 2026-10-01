//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FirebaseTokenResult {
  /// Returns a new [FirebaseTokenResult] instance.
  FirebaseTokenResult({
    required this.deviceId,
    required this.platform,
  });

  String deviceId;

  FirebaseTokenResultPlatformEnum platform;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FirebaseTokenResult &&
    other.deviceId == deviceId &&
    other.platform == platform;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (deviceId.hashCode) +
    (platform.hashCode);

  @override
  String toString() => 'FirebaseTokenResult[deviceId=$deviceId, platform=$platform]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'deviceId'] = this.deviceId;
      json[r'platform'] = this.platform;
    return json;
  }

  /// Returns a new [FirebaseTokenResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FirebaseTokenResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'deviceId'), 'Required key "FirebaseTokenResult[deviceId]" is missing from JSON.');
        assert(json[r'deviceId'] != null, 'Required key "FirebaseTokenResult[deviceId]" has a null value in JSON.');
        assert(json.containsKey(r'platform'), 'Required key "FirebaseTokenResult[platform]" is missing from JSON.');
        assert(json[r'platform'] != null, 'Required key "FirebaseTokenResult[platform]" has a null value in JSON.');
        return true;
      }());

      return FirebaseTokenResult(
        deviceId: mapValueOfType<String>(json, r'deviceId')!,
        platform: FirebaseTokenResultPlatformEnum.fromJson(json[r'platform'])!,
      );
    }
    return null;
  }

  static List<FirebaseTokenResult> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FirebaseTokenResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FirebaseTokenResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FirebaseTokenResult> mapFromJson(dynamic json) {
    final map = <String, FirebaseTokenResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FirebaseTokenResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FirebaseTokenResult-objects as value to a dart map
  static Map<String, List<FirebaseTokenResult>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FirebaseTokenResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FirebaseTokenResult.listFromJson(entry.value, growable: growable,);
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


class FirebaseTokenResultPlatformEnum {
  /// Instantiate a new enum with the provided [value].
  const FirebaseTokenResultPlatformEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const ios = FirebaseTokenResultPlatformEnum._(r'ios');
  static const android = FirebaseTokenResultPlatformEnum._(r'android');

  /// List of all possible values in this [enum][FirebaseTokenResultPlatformEnum].
  static const values = <FirebaseTokenResultPlatformEnum>[
    ios,
    android,
  ];

  static FirebaseTokenResultPlatformEnum? fromJson(dynamic value) => FirebaseTokenResultPlatformEnumTypeTransformer().decode(value);

  static List<FirebaseTokenResultPlatformEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FirebaseTokenResultPlatformEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FirebaseTokenResultPlatformEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [FirebaseTokenResultPlatformEnum] to String,
/// and [decode] dynamic data back to [FirebaseTokenResultPlatformEnum].
class FirebaseTokenResultPlatformEnumTypeTransformer {
  factory FirebaseTokenResultPlatformEnumTypeTransformer() => _instance ??= const FirebaseTokenResultPlatformEnumTypeTransformer._();

  const FirebaseTokenResultPlatformEnumTypeTransformer._();

  String encode(FirebaseTokenResultPlatformEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a FirebaseTokenResultPlatformEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  FirebaseTokenResultPlatformEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'ios': return FirebaseTokenResultPlatformEnum.ios;
        case r'android': return FirebaseTokenResultPlatformEnum.android;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [FirebaseTokenResultPlatformEnumTypeTransformer] instance.
  static FirebaseTokenResultPlatformEnumTypeTransformer? _instance;
}


