//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RegisterFirebaseTokenBodyInput {
  /// Returns a new [RegisterFirebaseTokenBodyInput] instance.
  RegisterFirebaseTokenBodyInput({
    required this.token,
    required this.deviceId,
    required this.platform,
  });

  String token;

  String deviceId;

  RegisterFirebaseTokenBodyInputPlatformEnum platform;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RegisterFirebaseTokenBodyInput &&
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
  String toString() => 'RegisterFirebaseTokenBodyInput[token=$token, deviceId=$deviceId, platform=$platform]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'token'] = this.token;
      json[r'deviceId'] = this.deviceId;
      json[r'platform'] = this.platform;
    return json;
  }

  /// Returns a new [RegisterFirebaseTokenBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RegisterFirebaseTokenBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'token'), 'Required key "RegisterFirebaseTokenBodyInput[token]" is missing from JSON.');
        assert(json[r'token'] != null, 'Required key "RegisterFirebaseTokenBodyInput[token]" has a null value in JSON.');
        assert(json.containsKey(r'deviceId'), 'Required key "RegisterFirebaseTokenBodyInput[deviceId]" is missing from JSON.');
        assert(json[r'deviceId'] != null, 'Required key "RegisterFirebaseTokenBodyInput[deviceId]" has a null value in JSON.');
        assert(json.containsKey(r'platform'), 'Required key "RegisterFirebaseTokenBodyInput[platform]" is missing from JSON.');
        assert(json[r'platform'] != null, 'Required key "RegisterFirebaseTokenBodyInput[platform]" has a null value in JSON.');
        return true;
      }());

      return RegisterFirebaseTokenBodyInput(
        token: mapValueOfType<String>(json, r'token')!,
        deviceId: mapValueOfType<String>(json, r'deviceId')!,
        platform: RegisterFirebaseTokenBodyInputPlatformEnum.fromJson(json[r'platform'])!,
      );
    }
    return null;
  }

  static List<RegisterFirebaseTokenBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RegisterFirebaseTokenBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RegisterFirebaseTokenBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RegisterFirebaseTokenBodyInput> mapFromJson(dynamic json) {
    final map = <String, RegisterFirebaseTokenBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RegisterFirebaseTokenBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RegisterFirebaseTokenBodyInput-objects as value to a dart map
  static Map<String, List<RegisterFirebaseTokenBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RegisterFirebaseTokenBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RegisterFirebaseTokenBodyInput.listFromJson(entry.value, growable: growable,);
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


class RegisterFirebaseTokenBodyInputPlatformEnum {
  /// Instantiate a new enum with the provided [value].
  const RegisterFirebaseTokenBodyInputPlatformEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const ios = RegisterFirebaseTokenBodyInputPlatformEnum._(r'ios');
  static const android = RegisterFirebaseTokenBodyInputPlatformEnum._(r'android');

  /// List of all possible values in this [enum][RegisterFirebaseTokenBodyInputPlatformEnum].
  static const values = <RegisterFirebaseTokenBodyInputPlatformEnum>[
    ios,
    android,
  ];

  static RegisterFirebaseTokenBodyInputPlatformEnum? fromJson(dynamic value) => RegisterFirebaseTokenBodyInputPlatformEnumTypeTransformer().decode(value);

  static List<RegisterFirebaseTokenBodyInputPlatformEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RegisterFirebaseTokenBodyInputPlatformEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RegisterFirebaseTokenBodyInputPlatformEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [RegisterFirebaseTokenBodyInputPlatformEnum] to String,
/// and [decode] dynamic data back to [RegisterFirebaseTokenBodyInputPlatformEnum].
class RegisterFirebaseTokenBodyInputPlatformEnumTypeTransformer {
  factory RegisterFirebaseTokenBodyInputPlatformEnumTypeTransformer() => _instance ??= const RegisterFirebaseTokenBodyInputPlatformEnumTypeTransformer._();

  const RegisterFirebaseTokenBodyInputPlatformEnumTypeTransformer._();

  String encode(RegisterFirebaseTokenBodyInputPlatformEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a RegisterFirebaseTokenBodyInputPlatformEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  RegisterFirebaseTokenBodyInputPlatformEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'ios': return RegisterFirebaseTokenBodyInputPlatformEnum.ios;
        case r'android': return RegisterFirebaseTokenBodyInputPlatformEnum.android;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [RegisterFirebaseTokenBodyInputPlatformEnumTypeTransformer] instance.
  static RegisterFirebaseTokenBodyInputPlatformEnumTypeTransformer? _instance;
}


