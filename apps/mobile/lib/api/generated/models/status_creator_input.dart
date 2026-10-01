//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StatusCreatorInput {
  /// Returns a new [StatusCreatorInput] instance.
  StatusCreatorInput({
    required this.id,
    required this.name,
    required this.avatarUrl,
  });

  String id;

  String name;

  String? avatarUrl;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StatusCreatorInput &&
    other.id == id &&
    other.name == name &&
    other.avatarUrl == avatarUrl;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (name.hashCode) +
    (avatarUrl == null ? 0 : avatarUrl!.hashCode);

  @override
  String toString() => 'StatusCreatorInput[id=$id, name=$name, avatarUrl=$avatarUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'name'] = this.name;
    if (this.avatarUrl != null) {
      json[r'avatarUrl'] = this.avatarUrl;
    } else {
      json[r'avatarUrl'] = null;
    }
    return json;
  }

  /// Returns a new [StatusCreatorInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StatusCreatorInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "StatusCreatorInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "StatusCreatorInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'name'), 'Required key "StatusCreatorInput[name]" is missing from JSON.');
        assert(json[r'name'] != null, 'Required key "StatusCreatorInput[name]" has a null value in JSON.');
        assert(json.containsKey(r'avatarUrl'), 'Required key "StatusCreatorInput[avatarUrl]" is missing from JSON.');
        return true;
      }());

      return StatusCreatorInput(
        id: mapValueOfType<String>(json, r'id')!,
        name: mapValueOfType<String>(json, r'name')!,
        avatarUrl: mapValueOfType<String>(json, r'avatarUrl'),
      );
    }
    return null;
  }

  static List<StatusCreatorInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusCreatorInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusCreatorInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StatusCreatorInput> mapFromJson(dynamic json) {
    final map = <String, StatusCreatorInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StatusCreatorInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StatusCreatorInput-objects as value to a dart map
  static Map<String, List<StatusCreatorInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StatusCreatorInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StatusCreatorInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'name',
    'avatarUrl',
  };
}

