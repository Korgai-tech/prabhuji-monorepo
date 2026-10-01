//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiPlayResult {
  /// Returns a new [AartiPlayResult] instance.
  AartiPlayResult({
    required this.audioId,
    required this.playCount,
    required this.lastPlayedAt,
    required this.lastPositionSeconds,
  });

  String audioId;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int playCount;

  DateTime lastPlayedAt;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int? lastPositionSeconds;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiPlayResult &&
    other.audioId == audioId &&
    other.playCount == playCount &&
    other.lastPlayedAt == lastPlayedAt &&
    other.lastPositionSeconds == lastPositionSeconds;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (audioId.hashCode) +
    (playCount.hashCode) +
    (lastPlayedAt.hashCode) +
    (lastPositionSeconds == null ? 0 : lastPositionSeconds!.hashCode);

  @override
  String toString() => 'AartiPlayResult[audioId=$audioId, playCount=$playCount, lastPlayedAt=$lastPlayedAt, lastPositionSeconds=$lastPositionSeconds]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'audioId'] = this.audioId;
      json[r'playCount'] = this.playCount;
      json[r'lastPlayedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.lastPlayedAt.millisecondsSinceEpoch
        : this.lastPlayedAt.toUtc().toIso8601String();
    if (this.lastPositionSeconds != null) {
      json[r'lastPositionSeconds'] = this.lastPositionSeconds;
    } else {
      json[r'lastPositionSeconds'] = null;
    }
    return json;
  }

  /// Returns a new [AartiPlayResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiPlayResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'audioId'), 'Required key "AartiPlayResult[audioId]" is missing from JSON.');
        assert(json[r'audioId'] != null, 'Required key "AartiPlayResult[audioId]" has a null value in JSON.');
        assert(json.containsKey(r'playCount'), 'Required key "AartiPlayResult[playCount]" is missing from JSON.');
        assert(json[r'playCount'] != null, 'Required key "AartiPlayResult[playCount]" has a null value in JSON.');
        assert(json.containsKey(r'lastPlayedAt'), 'Required key "AartiPlayResult[lastPlayedAt]" is missing from JSON.');
        assert(json[r'lastPlayedAt'] != null, 'Required key "AartiPlayResult[lastPlayedAt]" has a null value in JSON.');
        assert(json.containsKey(r'lastPositionSeconds'), 'Required key "AartiPlayResult[lastPositionSeconds]" is missing from JSON.');
        return true;
      }());

      return AartiPlayResult(
        audioId: mapValueOfType<String>(json, r'audioId')!,
        playCount: mapValueOfType<int>(json, r'playCount')!,
        lastPlayedAt: mapDateTime(json, r'lastPlayedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')!,
        lastPositionSeconds: mapValueOfType<int>(json, r'lastPositionSeconds'),
      );
    }
    return null;
  }

  static List<AartiPlayResult> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiPlayResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiPlayResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiPlayResult> mapFromJson(dynamic json) {
    final map = <String, AartiPlayResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiPlayResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiPlayResult-objects as value to a dart map
  static Map<String, List<AartiPlayResult>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiPlayResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiPlayResult.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'audioId',
    'playCount',
    'lastPlayedAt',
    'lastPositionSeconds',
  };
}

