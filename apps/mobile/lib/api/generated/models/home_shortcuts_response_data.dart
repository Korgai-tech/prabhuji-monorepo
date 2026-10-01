//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeShortcutsResponseData {
  /// Returns a new [HomeShortcutsResponseData] instance.
  HomeShortcutsResponseData({
    this.shortcuts = const [],
  });

  List<HomeShortcut> shortcuts;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeShortcutsResponseData &&
    _deepEquality.equals(other.shortcuts, shortcuts);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (shortcuts.hashCode);

  @override
  String toString() => 'HomeShortcutsResponseData[shortcuts=$shortcuts]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'shortcuts'] = this.shortcuts;
    return json;
  }

  /// Returns a new [HomeShortcutsResponseData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeShortcutsResponseData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'shortcuts'), 'Required key "HomeShortcutsResponseData[shortcuts]" is missing from JSON.');
        assert(json[r'shortcuts'] != null, 'Required key "HomeShortcutsResponseData[shortcuts]" has a null value in JSON.');
        return true;
      }());

      return HomeShortcutsResponseData(
        shortcuts: HomeShortcut.listFromJson(json[r'shortcuts']),
      );
    }
    return null;
  }

  static List<HomeShortcutsResponseData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeShortcutsResponseData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeShortcutsResponseData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeShortcutsResponseData> mapFromJson(dynamic json) {
    final map = <String, HomeShortcutsResponseData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeShortcutsResponseData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeShortcutsResponseData-objects as value to a dart map
  static Map<String, List<HomeShortcutsResponseData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeShortcutsResponseData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeShortcutsResponseData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'shortcuts',
  };
}

