//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ModalsNextResponseInputData {
  /// Returns a new [ModalsNextResponseInputData] instance.
  ModalsNextResponseInputData({
    required this.modal,
  });

  ServableModalInput? modal;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ModalsNextResponseInputData &&
    other.modal == modal;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (modal == null ? 0 : modal!.hashCode);

  @override
  String toString() => 'ModalsNextResponseInputData[modal=$modal]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.modal != null) {
      json[r'modal'] = this.modal;
    } else {
      json[r'modal'] = null;
    }
    return json;
  }

  /// Returns a new [ModalsNextResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ModalsNextResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'modal'), 'Required key "ModalsNextResponseInputData[modal]" is missing from JSON.');
        return true;
      }());

      return ModalsNextResponseInputData(
        modal: ServableModalInput.fromJson(json[r'modal']),
      );
    }
    return null;
  }

  static List<ModalsNextResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ModalsNextResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ModalsNextResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ModalsNextResponseInputData> mapFromJson(dynamic json) {
    final map = <String, ModalsNextResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ModalsNextResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ModalsNextResponseInputData-objects as value to a dart map
  static Map<String, List<ModalsNextResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ModalsNextResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ModalsNextResponseInputData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'modal',
  };
}

