//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeViewResultInput {
  /// Returns a new [HomeViewResultInput] instance.
  HomeViewResultInput({
    required this.viewCount,
  });

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int viewCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeViewResultInput &&
    other.viewCount == viewCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (viewCount.hashCode);

  @override
  String toString() => 'HomeViewResultInput[viewCount=$viewCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'viewCount'] = this.viewCount;
    return json;
  }

  /// Returns a new [HomeViewResultInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeViewResultInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'viewCount'), 'Required key "HomeViewResultInput[viewCount]" is missing from JSON.');
        assert(json[r'viewCount'] != null, 'Required key "HomeViewResultInput[viewCount]" has a null value in JSON.');
        return true;
      }());

      return HomeViewResultInput(
        viewCount: mapValueOfType<int>(json, r'viewCount')!,
      );
    }
    return null;
  }

  static List<HomeViewResultInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeViewResultInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeViewResultInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeViewResultInput> mapFromJson(dynamic json) {
    final map = <String, HomeViewResultInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeViewResultInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeViewResultInput-objects as value to a dart map
  static Map<String, List<HomeViewResultInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeViewResultInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeViewResultInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'viewCount',
  };
}

