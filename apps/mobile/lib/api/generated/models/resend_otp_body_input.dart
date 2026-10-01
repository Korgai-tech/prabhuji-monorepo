//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ResendOtpBodyInput {
  /// Returns a new [ResendOtpBodyInput] instance.
  ResendOtpBodyInput({
    required this.otpSessionId,
  });

  String otpSessionId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ResendOtpBodyInput &&
    other.otpSessionId == otpSessionId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (otpSessionId.hashCode);

  @override
  String toString() => 'ResendOtpBodyInput[otpSessionId=$otpSessionId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'otpSessionId'] = this.otpSessionId;
    return json;
  }

  /// Returns a new [ResendOtpBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ResendOtpBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'otpSessionId'), 'Required key "ResendOtpBodyInput[otpSessionId]" is missing from JSON.');
        assert(json[r'otpSessionId'] != null, 'Required key "ResendOtpBodyInput[otpSessionId]" has a null value in JSON.');
        return true;
      }());

      return ResendOtpBodyInput(
        otpSessionId: mapValueOfType<String>(json, r'otpSessionId')!,
      );
    }
    return null;
  }

  static List<ResendOtpBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ResendOtpBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ResendOtpBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ResendOtpBodyInput> mapFromJson(dynamic json) {
    final map = <String, ResendOtpBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ResendOtpBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ResendOtpBodyInput-objects as value to a dart map
  static Map<String, List<ResendOtpBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ResendOtpBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ResendOtpBodyInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'otpSessionId',
  };
}

