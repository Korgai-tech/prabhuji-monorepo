//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StatusLikeResult {
  /// Returns a new [StatusLikeResult] instance.
  StatusLikeResult({
    required this.statusId,
    required this.liked,
    required this.likeCount,
  });

  String statusId;

  bool liked;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int likeCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StatusLikeResult &&
    other.statusId == statusId &&
    other.liked == liked &&
    other.likeCount == likeCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (statusId.hashCode) +
    (liked.hashCode) +
    (likeCount.hashCode);

  @override
  String toString() => 'StatusLikeResult[statusId=$statusId, liked=$liked, likeCount=$likeCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'statusId'] = this.statusId;
      json[r'liked'] = this.liked;
      json[r'likeCount'] = this.likeCount;
    return json;
  }

  /// Returns a new [StatusLikeResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StatusLikeResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'statusId'), 'Required key "StatusLikeResult[statusId]" is missing from JSON.');
        assert(json[r'statusId'] != null, 'Required key "StatusLikeResult[statusId]" has a null value in JSON.');
        assert(json.containsKey(r'liked'), 'Required key "StatusLikeResult[liked]" is missing from JSON.');
        assert(json[r'liked'] != null, 'Required key "StatusLikeResult[liked]" has a null value in JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "StatusLikeResult[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "StatusLikeResult[likeCount]" has a null value in JSON.');
        return true;
      }());

      return StatusLikeResult(
        statusId: mapValueOfType<String>(json, r'statusId')!,
        liked: mapValueOfType<bool>(json, r'liked')!,
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
      );
    }
    return null;
  }

  static List<StatusLikeResult> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusLikeResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusLikeResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StatusLikeResult> mapFromJson(dynamic json) {
    final map = <String, StatusLikeResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StatusLikeResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StatusLikeResult-objects as value to a dart map
  static Map<String, List<StatusLikeResult>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StatusLikeResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StatusLikeResult.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'statusId',
    'liked',
    'likeCount',
  };
}

