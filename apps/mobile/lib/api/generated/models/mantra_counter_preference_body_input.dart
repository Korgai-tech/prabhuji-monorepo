//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraCounterPreferenceBodyInput {
  /// Returns a new [MantraCounterPreferenceBodyInput] instance.
  MantraCounterPreferenceBodyInput({
    required this.repeatTarget,
  });

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int repeatTarget;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraCounterPreferenceBodyInput &&
    other.repeatTarget == repeatTarget;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (repeatTarget.hashCode);

  @override
  String toString() => 'MantraCounterPreferenceBodyInput[repeatTarget=$repeatTarget]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'repeatTarget'] = this.repeatTarget;
    return json;
  }

  /// Returns a new [MantraCounterPreferenceBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraCounterPreferenceBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'repeatTarget'), 'Required key "MantraCounterPreferenceBodyInput[repeatTarget]" is missing from JSON.');
        assert(json[r'repeatTarget'] != null, 'Required key "MantraCounterPreferenceBodyInput[repeatTarget]" has a null value in JSON.');
        return true;
      }());

      return MantraCounterPreferenceBodyInput(
        repeatTarget: mapValueOfType<int>(json, r'repeatTarget')!,
      );
    }
    return null;
  }

  static List<MantraCounterPreferenceBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraCounterPreferenceBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraCounterPreferenceBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraCounterPreferenceBodyInput> mapFromJson(dynamic json) {
    final map = <String, MantraCounterPreferenceBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraCounterPreferenceBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraCounterPreferenceBodyInput-objects as value to a dart map
  static Map<String, List<MantraCounterPreferenceBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraCounterPreferenceBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraCounterPreferenceBodyInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'repeatTarget',
  };
}

