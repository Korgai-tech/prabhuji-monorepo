//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RingtonePlayCountResultInput {
  /// Returns a new [RingtonePlayCountResultInput] instance.
  RingtonePlayCountResultInput({
    required this.ringtoneId,
    required this.counted,
    required this.playCount,
  });

  String ringtoneId;

  bool counted;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int playCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RingtonePlayCountResultInput &&
    other.ringtoneId == ringtoneId &&
    other.counted == counted &&
    other.playCount == playCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (ringtoneId.hashCode) +
    (counted.hashCode) +
    (playCount.hashCode);

  @override
  String toString() => 'RingtonePlayCountResultInput[ringtoneId=$ringtoneId, counted=$counted, playCount=$playCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'ringtoneId'] = this.ringtoneId;
      json[r'counted'] = this.counted;
      json[r'playCount'] = this.playCount;
    return json;
  }

  /// Returns a new [RingtonePlayCountResultInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RingtonePlayCountResultInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'ringtoneId'), 'Required key "RingtonePlayCountResultInput[ringtoneId]" is missing from JSON.');
        assert(json[r'ringtoneId'] != null, 'Required key "RingtonePlayCountResultInput[ringtoneId]" has a null value in JSON.');
        assert(json.containsKey(r'counted'), 'Required key "RingtonePlayCountResultInput[counted]" is missing from JSON.');
        assert(json[r'counted'] != null, 'Required key "RingtonePlayCountResultInput[counted]" has a null value in JSON.');
        assert(json.containsKey(r'playCount'), 'Required key "RingtonePlayCountResultInput[playCount]" is missing from JSON.');
        assert(json[r'playCount'] != null, 'Required key "RingtonePlayCountResultInput[playCount]" has a null value in JSON.');
        return true;
      }());

      return RingtonePlayCountResultInput(
        ringtoneId: mapValueOfType<String>(json, r'ringtoneId')!,
        counted: mapValueOfType<bool>(json, r'counted')!,
        playCount: mapValueOfType<int>(json, r'playCount')!,
      );
    }
    return null;
  }

  static List<RingtonePlayCountResultInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RingtonePlayCountResultInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RingtonePlayCountResultInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RingtonePlayCountResultInput> mapFromJson(dynamic json) {
    final map = <String, RingtonePlayCountResultInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RingtonePlayCountResultInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RingtonePlayCountResultInput-objects as value to a dart map
  static Map<String, List<RingtonePlayCountResultInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RingtonePlayCountResultInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RingtonePlayCountResultInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'ringtoneId',
    'counted',
    'playCount',
  };
}

