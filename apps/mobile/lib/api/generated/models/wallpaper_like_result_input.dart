//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class WallpaperLikeResultInput {
  /// Returns a new [WallpaperLikeResultInput] instance.
  WallpaperLikeResultInput({
    required this.wallpaperId,
    required this.liked,
    required this.likeCount,
  });

  String wallpaperId;

  bool liked;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int likeCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is WallpaperLikeResultInput &&
    other.wallpaperId == wallpaperId &&
    other.liked == liked &&
    other.likeCount == likeCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (wallpaperId.hashCode) +
    (liked.hashCode) +
    (likeCount.hashCode);

  @override
  String toString() => 'WallpaperLikeResultInput[wallpaperId=$wallpaperId, liked=$liked, likeCount=$likeCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'wallpaperId'] = this.wallpaperId;
      json[r'liked'] = this.liked;
      json[r'likeCount'] = this.likeCount;
    return json;
  }

  /// Returns a new [WallpaperLikeResultInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static WallpaperLikeResultInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'wallpaperId'), 'Required key "WallpaperLikeResultInput[wallpaperId]" is missing from JSON.');
        assert(json[r'wallpaperId'] != null, 'Required key "WallpaperLikeResultInput[wallpaperId]" has a null value in JSON.');
        assert(json.containsKey(r'liked'), 'Required key "WallpaperLikeResultInput[liked]" is missing from JSON.');
        assert(json[r'liked'] != null, 'Required key "WallpaperLikeResultInput[liked]" has a null value in JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "WallpaperLikeResultInput[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "WallpaperLikeResultInput[likeCount]" has a null value in JSON.');
        return true;
      }());

      return WallpaperLikeResultInput(
        wallpaperId: mapValueOfType<String>(json, r'wallpaperId')!,
        liked: mapValueOfType<bool>(json, r'liked')!,
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
      );
    }
    return null;
  }

  static List<WallpaperLikeResultInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperLikeResultInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperLikeResultInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, WallpaperLikeResultInput> mapFromJson(dynamic json) {
    final map = <String, WallpaperLikeResultInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = WallpaperLikeResultInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of WallpaperLikeResultInput-objects as value to a dart map
  static Map<String, List<WallpaperLikeResultInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<WallpaperLikeResultInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = WallpaperLikeResultInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'wallpaperId',
    'liked',
    'likeCount',
  };
}

