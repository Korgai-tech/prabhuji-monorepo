//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class VerifyOtpBody {
  /// Returns a new [VerifyOtpBody] instance.
  VerifyOtpBody({
    required this.otpSessionId,
    required this.otp,
  });

  String otpSessionId;

  String otp;

  @override
  bool operator ==(Object other) => identical(this, other) || other is VerifyOtpBody &&
    other.otpSessionId == otpSessionId &&
    other.otp == otp;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (otpSessionId.hashCode) +
    (otp.hashCode);

  @override
  String toString() => 'VerifyOtpBody[otpSessionId=$otpSessionId, otp=$otp]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'otpSessionId'] = this.otpSessionId;
      json[r'otp'] = this.otp;
    return json;
  }

  /// Returns a new [VerifyOtpBody] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static VerifyOtpBody? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'otpSessionId'), 'Required key "VerifyOtpBody[otpSessionId]" is missing from JSON.');
        assert(json[r'otpSessionId'] != null, 'Required key "VerifyOtpBody[otpSessionId]" has a null value in JSON.');
        assert(json.containsKey(r'otp'), 'Required key "VerifyOtpBody[otp]" is missing from JSON.');
        assert(json[r'otp'] != null, 'Required key "VerifyOtpBody[otp]" has a null value in JSON.');
        return true;
      }());

      return VerifyOtpBody(
        otpSessionId: mapValueOfType<String>(json, r'otpSessionId')!,
        otp: mapValueOfType<String>(json, r'otp')!,
      );
    }
    return null;
  }

  static List<VerifyOtpBody> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <VerifyOtpBody>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = VerifyOtpBody.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, VerifyOtpBody> mapFromJson(dynamic json) {
    final map = <String, VerifyOtpBody>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = VerifyOtpBody.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of VerifyOtpBody-objects as value to a dart map
  static Map<String, List<VerifyOtpBody>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<VerifyOtpBody>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = VerifyOtpBody.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'otpSessionId',
    'otp',
  };
}

