//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ResendOtpDataInput {
  /// Returns a new [ResendOtpDataInput] instance.
  ResendOtpDataInput({
    required this.resendAvailableAfterSeconds,
  });

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  int resendAvailableAfterSeconds;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ResendOtpDataInput &&
    other.resendAvailableAfterSeconds == resendAvailableAfterSeconds;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (resendAvailableAfterSeconds.hashCode);

  @override
  String toString() => 'ResendOtpDataInput[resendAvailableAfterSeconds=$resendAvailableAfterSeconds]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'resendAvailableAfterSeconds'] = this.resendAvailableAfterSeconds;
    return json;
  }

  /// Returns a new [ResendOtpDataInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ResendOtpDataInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'resendAvailableAfterSeconds'), 'Required key "ResendOtpDataInput[resendAvailableAfterSeconds]" is missing from JSON.');
        assert(json[r'resendAvailableAfterSeconds'] != null, 'Required key "ResendOtpDataInput[resendAvailableAfterSeconds]" has a null value in JSON.');
        return true;
      }());

      return ResendOtpDataInput(
        resendAvailableAfterSeconds: mapValueOfType<int>(json, r'resendAvailableAfterSeconds')!,
      );
    }
    return null;
  }

  static List<ResendOtpDataInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ResendOtpDataInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ResendOtpDataInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ResendOtpDataInput> mapFromJson(dynamic json) {
    final map = <String, ResendOtpDataInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ResendOtpDataInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ResendOtpDataInput-objects as value to a dart map
  static Map<String, List<ResendOtpDataInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ResendOtpDataInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ResendOtpDataInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'resendAvailableAfterSeconds',
  };
}

