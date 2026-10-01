//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StatusAvatarPresignDataInput {
  /// Returns a new [StatusAvatarPresignDataInput] instance.
  StatusAvatarPresignDataInput({
    required this.uploadUrl,
    required this.publicUrl,
    required this.key,
    required this.expiresAt,
    this.headers = const {},
  });

  String uploadUrl;

  String publicUrl;

  String key;

  DateTime expiresAt;

  Map<String, String> headers;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StatusAvatarPresignDataInput &&
    other.uploadUrl == uploadUrl &&
    other.publicUrl == publicUrl &&
    other.key == key &&
    other.expiresAt == expiresAt &&
    _deepEquality.equals(other.headers, headers);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (uploadUrl.hashCode) +
    (publicUrl.hashCode) +
    (key.hashCode) +
    (expiresAt.hashCode) +
    (headers.hashCode);

  @override
  String toString() => 'StatusAvatarPresignDataInput[uploadUrl=$uploadUrl, publicUrl=$publicUrl, key=$key, expiresAt=$expiresAt, headers=$headers]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'uploadUrl'] = this.uploadUrl;
      json[r'publicUrl'] = this.publicUrl;
      json[r'key'] = this.key;
      json[r'expiresAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.expiresAt.millisecondsSinceEpoch
        : this.expiresAt.toUtc().toIso8601String();
      json[r'headers'] = this.headers;
    return json;
  }

  /// Returns a new [StatusAvatarPresignDataInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StatusAvatarPresignDataInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'uploadUrl'), 'Required key "StatusAvatarPresignDataInput[uploadUrl]" is missing from JSON.');
        assert(json[r'uploadUrl'] != null, 'Required key "StatusAvatarPresignDataInput[uploadUrl]" has a null value in JSON.');
        assert(json.containsKey(r'publicUrl'), 'Required key "StatusAvatarPresignDataInput[publicUrl]" is missing from JSON.');
        assert(json[r'publicUrl'] != null, 'Required key "StatusAvatarPresignDataInput[publicUrl]" has a null value in JSON.');
        assert(json.containsKey(r'key'), 'Required key "StatusAvatarPresignDataInput[key]" is missing from JSON.');
        assert(json[r'key'] != null, 'Required key "StatusAvatarPresignDataInput[key]" has a null value in JSON.');
        assert(json.containsKey(r'expiresAt'), 'Required key "StatusAvatarPresignDataInput[expiresAt]" is missing from JSON.');
        assert(json[r'expiresAt'] != null, 'Required key "StatusAvatarPresignDataInput[expiresAt]" has a null value in JSON.');
        assert(json.containsKey(r'headers'), 'Required key "StatusAvatarPresignDataInput[headers]" is missing from JSON.');
        assert(json[r'headers'] != null, 'Required key "StatusAvatarPresignDataInput[headers]" has a null value in JSON.');
        return true;
      }());

      return StatusAvatarPresignDataInput(
        uploadUrl: mapValueOfType<String>(json, r'uploadUrl')!,
        publicUrl: mapValueOfType<String>(json, r'publicUrl')!,
        key: mapValueOfType<String>(json, r'key')!,
        expiresAt: mapDateTime(json, r'expiresAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')!,
        headers: mapCastOfType<String, String>(json, r'headers')!,
      );
    }
    return null;
  }

  static List<StatusAvatarPresignDataInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusAvatarPresignDataInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusAvatarPresignDataInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StatusAvatarPresignDataInput> mapFromJson(dynamic json) {
    final map = <String, StatusAvatarPresignDataInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StatusAvatarPresignDataInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StatusAvatarPresignDataInput-objects as value to a dart map
  static Map<String, List<StatusAvatarPresignDataInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StatusAvatarPresignDataInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StatusAvatarPresignDataInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'uploadUrl',
    'publicUrl',
    'key',
    'expiresAt',
    'headers',
  };
}

