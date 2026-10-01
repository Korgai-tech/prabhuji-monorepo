//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LoginData {
  /// Returns a new [LoginData] instance.
  LoginData({
    required this.token,
    required this.user,
  });

  String token;

  PublicUser user;

  @override
  bool operator ==(Object other) => identical(this, other) || other is LoginData &&
    other.token == token &&
    other.user == user;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (token.hashCode) +
    (user.hashCode);

  @override
  String toString() => 'LoginData[token=$token, user=$user]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'token'] = this.token;
      json[r'user'] = this.user;
    return json;
  }

  /// Returns a new [LoginData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LoginData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'token'), 'Required key "LoginData[token]" is missing from JSON.');
        assert(json[r'token'] != null, 'Required key "LoginData[token]" has a null value in JSON.');
        assert(json.containsKey(r'user'), 'Required key "LoginData[user]" is missing from JSON.');
        assert(json[r'user'] != null, 'Required key "LoginData[user]" has a null value in JSON.');
        return true;
      }());

      return LoginData(
        token: mapValueOfType<String>(json, r'token')!,
        user: PublicUser.fromJson(json[r'user'])!,
      );
    }
    return null;
  }

  static List<LoginData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <LoginData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LoginData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LoginData> mapFromJson(dynamic json) {
    final map = <String, LoginData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = LoginData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LoginData-objects as value to a dart map
  static Map<String, List<LoginData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<LoginData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LoginData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'token',
    'user',
  };
}

