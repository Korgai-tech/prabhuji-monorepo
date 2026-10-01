//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ModalsNextResponseData {
  /// Returns a new [ModalsNextResponseData] instance.
  ModalsNextResponseData({
    required this.modal,
  });

  ServableModal? modal;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ModalsNextResponseData &&
    other.modal == modal;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (modal == null ? 0 : modal!.hashCode);

  @override
  String toString() => 'ModalsNextResponseData[modal=$modal]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.modal != null) {
      json[r'modal'] = this.modal;
    } else {
      json[r'modal'] = null;
    }
    return json;
  }

  /// Returns a new [ModalsNextResponseData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ModalsNextResponseData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'modal'), 'Required key "ModalsNextResponseData[modal]" is missing from JSON.');
        return true;
      }());

      return ModalsNextResponseData(
        modal: ServableModal.fromJson(json[r'modal']),
      );
    }
    return null;
  }

  static List<ModalsNextResponseData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ModalsNextResponseData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ModalsNextResponseData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ModalsNextResponseData> mapFromJson(dynamic json) {
    final map = <String, ModalsNextResponseData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ModalsNextResponseData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ModalsNextResponseData-objects as value to a dart map
  static Map<String, List<ModalsNextResponseData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ModalsNextResponseData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ModalsNextResponseData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'modal',
  };
}

