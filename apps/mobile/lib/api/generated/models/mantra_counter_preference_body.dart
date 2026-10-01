//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraCounterPreferenceBody {
  /// Returns a new [MantraCounterPreferenceBody] instance.
  MantraCounterPreferenceBody({
    required this.repeatTarget,
  });

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int repeatTarget;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraCounterPreferenceBody &&
    other.repeatTarget == repeatTarget;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (repeatTarget.hashCode);

  @override
  String toString() => 'MantraCounterPreferenceBody[repeatTarget=$repeatTarget]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'repeatTarget'] = this.repeatTarget;
    return json;
  }

  /// Returns a new [MantraCounterPreferenceBody] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraCounterPreferenceBody? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'repeatTarget'), 'Required key "MantraCounterPreferenceBody[repeatTarget]" is missing from JSON.');
        assert(json[r'repeatTarget'] != null, 'Required key "MantraCounterPreferenceBody[repeatTarget]" has a null value in JSON.');
        return true;
      }());

      return MantraCounterPreferenceBody(
        repeatTarget: mapValueOfType<int>(json, r'repeatTarget')!,
      );
    }
    return null;
  }

  static List<MantraCounterPreferenceBody> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraCounterPreferenceBody>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraCounterPreferenceBody.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraCounterPreferenceBody> mapFromJson(dynamic json) {
    final map = <String, MantraCounterPreferenceBody>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraCounterPreferenceBody.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraCounterPreferenceBody-objects as value to a dart map
  static Map<String, List<MantraCounterPreferenceBody>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraCounterPreferenceBody>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraCounterPreferenceBody.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'repeatTarget',
  };
}

