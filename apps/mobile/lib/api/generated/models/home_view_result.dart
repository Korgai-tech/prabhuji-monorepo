//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeViewResult {
  /// Returns a new [HomeViewResult] instance.
  HomeViewResult({
    required this.viewCount,
  });

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int viewCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeViewResult &&
    other.viewCount == viewCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (viewCount.hashCode);

  @override
  String toString() => 'HomeViewResult[viewCount=$viewCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'viewCount'] = this.viewCount;
    return json;
  }

  /// Returns a new [HomeViewResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeViewResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'viewCount'), 'Required key "HomeViewResult[viewCount]" is missing from JSON.');
        assert(json[r'viewCount'] != null, 'Required key "HomeViewResult[viewCount]" has a null value in JSON.');
        return true;
      }());

      return HomeViewResult(
        viewCount: mapValueOfType<int>(json, r'viewCount')!,
      );
    }
    return null;
  }

  static List<HomeViewResult> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeViewResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeViewResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeViewResult> mapFromJson(dynamic json) {
    final map = <String, HomeViewResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeViewResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeViewResult-objects as value to a dart map
  static Map<String, List<HomeViewResult>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeViewResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeViewResult.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'viewCount',
  };
}

