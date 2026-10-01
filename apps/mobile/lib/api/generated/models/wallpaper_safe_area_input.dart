//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class WallpaperSafeAreaInput {
  /// Returns a new [WallpaperSafeAreaInput] instance.
  WallpaperSafeAreaInput({
    required this.top,
    required this.bottom,
    required this.left,
    required this.right,
  });

  num top;

  num bottom;

  num left;

  num right;

  @override
  bool operator ==(Object other) => identical(this, other) || other is WallpaperSafeAreaInput &&
    other.top == top &&
    other.bottom == bottom &&
    other.left == left &&
    other.right == right;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (top.hashCode) +
    (bottom.hashCode) +
    (left.hashCode) +
    (right.hashCode);

  @override
  String toString() => 'WallpaperSafeAreaInput[top=$top, bottom=$bottom, left=$left, right=$right]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'top'] = this.top;
      json[r'bottom'] = this.bottom;
      json[r'left'] = this.left;
      json[r'right'] = this.right;
    return json;
  }

  /// Returns a new [WallpaperSafeAreaInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static WallpaperSafeAreaInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'top'), 'Required key "WallpaperSafeAreaInput[top]" is missing from JSON.');
        assert(json[r'top'] != null, 'Required key "WallpaperSafeAreaInput[top]" has a null value in JSON.');
        assert(json.containsKey(r'bottom'), 'Required key "WallpaperSafeAreaInput[bottom]" is missing from JSON.');
        assert(json[r'bottom'] != null, 'Required key "WallpaperSafeAreaInput[bottom]" has a null value in JSON.');
        assert(json.containsKey(r'left'), 'Required key "WallpaperSafeAreaInput[left]" is missing from JSON.');
        assert(json[r'left'] != null, 'Required key "WallpaperSafeAreaInput[left]" has a null value in JSON.');
        assert(json.containsKey(r'right'), 'Required key "WallpaperSafeAreaInput[right]" is missing from JSON.');
        assert(json[r'right'] != null, 'Required key "WallpaperSafeAreaInput[right]" has a null value in JSON.');
        return true;
      }());

      return WallpaperSafeAreaInput(
        top: num.parse('${json[r'top']}'),
        bottom: num.parse('${json[r'bottom']}'),
        left: num.parse('${json[r'left']}'),
        right: num.parse('${json[r'right']}'),
      );
    }
    return null;
  }

  static List<WallpaperSafeAreaInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperSafeAreaInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperSafeAreaInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, WallpaperSafeAreaInput> mapFromJson(dynamic json) {
    final map = <String, WallpaperSafeAreaInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = WallpaperSafeAreaInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of WallpaperSafeAreaInput-objects as value to a dart map
  static Map<String, List<WallpaperSafeAreaInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<WallpaperSafeAreaInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = WallpaperSafeAreaInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'top',
    'bottom',
    'left',
    'right',
  };
}

