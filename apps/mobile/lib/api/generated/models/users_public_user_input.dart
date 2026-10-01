//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class UsersPublicUserInput {
  /// Returns a new [UsersPublicUserInput] instance.
  UsersPublicUserInput({
    required this.id,
    required this.name,
    required this.selectedLanguage,
    required this.onboardingCompletedAt,
    required this.phoneCountryCode,
    required this.phoneNumber,
  });

  String id;

  String? name;

  LanguageCodeInput? selectedLanguage;

  DateTime? onboardingCompletedAt;

  String? phoneCountryCode;

  String? phoneNumber;

  @override
  bool operator ==(Object other) => identical(this, other) || other is UsersPublicUserInput &&
    other.id == id &&
    other.name == name &&
    other.selectedLanguage == selectedLanguage &&
    other.onboardingCompletedAt == onboardingCompletedAt &&
    other.phoneCountryCode == phoneCountryCode &&
    other.phoneNumber == phoneNumber;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (name == null ? 0 : name!.hashCode) +
    (selectedLanguage == null ? 0 : selectedLanguage!.hashCode) +
    (onboardingCompletedAt == null ? 0 : onboardingCompletedAt!.hashCode) +
    (phoneCountryCode == null ? 0 : phoneCountryCode!.hashCode) +
    (phoneNumber == null ? 0 : phoneNumber!.hashCode);

  @override
  String toString() => 'UsersPublicUserInput[id=$id, name=$name, selectedLanguage=$selectedLanguage, onboardingCompletedAt=$onboardingCompletedAt, phoneCountryCode=$phoneCountryCode, phoneNumber=$phoneNumber]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
    if (this.name != null) {
      json[r'name'] = this.name;
    } else {
      json[r'name'] = null;
    }
    if (this.selectedLanguage != null) {
      json[r'selectedLanguage'] = this.selectedLanguage;
    } else {
      json[r'selectedLanguage'] = null;
    }
    if (this.onboardingCompletedAt != null) {
      json[r'onboardingCompletedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.onboardingCompletedAt!.millisecondsSinceEpoch
        : this.onboardingCompletedAt!.toUtc().toIso8601String();
    } else {
      json[r'onboardingCompletedAt'] = null;
    }
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

  /// Returns a new [UsersPublicUserInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static UsersPublicUserInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "UsersPublicUserInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "UsersPublicUserInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'name'), 'Required key "UsersPublicUserInput[name]" is missing from JSON.');
        assert(json.containsKey(r'selectedLanguage'), 'Required key "UsersPublicUserInput[selectedLanguage]" is missing from JSON.');
        assert(json.containsKey(r'onboardingCompletedAt'), 'Required key "UsersPublicUserInput[onboardingCompletedAt]" is missing from JSON.');
        assert(json.containsKey(r'phoneCountryCode'), 'Required key "UsersPublicUserInput[phoneCountryCode]" is missing from JSON.');
        assert(json.containsKey(r'phoneNumber'), 'Required key "UsersPublicUserInput[phoneNumber]" is missing from JSON.');
        return true;
      }());

      return UsersPublicUserInput(
        id: mapValueOfType<String>(json, r'id')!,
        name: mapValueOfType<String>(json, r'name'),
        selectedLanguage: LanguageCodeInput.fromJson(json[r'selectedLanguage']),
        onboardingCompletedAt: mapDateTime(json, r'onboardingCompletedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        phoneCountryCode: mapValueOfType<String>(json, r'phoneCountryCode'),
        phoneNumber: mapValueOfType<String>(json, r'phoneNumber'),
      );
    }
    return null;
  }

  static List<UsersPublicUserInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <UsersPublicUserInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = UsersPublicUserInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, UsersPublicUserInput> mapFromJson(dynamic json) {
    final map = <String, UsersPublicUserInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = UsersPublicUserInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of UsersPublicUserInput-objects as value to a dart map
  static Map<String, List<UsersPublicUserInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<UsersPublicUserInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = UsersPublicUserInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'name',
    'selectedLanguage',
    'onboardingCompletedAt',
    'phoneCountryCode',
    'phoneNumber',
  };
}

