//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraRecentlyPlayedResultInput {
  /// Returns a new [MantraRecentlyPlayedResultInput] instance.
  MantraRecentlyPlayedResultInput({
    required this.itemId,
    required this.playCount,
    required this.lastPlayedAt,
    required this.lastProgressSeconds,
  });

  String itemId;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int playCount;

  DateTime lastPlayedAt;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int? lastProgressSeconds;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraRecentlyPlayedResultInput &&
    other.itemId == itemId &&
    other.playCount == playCount &&
    other.lastPlayedAt == lastPlayedAt &&
    other.lastProgressSeconds == lastProgressSeconds;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (itemId.hashCode) +
    (playCount.hashCode) +
    (lastPlayedAt.hashCode) +
    (lastProgressSeconds == null ? 0 : lastProgressSeconds!.hashCode);

  @override
  String toString() => 'MantraRecentlyPlayedResultInput[itemId=$itemId, playCount=$playCount, lastPlayedAt=$lastPlayedAt, lastProgressSeconds=$lastProgressSeconds]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'itemId'] = this.itemId;
      json[r'playCount'] = this.playCount;
      json[r'lastPlayedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.lastPlayedAt.millisecondsSinceEpoch
        : this.lastPlayedAt.toUtc().toIso8601String();
    if (this.lastProgressSeconds != null) {
      json[r'lastProgressSeconds'] = this.lastProgressSeconds;
    } else {
      json[r'lastProgressSeconds'] = null;
    }
    return json;
  }

  /// Returns a new [MantraRecentlyPlayedResultInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraRecentlyPlayedResultInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'itemId'), 'Required key "MantraRecentlyPlayedResultInput[itemId]" is missing from JSON.');
        assert(json[r'itemId'] != null, 'Required key "MantraRecentlyPlayedResultInput[itemId]" has a null value in JSON.');
        assert(json.containsKey(r'playCount'), 'Required key "MantraRecentlyPlayedResultInput[playCount]" is missing from JSON.');
        assert(json[r'playCount'] != null, 'Required key "MantraRecentlyPlayedResultInput[playCount]" has a null value in JSON.');
        assert(json.containsKey(r'lastPlayedAt'), 'Required key "MantraRecentlyPlayedResultInput[lastPlayedAt]" is missing from JSON.');
        assert(json[r'lastPlayedAt'] != null, 'Required key "MantraRecentlyPlayedResultInput[lastPlayedAt]" has a null value in JSON.');
        assert(json.containsKey(r'lastProgressSeconds'), 'Required key "MantraRecentlyPlayedResultInput[lastProgressSeconds]" is missing from JSON.');
        return true;
      }());

      return MantraRecentlyPlayedResultInput(
        itemId: mapValueOfType<String>(json, r'itemId')!,
        playCount: mapValueOfType<int>(json, r'playCount')!,
        lastPlayedAt: mapDateTime(json, r'lastPlayedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')!,
        lastProgressSeconds: mapValueOfType<int>(json, r'lastProgressSeconds'),
      );
    }
    return null;
  }

  static List<MantraRecentlyPlayedResultInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraRecentlyPlayedResultInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraRecentlyPlayedResultInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraRecentlyPlayedResultInput> mapFromJson(dynamic json) {
    final map = <String, MantraRecentlyPlayedResultInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraRecentlyPlayedResultInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraRecentlyPlayedResultInput-objects as value to a dart map
  static Map<String, List<MantraRecentlyPlayedResultInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraRecentlyPlayedResultInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraRecentlyPlayedResultInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'itemId',
    'playCount',
    'lastPlayedAt',
    'lastProgressSeconds',
  };
}

