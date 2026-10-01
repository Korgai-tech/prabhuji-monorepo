//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RegisterFirebaseTokenBody {
  /// Returns a new [RegisterFirebaseTokenBody] instance.
  RegisterFirebaseTokenBody({
    required this.token,
    required this.deviceId,
    required this.platform,
  });

  String token;

  String deviceId;

  RegisterFirebaseTokenBodyPlatformEnum platform;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RegisterFirebaseTokenBody &&
    other.token == token &&
    other.deviceId == deviceId &&
    other.platform == platform;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (token.hashCode) +
    (deviceId.hashCode) +
    (platform.hashCode);

  @override
  String toString() => 'RegisterFirebaseTokenBody[token=$token, deviceId=$deviceId, platform=$platform]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'token'] = this.token;
      json[r'deviceId'] = this.deviceId;
      json[r'platform'] = this.platform;
    return json;
  }

  /// Returns a new [RegisterFirebaseTokenBody] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RegisterFirebaseTokenBody? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'token'), 'Required key "RegisterFirebaseTokenBody[token]" is missing from JSON.');
        assert(json[r'token'] != null, 'Required key "RegisterFirebaseTokenBody[token]" has a null value in JSON.');
        assert(json.containsKey(r'deviceId'), 'Required key "RegisterFirebaseTokenBody[deviceId]" is missing from JSON.');
        assert(json[r'deviceId'] != null, 'Required key "RegisterFirebaseTokenBody[deviceId]" has a null value in JSON.');
        assert(json.containsKey(r'platform'), 'Required key "RegisterFirebaseTokenBody[platform]" is missing from JSON.');
        assert(json[r'platform'] != null, 'Required key "RegisterFirebaseTokenBody[platform]" has a null value in JSON.');
        return true;
      }());

      return RegisterFirebaseTokenBody(
        token: mapValueOfType<String>(json, r'token')!,
        deviceId: mapValueOfType<String>(json, r'deviceId')!,
        platform: RegisterFirebaseTokenBodyPlatformEnum.fromJson(json[r'platform'])!,
      );
    }
    return null;
  }

  static List<RegisterFirebaseTokenBody> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RegisterFirebaseTokenBody>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RegisterFirebaseTokenBody.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RegisterFirebaseTokenBody> mapFromJson(dynamic json) {
    final map = <String, RegisterFirebaseTokenBody>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RegisterFirebaseTokenBody.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RegisterFirebaseTokenBody-objects as value to a dart map
  static Map<String, List<RegisterFirebaseTokenBody>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RegisterFirebaseTokenBody>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RegisterFirebaseTokenBody.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'token',
    'deviceId',
    'platform',
  };
}


class RegisterFirebaseTokenBodyPlatformEnum {
  /// Instantiate a new enum with the provided [value].
  const RegisterFirebaseTokenBodyPlatformEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const ios = RegisterFirebaseTokenBodyPlatformEnum._(r'ios');
  static const android = RegisterFirebaseTokenBodyPlatformEnum._(r'android');

  /// List of all possible values in this [enum][RegisterFirebaseTokenBodyPlatformEnum].
  static const values = <RegisterFirebaseTokenBodyPlatformEnum>[
    ios,
    android,
  ];

  static RegisterFirebaseTokenBodyPlatformEnum? fromJson(dynamic value) => RegisterFirebaseTokenBodyPlatformEnumTypeTransformer().decode(value);

  static List<RegisterFirebaseTokenBodyPlatformEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RegisterFirebaseTokenBodyPlatformEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RegisterFirebaseTokenBodyPlatformEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [RegisterFirebaseTokenBodyPlatformEnum] to String,
/// and [decode] dynamic data back to [RegisterFirebaseTokenBodyPlatformEnum].
class RegisterFirebaseTokenBodyPlatformEnumTypeTransformer {
  factory RegisterFirebaseTokenBodyPlatformEnumTypeTransformer() => _instance ??= const RegisterFirebaseTokenBodyPlatformEnumTypeTransformer._();

  const RegisterFirebaseTokenBodyPlatformEnumTypeTransformer._();

  String encode(RegisterFirebaseTokenBodyPlatformEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a RegisterFirebaseTokenBodyPlatformEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  RegisterFirebaseTokenBodyPlatformEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'ios': return RegisterFirebaseTokenBodyPlatformEnum.ios;
        case r'android': return RegisterFirebaseTokenBodyPlatformEnum.android;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [RegisterFirebaseTokenBodyPlatformEnumTypeTransformer] instance.
  static RegisterFirebaseTokenBodyPlatformEnumTypeTransformer? _instance;
}


