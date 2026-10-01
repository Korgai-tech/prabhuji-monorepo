//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeShortcutsResponseInputData {
  /// Returns a new [HomeShortcutsResponseInputData] instance.
  HomeShortcutsResponseInputData({
    this.shortcuts = const [],
  });

  List<HomeShortcutInput> shortcuts;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeShortcutsResponseInputData &&
    _deepEquality.equals(other.shortcuts, shortcuts);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (shortcuts.hashCode);

  @override
  String toString() => 'HomeShortcutsResponseInputData[shortcuts=$shortcuts]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'shortcuts'] = this.shortcuts;
    return json;
  }

  /// Returns a new [HomeShortcutsResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeShortcutsResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'shortcuts'), 'Required key "HomeShortcutsResponseInputData[shortcuts]" is missing from JSON.');
        assert(json[r'shortcuts'] != null, 'Required key "HomeShortcutsResponseInputData[shortcuts]" has a null value in JSON.');
        return true;
      }());

      return HomeShortcutsResponseInputData(
        shortcuts: HomeShortcutInput.listFromJson(json[r'shortcuts']),
      );
    }
    return null;
  }

  static List<HomeShortcutsResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeShortcutsResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeShortcutsResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeShortcutsResponseInputData> mapFromJson(dynamic json) {
    final map = <String, HomeShortcutsResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeShortcutsResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeShortcutsResponseInputData-objects as value to a dart map
  static Map<String, List<HomeShortcutsResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeShortcutsResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeShortcutsResponseInputData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'shortcuts',
  };
}

