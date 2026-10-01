//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class SendOtpBody {
  /// Returns a new [SendOtpBody] instance.
  SendOtpBody({
    required this.phoneCountryCode,
    required this.phoneNumber,
    this.appSignatureHash,
    this.pseudoId,
  });

  SendOtpBodyPhoneCountryCodeEnum phoneCountryCode;

  String phoneNumber;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? appSignatureHash;

  String? pseudoId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is SendOtpBody &&
    other.phoneCountryCode == phoneCountryCode &&
    other.phoneNumber == phoneNumber &&
    other.appSignatureHash == appSignatureHash &&
    other.pseudoId == pseudoId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (phoneCountryCode.hashCode) +
    (phoneNumber.hashCode) +
    (appSignatureHash == null ? 0 : appSignatureHash!.hashCode) +
    (pseudoId == null ? 0 : pseudoId!.hashCode);

  @override
  String toString() => 'SendOtpBody[phoneCountryCode=$phoneCountryCode, phoneNumber=$phoneNumber, appSignatureHash=$appSignatureHash, pseudoId=$pseudoId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'phoneCountryCode'] = this.phoneCountryCode;
      json[r'phoneNumber'] = this.phoneNumber;
    if (this.appSignatureHash != null) {
      json[r'appSignatureHash'] = this.appSignatureHash;
    } else {
      json[r'appSignatureHash'] = null;
    }
    if (this.pseudoId != null) {
      json[r'pseudoId'] = this.pseudoId;
    } else {
      json[r'pseudoId'] = null;
    }
    return json;
  }

  /// Returns a new [SendOtpBody] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static SendOtpBody? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'phoneCountryCode'), 'Required key "SendOtpBody[phoneCountryCode]" is missing from JSON.');
        assert(json[r'phoneCountryCode'] != null, 'Required key "SendOtpBody[phoneCountryCode]" has a null value in JSON.');
        assert(json.containsKey(r'phoneNumber'), 'Required key "SendOtpBody[phoneNumber]" is missing from JSON.');
        assert(json[r'phoneNumber'] != null, 'Required key "SendOtpBody[phoneNumber]" has a null value in JSON.');
        return true;
      }());

      return SendOtpBody(
        phoneCountryCode: SendOtpBodyPhoneCountryCodeEnum.fromJson(json[r'phoneCountryCode'])!,
        phoneNumber: mapValueOfType<String>(json, r'phoneNumber')!,
        appSignatureHash: mapValueOfType<String>(json, r'appSignatureHash'),
        pseudoId: mapValueOfType<String>(json, r'pseudoId'),
      );
    }
    return null;
  }

  static List<SendOtpBody> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <SendOtpBody>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SendOtpBody.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, SendOtpBody> mapFromJson(dynamic json) {
    final map = <String, SendOtpBody>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = SendOtpBody.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of SendOtpBody-objects as value to a dart map
  static Map<String, List<SendOtpBody>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<SendOtpBody>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = SendOtpBody.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'phoneCountryCode',
    'phoneNumber',
  };
}


class SendOtpBodyPhoneCountryCodeEnum {
  /// Instantiate a new enum with the provided [value].
  const SendOtpBodyPhoneCountryCodeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const plus91 = SendOtpBodyPhoneCountryCodeEnum._(r'+91');

  /// List of all possible values in this [enum][SendOtpBodyPhoneCountryCodeEnum].
  static const values = <SendOtpBodyPhoneCountryCodeEnum>[
    plus91,
  ];

  static SendOtpBodyPhoneCountryCodeEnum? fromJson(dynamic value) => SendOtpBodyPhoneCountryCodeEnumTypeTransformer().decode(value);

  static List<SendOtpBodyPhoneCountryCodeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <SendOtpBodyPhoneCountryCodeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SendOtpBodyPhoneCountryCodeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [SendOtpBodyPhoneCountryCodeEnum] to String,
/// and [decode] dynamic data back to [SendOtpBodyPhoneCountryCodeEnum].
class SendOtpBodyPhoneCountryCodeEnumTypeTransformer {
  factory SendOtpBodyPhoneCountryCodeEnumTypeTransformer() => _instance ??= const SendOtpBodyPhoneCountryCodeEnumTypeTransformer._();

  const SendOtpBodyPhoneCountryCodeEnumTypeTransformer._();

  String encode(SendOtpBodyPhoneCountryCodeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a SendOtpBodyPhoneCountryCodeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  SendOtpBodyPhoneCountryCodeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'+91': return SendOtpBodyPhoneCountryCodeEnum.plus91;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [SendOtpBodyPhoneCountryCodeEnumTypeTransformer] instance.
  static SendOtpBodyPhoneCountryCodeEnumTypeTransformer? _instance;
}


