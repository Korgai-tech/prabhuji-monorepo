//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class OtpPublicUserInput {
  /// Returns a new [OtpPublicUserInput] instance.
  OtpPublicUserInput({
    required this.id,
    required this.phoneCountryCode,
    required this.phoneNumber,
  });

  String id;

  String? phoneCountryCode;

  String? phoneNumber;

  @override
  bool operator ==(Object other) => identical(this, other) || other is OtpPublicUserInput &&
    other.id == id &&
    other.phoneCountryCode == phoneCountryCode &&
    other.phoneNumber == phoneNumber;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (phoneCountryCode == null ? 0 : phoneCountryCode!.hashCode) +
    (phoneNumber == null ? 0 : phoneNumber!.hashCode);

  @override
  String toString() => 'OtpPublicUserInput[id=$id, phoneCountryCode=$phoneCountryCode, phoneNumber=$phoneNumber]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
    if (this.phoneCountryCode != null) {
      json[r'phoneCountryCode'] = this.phoneCountryCode;
    } else {
      json[r'phoneCountryCode'] = null;
    }
    if (this.phoneNumber != null) {
      json[r'phoneNumber'] = this.phoneNumber;
    } else {
      json[r'phoneNumber'] = null;
    }
    return json;
  }

  /// Returns a new [OtpPublicUserInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static OtpPublicUserInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "OtpPublicUserInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "OtpPublicUserInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'phoneCountryCode'), 'Required key "OtpPublicUserInput[phoneCountryCode]" is missing from JSON.');
        assert(json.containsKey(r'phoneNumber'), 'Required key "OtpPublicUserInput[phoneNumber]" is missing from JSON.');
        return true;
      }());

      return OtpPublicUserInput(
        id: mapValueOfType<String>(json, r'id')!,
        phoneCountryCode: mapValueOfType<String>(json, r'phoneCountryCode'),
        phoneNumber: mapValueOfType<String>(json, r'phoneNumber'),
      );
    }
    return null;
  }

  static List<OtpPublicUserInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <OtpPublicUserInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = OtpPublicUserInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, OtpPublicUserInput> mapFromJson(dynamic json) {
    final map = <String, OtpPublicUserInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = OtpPublicUserInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of OtpPublicUserInput-objects as value to a dart map
  static Map<String, List<OtpPublicUserInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<OtpPublicUserInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = OtpPublicUserInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'phoneCountryCode',
    'phoneNumber',
  };
}

