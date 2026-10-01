//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StatusAvatarPresignBodyInput {
  /// Returns a new [StatusAvatarPresignBodyInput] instance.
  StatusAvatarPresignBodyInput({
    required this.contentType,
    required this.sizeBytes,
  });

  String contentType;

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  int sizeBytes;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StatusAvatarPresignBodyInput &&
    other.contentType == contentType &&
    other.sizeBytes == sizeBytes;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (contentType.hashCode) +
    (sizeBytes.hashCode);

  @override
  String toString() => 'StatusAvatarPresignBodyInput[contentType=$contentType, sizeBytes=$sizeBytes]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'contentType'] = this.contentType;
      json[r'sizeBytes'] = this.sizeBytes;
    return json;
  }

  /// Returns a new [StatusAvatarPresignBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StatusAvatarPresignBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'contentType'), 'Required key "StatusAvatarPresignBodyInput[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "StatusAvatarPresignBodyInput[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'sizeBytes'), 'Required key "StatusAvatarPresignBodyInput[sizeBytes]" is missing from JSON.');
        assert(json[r'sizeBytes'] != null, 'Required key "StatusAvatarPresignBodyInput[sizeBytes]" has a null value in JSON.');
        return true;
      }());

      return StatusAvatarPresignBodyInput(
        contentType: mapValueOfType<String>(json, r'contentType')!,
        sizeBytes: mapValueOfType<int>(json, r'sizeBytes')!,
      );
    }
    return null;
  }

  static List<StatusAvatarPresignBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusAvatarPresignBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusAvatarPresignBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StatusAvatarPresignBodyInput> mapFromJson(dynamic json) {
    final map = <String, StatusAvatarPresignBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StatusAvatarPresignBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StatusAvatarPresignBodyInput-objects as value to a dart map
  static Map<String, List<StatusAvatarPresignBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StatusAvatarPresignBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StatusAvatarPresignBodyInput.listFromJson(entry.value, growable: growable,);
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

