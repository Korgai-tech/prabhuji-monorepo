//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraListItem {
  /// Returns a new [MantraListItem] instance.
  MantraListItem({
    required this.id,
    required this.title,
    required this.artworkUrl,
    required this.singerName,
    this.languages = const [],
    required this.audioUrl,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
  });

  String id;

  String title;

  String artworkUrl;

  String? singerName;

  List<String> languages;

  String? audioUrl;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int likeCount;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int shareCount;

  bool likedByMe;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraListItem &&
    other.id == id &&
    other.title == title &&
    other.artworkUrl == artworkUrl &&
    other.singerName == singerName &&
    _deepEquality.equals(other.languages, languages) &&
    other.audioUrl == audioUrl &&
    other.likeCount == likeCount &&
    other.shareCount == shareCount &&
    other.likedByMe == likedByMe;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (title.hashCode) +
    (artworkUrl.hashCode) +
    (singerName == null ? 0 : singerName!.hashCode) +
    (languages.hashCode) +
    (audioUrl == null ? 0 : audioUrl!.hashCode) +
    (likeCount.hashCode) +
    (shareCount.hashCode) +
    (likedByMe.hashCode);

  @override
  String toString() => 'MantraListItem[id=$id, title=$title, artworkUrl=$artworkUrl, singerName=$singerName, languages=$languages, audioUrl=$audioUrl, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'title'] = this.title;
      json[r'artworkUrl'] = this.artworkUrl;
    if (this.singerName != null) {
      json[r'singerName'] = this.singerName;
    } else {
      json[r'singerName'] = null;
    }
      json[r'languages'] = this.languages;
    if (this.audioUrl != null) {
      json[r'audioUrl'] = this.audioUrl;
    } else {
      json[r'audioUrl'] = null;
    }
      json[r'likeCount'] = this.likeCount;
      json[r'shareCount'] = this.shareCount;
      json[r'likedByMe'] = this.likedByMe;
    return json;
  }

  /// Returns a new [MantraListItem] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraListItem? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "MantraListItem[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "MantraListItem[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "MantraListItem[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "MantraListItem[title]" has a null value in JSON.');
        assert(json.containsKey(r'artworkUrl'), 'Required key "MantraListItem[artworkUrl]" is missing from JSON.');
        assert(json[r'artworkUrl'] != null, 'Required key "MantraListItem[artworkUrl]" has a null value in JSON.');
        assert(json.containsKey(r'singerName'), 'Required key "MantraListItem[singerName]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "MantraListItem[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "MantraListItem[languages]" has a null value in JSON.');
        assert(json.containsKey(r'audioUrl'), 'Required key "MantraListItem[audioUrl]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "MantraListItem[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "MantraListItem[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "MantraListItem[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "MantraListItem[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "MantraListItem[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "MantraListItem[likedByMe]" has a null value in JSON.');
        return true;
      }());

      return MantraListItem(
        id: mapValueOfType<String>(json, r'id')!,
        title: mapValueOfType<String>(json, r'title')!,
        artworkUrl: mapValueOfType<String>(json, r'artworkUrl')!,
        singerName: mapValueOfType<String>(json, r'singerName'),
        languages: json[r'languages'] is Iterable
            ? (json[r'languages'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        audioUrl: mapValueOfType<String>(json, r'audioUrl'),
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
        shareCount: mapValueOfType<int>(json, r'shareCount')!,
        likedByMe: mapValueOfType<bool>(json, r'likedByMe')!,
      );
    }
    return null;
  }

  static List<MantraListItem> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraListItem>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraListItem.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraListItem> mapFromJson(dynamic json) {
    final map = <String, MantraListItem>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraListItem.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraListItem-objects as value to a dart map
  static Map<String, List<MantraListItem>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraListItem>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraListItem.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'title',
    'artworkUrl',
    'singerName',
    'languages',
    'audioUrl',
    'likeCount',
    'shareCount',
    'likedByMe',
  };
}

