//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeLikeResultInput {
  /// Returns a new [HomeLikeResultInput] instance.
  HomeLikeResultInput({
    required this.liked,
    required this.likeCount,
  });

  bool liked;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int likeCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeLikeResultInput &&
    other.liked == liked &&
    other.likeCount == likeCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (liked.hashCode) +
    (likeCount.hashCode);

  @override
  String toString() => 'HomeLikeResultInput[liked=$liked, likeCount=$likeCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'liked'] = this.liked;
      json[r'likeCount'] = this.likeCount;
    return json;
  }

  /// Returns a new [HomeLikeResultInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeLikeResultInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'liked'), 'Required key "HomeLikeResultInput[liked]" is missing from JSON.');
        assert(json[r'liked'] != null, 'Required key "HomeLikeResultInput[liked]" has a null value in JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "HomeLikeResultInput[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "HomeLikeResultInput[likeCount]" has a null value in JSON.');
        return true;
      }());

      return HomeLikeResultInput(
        liked: mapValueOfType<bool>(json, r'liked')!,
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
      );
    }
    return null;
  }

  static List<HomeLikeResultInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeLikeResultInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeLikeResultInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeLikeResultInput> mapFromJson(dynamic json) {
    final map = <String, HomeLikeResultInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeLikeResultInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeLikeResultInput-objects as value to a dart map
  static Map<String, List<HomeLikeResultInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeLikeResultInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeLikeResultInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'liked',
    'likeCount',
  };
}

