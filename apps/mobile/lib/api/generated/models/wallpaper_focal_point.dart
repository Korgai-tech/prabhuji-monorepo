//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class WallpaperFocalPoint {
  /// Returns a new [WallpaperFocalPoint] instance.
  WallpaperFocalPoint({
    required this.x,
    required this.y,
  });

  num x;

  num y;

  @override
  bool operator ==(Object other) => identical(this, other) || other is WallpaperFocalPoint &&
    other.x == x &&
    other.y == y;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (x.hashCode) +
    (y.hashCode);

  @override
  String toString() => 'WallpaperFocalPoint[x=$x, y=$y]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'x'] = this.x;
      json[r'y'] = this.y;
    return json;
  }

  /// Returns a new [WallpaperFocalPoint] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static WallpaperFocalPoint? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'x'), 'Required key "WallpaperFocalPoint[x]" is missing from JSON.');
        assert(json[r'x'] != null, 'Required key "WallpaperFocalPoint[x]" has a null value in JSON.');
        assert(json.containsKey(r'y'), 'Required key "WallpaperFocalPoint[y]" is missing from JSON.');
        assert(json[r'y'] != null, 'Required key "WallpaperFocalPoint[y]" has a null value in JSON.');
        return true;
      }());

      return WallpaperFocalPoint(
        x: num.parse('${json[r'x']}'),
        y: num.parse('${json[r'y']}'),
      );
    }
    return null;
  }

  static List<WallpaperFocalPoint> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperFocalPoint>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperFocalPoint.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, WallpaperFocalPoint> mapFromJson(dynamic json) {
    final map = <String, WallpaperFocalPoint>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = WallpaperFocalPoint.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of WallpaperFocalPoint-objects as value to a dart map
  static Map<String, List<WallpaperFocalPoint>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<WallpaperFocalPoint>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = WallpaperFocalPoint.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'x',
    'y',
  };
}

