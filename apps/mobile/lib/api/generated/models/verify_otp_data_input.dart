//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class VerifyOtpDataInput {
  /// Returns a new [VerifyOtpDataInput] instance.
  VerifyOtpDataInput({
    required this.token,
    required this.user,
    required this.isNewUser,
  });

  String token;

  OtpPublicUserInput user;

  bool isNewUser;

  @override
  bool operator ==(Object other) => identical(this, other) || other is VerifyOtpDataInput &&
    other.token == token &&
    other.user == user &&
    other.isNewUser == isNewUser;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (token.hashCode) +
    (user.hashCode) +
    (isNewUser.hashCode);

  @override
  String toString() => 'VerifyOtpDataInput[token=$token, user=$user, isNewUser=$isNewUser]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'token'] = this.token;
      json[r'user'] = this.user;
      json[r'isNewUser'] = this.isNewUser;
    return json;
  }

  /// Returns a new [VerifyOtpDataInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static VerifyOtpDataInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'token'), 'Required key "VerifyOtpDataInput[token]" is missing from JSON.');
        assert(json[r'token'] != null, 'Required key "VerifyOtpDataInput[token]" has a null value in JSON.');
        assert(json.containsKey(r'user'), 'Required key "VerifyOtpDataInput[user]" is missing from JSON.');
        assert(json[r'user'] != null, 'Required key "VerifyOtpDataInput[user]" has a null value in JSON.');
        assert(json.containsKey(r'isNewUser'), 'Required key "VerifyOtpDataInput[isNewUser]" is missing from JSON.');
        assert(json[r'isNewUser'] != null, 'Required key "VerifyOtpDataInput[isNewUser]" has a null value in JSON.');
        return true;
      }());

      return VerifyOtpDataInput(
        token: mapValueOfType<String>(json, r'token')!,
        user: OtpPublicUserInput.fromJson(json[r'user'])!,
        isNewUser: mapValueOfType<bool>(json, r'isNewUser')!,
      );
    }
    return null;
  }

  static List<VerifyOtpDataInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <VerifyOtpDataInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = VerifyOtpDataInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, VerifyOtpDataInput> mapFromJson(dynamic json) {
    final map = <String, VerifyOtpDataInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = VerifyOtpDataInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of VerifyOtpDataInput-objects as value to a dart map
  static Map<String, List<VerifyOtpDataInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<VerifyOtpDataInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = VerifyOtpDataInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'token',
    'user',
    'isNewUser',
  };
}

