//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RingtonePlayCountBodyInput {
  /// Returns a new [RingtonePlayCountBodyInput] instance.
  RingtonePlayCountBodyInput({
    required this.sessionToken,
    required this.playbackPositionSeconds,
  });

  String sessionToken;

  /// Minimum value: 0
  num playbackPositionSeconds;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RingtonePlayCountBodyInput &&
    other.sessionToken == sessionToken &&
    other.playbackPositionSeconds == playbackPositionSeconds;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (sessionToken.hashCode) +
    (playbackPositionSeconds.hashCode);

  @override
  String toString() => 'RingtonePlayCountBodyInput[sessionToken=$sessionToken, playbackPositionSeconds=$playbackPositionSeconds]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'sessionToken'] = this.sessionToken;
      json[r'playbackPositionSeconds'] = this.playbackPositionSeconds;
    return json;
  }

  /// Returns a new [RingtonePlayCountBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RingtonePlayCountBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'sessionToken'), 'Required key "RingtonePlayCountBodyInput[sessionToken]" is missing from JSON.');
        assert(json[r'sessionToken'] != null, 'Required key "RingtonePlayCountBodyInput[sessionToken]" has a null value in JSON.');
        assert(json.containsKey(r'playbackPositionSeconds'), 'Required key "RingtonePlayCountBodyInput[playbackPositionSeconds]" is missing from JSON.');
        assert(json[r'playbackPositionSeconds'] != null, 'Required key "RingtonePlayCountBodyInput[playbackPositionSeconds]" has a null value in JSON.');
        return true;
      }());

      return RingtonePlayCountBodyInput(
        sessionToken: mapValueOfType<String>(json, r'sessionToken')!,
        playbackPositionSeconds: num.parse('${json[r'playbackPositionSeconds']}'),
      );
    }
    return null;
  }

  static List<RingtonePlayCountBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RingtonePlayCountBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RingtonePlayCountBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RingtonePlayCountBodyInput> mapFromJson(dynamic json) {
    final map = <String, RingtonePlayCountBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RingtonePlayCountBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RingtonePlayCountBodyInput-objects as value to a dart map
  static Map<String, List<RingtonePlayCountBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RingtonePlayCountBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RingtonePlayCountBodyInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'sessionToken',
    'playbackPositionSeconds',
  };
}

