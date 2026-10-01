//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraCounterPreferenceResult {
  /// Returns a new [MantraCounterPreferenceResult] instance.
  MantraCounterPreferenceResult({
    required this.repeatTarget,
    this.availableTargets = const [],
  });

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int repeatTarget;

  /// Every selectable japa target, in display order — the server-owned option list for the counter picker (currently 7, 11, 21, 108, 1008). Sourced from the same constant the PUT validates against; the client must render this list, never a hardcoded one.
  List<int> availableTargets;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraCounterPreferenceResult &&
    other.repeatTarget == repeatTarget &&
    _deepEquality.equals(other.availableTargets, availableTargets);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (repeatTarget.hashCode) +
    (availableTargets.hashCode);

  @override
  String toString() => 'MantraCounterPreferenceResult[repeatTarget=$repeatTarget, availableTargets=$availableTargets]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'repeatTarget'] = this.repeatTarget;
      json[r'availableTargets'] = this.availableTargets;
    return json;
  }

  /// Returns a new [MantraCounterPreferenceResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraCounterPreferenceResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'repeatTarget'), 'Required key "MantraCounterPreferenceResult[repeatTarget]" is missing from JSON.');
        assert(json[r'repeatTarget'] != null, 'Required key "MantraCounterPreferenceResult[repeatTarget]" has a null value in JSON.');
        assert(json.containsKey(r'availableTargets'), 'Required key "MantraCounterPreferenceResult[availableTargets]" is missing from JSON.');
        assert(json[r'availableTargets'] != null, 'Required key "MantraCounterPreferenceResult[availableTargets]" has a null value in JSON.');
        return true;
      }());

      return MantraCounterPreferenceResult(
        repeatTarget: mapValueOfType<int>(json, r'repeatTarget')!,
        availableTargets: json[r'availableTargets'] is Iterable
            ? (json[r'availableTargets'] as Iterable).cast<int>().toList(growable: false)
            : const [],
      );
    }
    return null;
  }

  static List<MantraCounterPreferenceResult> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraCounterPreferenceResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraCounterPreferenceResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraCounterPreferenceResult> mapFromJson(dynamic json) {
    final map = <String, MantraCounterPreferenceResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraCounterPreferenceResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraCounterPreferenceResult-objects as value to a dart map
  static Map<String, List<MantraCounterPreferenceResult>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraCounterPreferenceResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraCounterPreferenceResult.listFromJson(entry.value, growable: growable,);
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

