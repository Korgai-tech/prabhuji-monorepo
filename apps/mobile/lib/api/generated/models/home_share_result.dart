//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeShareResult {
  /// Returns a new [HomeShareResult] instance.
  HomeShareResult({
    required this.shareCount,
  });

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int shareCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeShareResult &&
    other.shareCount == shareCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (shareCount.hashCode);

  @override
  String toString() => 'HomeShareResult[shareCount=$shareCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'shareCount'] = this.shareCount;
    return json;
  }

  /// Returns a new [HomeShareResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeShareResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'shareCount'), 'Required key "HomeShareResult[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "HomeShareResult[shareCount]" has a null value in JSON.');
        return true;
      }());

      return HomeShareResult(
        shareCount: mapValueOfType<int>(json, r'shareCount')!,
      );
    }
    return null;
  }

  static List<HomeShareResult> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeShareResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeShareResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeShareResult> mapFromJson(dynamic json) {
    final map = <String, HomeShareResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeShareResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeShareResult-objects as value to a dart map
  static Map<String, List<HomeShareResult>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeShareResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeShareResult.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'shareCount',
  };
}

