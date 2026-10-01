//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class UsersMeResponseInput {
  /// Returns a new [UsersMeResponseInput] instance.
  UsersMeResponseInput({
    required this.user,
    required this.chatConfig,
    required this.landing,
  });

  UsersPublicUserInput user;

  UsersChatConfigInput chatConfig;

  UsersLandingInput landing;

  @override
  bool operator ==(Object other) => identical(this, other) || other is UsersMeResponseInput &&
    other.user == user &&
    other.chatConfig == chatConfig &&
    other.landing == landing;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (user.hashCode) +
    (chatConfig.hashCode) +
    (landing.hashCode);

  @override
  String toString() => 'UsersMeResponseInput[user=$user, chatConfig=$chatConfig, landing=$landing]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'user'] = this.user;
      json[r'chatConfig'] = this.chatConfig;
      json[r'landing'] = this.landing;
    return json;
  }

  /// Returns a new [UsersMeResponseInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static UsersMeResponseInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'user'), 'Required key "UsersMeResponseInput[user]" is missing from JSON.');
        assert(json[r'user'] != null, 'Required key "UsersMeResponseInput[user]" has a null value in JSON.');
        assert(json.containsKey(r'chatConfig'), 'Required key "UsersMeResponseInput[chatConfig]" is missing from JSON.');
        assert(json[r'chatConfig'] != null, 'Required key "UsersMeResponseInput[chatConfig]" has a null value in JSON.');
        assert(json.containsKey(r'landing'), 'Required key "UsersMeResponseInput[landing]" is missing from JSON.');
        assert(json[r'landing'] != null, 'Required key "UsersMeResponseInput[landing]" has a null value in JSON.');
        return true;
      }());

      return UsersMeResponseInput(
        user: UsersPublicUserInput.fromJson(json[r'user'])!,
        chatConfig: UsersChatConfigInput.fromJson(json[r'chatConfig'])!,
        landing: UsersLandingInput.fromJson(json[r'landing'])!,
      );
    }
    return null;
  }

  static List<UsersMeResponseInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <UsersMeResponseInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = UsersMeResponseInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, UsersMeResponseInput> mapFromJson(dynamic json) {
    final map = <String, UsersMeResponseInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = UsersMeResponseInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of UsersMeResponseInput-objects as value to a dart map
  static Map<String, List<UsersMeResponseInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<UsersMeResponseInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = UsersMeResponseInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'user',
    'chatConfig',
    'landing',
  };
}

