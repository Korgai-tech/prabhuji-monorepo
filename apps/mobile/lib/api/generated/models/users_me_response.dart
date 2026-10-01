//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class UsersMeResponse {
  /// Returns a new [UsersMeResponse] instance.
  UsersMeResponse({
    required this.user,
    required this.chatConfig,
    required this.landing,
  });

  UsersPublicUser user;

  UsersChatConfig chatConfig;

  UsersLanding landing;

  @override
  bool operator ==(Object other) => identical(this, other) || other is UsersMeResponse &&
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
  String toString() => 'UsersMeResponse[user=$user, chatConfig=$chatConfig, landing=$landing]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'user'] = this.user;
      json[r'chatConfig'] = this.chatConfig;
      json[r'landing'] = this.landing;
    return json;
  }

  /// Returns a new [UsersMeResponse] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static UsersMeResponse? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'user'), 'Required key "UsersMeResponse[user]" is missing from JSON.');
        assert(json[r'user'] != null, 'Required key "UsersMeResponse[user]" has a null value in JSON.');
        assert(json.containsKey(r'chatConfig'), 'Required key "UsersMeResponse[chatConfig]" is missing from JSON.');
        assert(json[r'chatConfig'] != null, 'Required key "UsersMeResponse[chatConfig]" has a null value in JSON.');
        assert(json.containsKey(r'landing'), 'Required key "UsersMeResponse[landing]" is missing from JSON.');
        assert(json[r'landing'] != null, 'Required key "UsersMeResponse[landing]" has a null value in JSON.');
        return true;
      }());

      return UsersMeResponse(
        user: UsersPublicUser.fromJson(json[r'user'])!,
        chatConfig: UsersChatConfig.fromJson(json[r'chatConfig'])!,
        landing: UsersLanding.fromJson(json[r'landing'])!,
      );
    }
    return null;
  }

  static List<UsersMeResponse> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <UsersMeResponse>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = UsersMeResponse.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, UsersMeResponse> mapFromJson(dynamic json) {
    final map = <String, UsersMeResponse>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = UsersMeResponse.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of UsersMeResponse-objects as value to a dart map
  static Map<String, List<UsersMeResponse>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<UsersMeResponse>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = UsersMeResponse.listFromJson(entry.value, growable: growable,);
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

