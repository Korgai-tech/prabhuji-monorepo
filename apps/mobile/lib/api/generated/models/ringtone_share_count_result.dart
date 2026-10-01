//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RingtoneShareCountResult {
  /// Returns a new [RingtoneShareCountResult] instance.
  RingtoneShareCountResult({
    required this.ringtoneId,
    required this.shareCount,
  });

  String ringtoneId;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int shareCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RingtoneShareCountResult &&
    other.ringtoneId == ringtoneId &&
    other.shareCount == shareCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (ringtoneId.hashCode) +
    (shareCount.hashCode);

  @override
  String toString() => 'RingtoneShareCountResult[ringtoneId=$ringtoneId, shareCount=$shareCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'ringtoneId'] = this.ringtoneId;
      json[r'shareCount'] = this.shareCount;
    return json;
  }

  /// Returns a new [RingtoneShareCountResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RingtoneShareCountResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'ringtoneId'), 'Required key "RingtoneShareCountResult[ringtoneId]" is missing from JSON.');
        assert(json[r'ringtoneId'] != null, 'Required key "RingtoneShareCountResult[ringtoneId]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "RingtoneShareCountResult[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "RingtoneShareCountResult[shareCount]" has a null value in JSON.');
        return true;
      }());

      return RingtoneShareCountResult(
        ringtoneId: mapValueOfType<String>(json, r'ringtoneId')!,
        shareCount: mapValueOfType<int>(json, r'shareCount')!,
      );
    }
    return null;
  }

  static List<RingtoneShareCountResult> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RingtoneShareCountResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RingtoneShareCountResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RingtoneShareCountResult> mapFromJson(dynamic json) {
    final map = <String, RingtoneShareCountResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RingtoneShareCountResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RingtoneShareCountResult-objects as value to a dart map
  static Map<String, List<RingtoneShareCountResult>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RingtoneShareCountResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RingtoneShareCountResult.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'ringtoneId',
    'shareCount',
  };
}

