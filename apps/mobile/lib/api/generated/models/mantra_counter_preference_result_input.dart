//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraCounterPreferenceResultInput {
  /// Returns a new [MantraCounterPreferenceResultInput] instance.
  MantraCounterPreferenceResultInput({
    required this.repeatTarget,
    this.availableTargets = const [],
  });

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int repeatTarget;

  /// Every selectable japa target, in display order — the server-owned option list for the counter picker (currently 7, 11, 21, 108, 1008). Sourced from the same constant the PUT validates against; the client must render this list, never a hardcoded one.
  List<int> availableTargets;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraCounterPreferenceResultInput &&
    other.repeatTarget == repeatTarget &&
    _deepEquality.equals(other.availableTargets, availableTargets);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (repeatTarget.hashCode) +
    (availableTargets.hashCode);

  @override
  String toString() => 'MantraCounterPreferenceResultInput[repeatTarget=$repeatTarget, availableTargets=$availableTargets]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'repeatTarget'] = this.repeatTarget;
      json[r'availableTargets'] = this.availableTargets;
    return json;
  }

  /// Returns a new [MantraCounterPreferenceResultInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraCounterPreferenceResultInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'repeatTarget'), 'Required key "MantraCounterPreferenceResultInput[repeatTarget]" is missing from JSON.');
        assert(json[r'repeatTarget'] != null, 'Required key "MantraCounterPreferenceResultInput[repeatTarget]" has a null value in JSON.');
        assert(json.containsKey(r'availableTargets'), 'Required key "MantraCounterPreferenceResultInput[availableTargets]" is missing from JSON.');
        assert(json[r'availableTargets'] != null, 'Required key "MantraCounterPreferenceResultInput[availableTargets]" has a null value in JSON.');
        return true;
      }());

      return MantraCounterPreferenceResultInput(
        repeatTarget: mapValueOfType<int>(json, r'repeatTarget')!,
        availableTargets: json[r'availableTargets'] is Iterable
            ? (json[r'availableTargets'] as Iterable).cast<int>().toList(growable: false)
            : const [],
      );
    }
    return null;
  }

  static List<MantraCounterPreferenceResultInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraCounterPreferenceResultInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraCounterPreferenceResultInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraCounterPreferenceResultInput> mapFromJson(dynamic json) {
    final map = <String, MantraCounterPreferenceResultInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraCounterPreferenceResultInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraCounterPreferenceResultInput-objects as value to a dart map
  static Map<String, List<MantraCounterPreferenceResultInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraCounterPreferenceResultInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraCounterPreferenceResultInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'repeatTarget',
    'availableTargets',
  };
}

