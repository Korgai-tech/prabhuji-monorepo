//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StatusAvatarPresignBody {
  /// Returns a new [StatusAvatarPresignBody] instance.
  StatusAvatarPresignBody({
    required this.contentType,
    required this.sizeBytes,
  });

  String contentType;

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  int sizeBytes;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StatusAvatarPresignBody &&
    other.contentType == contentType &&
    other.sizeBytes == sizeBytes;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (contentType.hashCode) +
    (sizeBytes.hashCode);

  @override
  String toString() => 'StatusAvatarPresignBody[contentType=$contentType, sizeBytes=$sizeBytes]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'contentType'] = this.contentType;
      json[r'sizeBytes'] = this.sizeBytes;
    return json;
  }

  /// Returns a new [StatusAvatarPresignBody] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StatusAvatarPresignBody? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'contentType'), 'Required key "StatusAvatarPresignBody[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "StatusAvatarPresignBody[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'sizeBytes'), 'Required key "StatusAvatarPresignBody[sizeBytes]" is missing from JSON.');
        assert(json[r'sizeBytes'] != null, 'Required key "StatusAvatarPresignBody[sizeBytes]" has a null value in JSON.');
        return true;
      }());

      return StatusAvatarPresignBody(
        contentType: mapValueOfType<String>(json, r'contentType')!,
        sizeBytes: mapValueOfType<int>(json, r'sizeBytes')!,
      );
    }
    return null;
  }

  static List<StatusAvatarPresignBody> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusAvatarPresignBody>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusAvatarPresignBody.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StatusAvatarPresignBody> mapFromJson(dynamic json) {
    final map = <String, StatusAvatarPresignBody>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StatusAvatarPresignBody.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StatusAvatarPresignBody-objects as value to a dart map
  static Map<String, List<StatusAvatarPresignBody>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StatusAvatarPresignBody>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StatusAvatarPresignBody.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'contentType',
    'sizeBytes',
  };
}

