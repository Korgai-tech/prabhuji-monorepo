//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class VerifyOtpBodyInput {
  /// Returns a new [VerifyOtpBodyInput] instance.
  VerifyOtpBodyInput({
    required this.otpSessionId,
    required this.otp,
  });

  String otpSessionId;

  String otp;

  @override
  bool operator ==(Object other) => identical(this, other) || other is VerifyOtpBodyInput &&
    other.otpSessionId == otpSessionId &&
    other.otp == otp;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (otpSessionId.hashCode) +
    (otp.hashCode);

  @override
  String toString() => 'VerifyOtpBodyInput[otpSessionId=$otpSessionId, otp=$otp]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'otpSessionId'] = this.otpSessionId;
      json[r'otp'] = this.otp;
    return json;
  }

  /// Returns a new [VerifyOtpBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static VerifyOtpBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'otpSessionId'), 'Required key "VerifyOtpBodyInput[otpSessionId]" is missing from JSON.');
        assert(json[r'otpSessionId'] != null, 'Required key "VerifyOtpBodyInput[otpSessionId]" has a null value in JSON.');
        assert(json.containsKey(r'otp'), 'Required key "VerifyOtpBodyInput[otp]" is missing from JSON.');
        assert(json[r'otp'] != null, 'Required key "VerifyOtpBodyInput[otp]" has a null value in JSON.');
        return true;
      }());

      return VerifyOtpBodyInput(
        otpSessionId: mapValueOfType<String>(json, r'otpSessionId')!,
        otp: mapValueOfType<String>(json, r'otp')!,
      );
    }
    return null;
  }

  static List<VerifyOtpBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <VerifyOtpBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = VerifyOtpBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, VerifyOtpBodyInput> mapFromJson(dynamic json) {
    final map = <String, VerifyOtpBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = VerifyOtpBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of VerifyOtpBodyInput-objects as value to a dart map
  static Map<String, List<VerifyOtpBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<VerifyOtpBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = VerifyOtpBodyInput.listFromJson(entry.value, growable: growable,);
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

