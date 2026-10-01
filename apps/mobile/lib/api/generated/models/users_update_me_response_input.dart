//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class UsersUpdateMeResponseInput {
  /// Returns a new [UsersUpdateMeResponseInput] instance.
  UsersUpdateMeResponseInput({
    required this.user,
  });

  UsersPublicUserInput user;

  @override
  bool operator ==(Object other) => identical(this, other) || other is UsersUpdateMeResponseInput &&
    other.user == user;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (user.hashCode);

  @override
  String toString() => 'UsersUpdateMeResponseInput[user=$user]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'user'] = this.user;
    return json;
  }

  /// Returns a new [UsersUpdateMeResponseInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static UsersUpdateMeResponseInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'user'), 'Required key "UsersUpdateMeResponseInput[user]" is missing from JSON.');
        assert(json[r'user'] != null, 'Required key "UsersUpdateMeResponseInput[user]" has a null value in JSON.');
        return true;
      }());

      return UsersUpdateMeResponseInput(
        user: UsersPublicUserInput.fromJson(json[r'user'])!,
      );
    }
    return null;
  }

  static List<UsersUpdateMeResponseInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <UsersUpdateMeResponseInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = UsersUpdateMeResponseInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, UsersUpdateMeResponseInput> mapFromJson(dynamic json) {
    final map = <String, UsersUpdateMeResponseInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = UsersUpdateMeResponseInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of UsersUpdateMeResponseInput-objects as value to a dart map
  static Map<String, List<UsersUpdateMeResponseInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<UsersUpdateMeResponseInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = UsersUpdateMeResponseInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'user',
  };
}

