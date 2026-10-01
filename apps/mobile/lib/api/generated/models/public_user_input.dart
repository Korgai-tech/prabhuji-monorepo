//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PublicUserInput {
  /// Returns a new [PublicUserInput] instance.
  PublicUserInput({
    required this.id,
    required this.email,
  });

  String id;

  String? email;

  @override
  bool operator ==(Object other) => identical(this, other) || other is PublicUserInput &&
    other.id == id &&
    other.email == email;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (email == null ? 0 : email!.hashCode);

  @override
  String toString() => 'PublicUserInput[id=$id, email=$email]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
    if (this.email != null) {
      json[r'email'] = this.email;
    } else {
      json[r'email'] = null;
    }
    return json;
  }

  /// Returns a new [PublicUserInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PublicUserInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "PublicUserInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "PublicUserInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'email'), 'Required key "PublicUserInput[email]" is missing from JSON.');
        return true;
      }());

      return PublicUserInput(
        id: mapValueOfType<String>(json, r'id')!,
        email: mapValueOfType<String>(json, r'email'),
      );
    }
    return null;
  }

  static List<PublicUserInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <PublicUserInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PublicUserInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PublicUserInput> mapFromJson(dynamic json) {
    final map = <String, PublicUserInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PublicUserInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PublicUserInput-objects as value to a dart map
  static Map<String, List<PublicUserInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<PublicUserInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PublicUserInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'email',
  };
}

