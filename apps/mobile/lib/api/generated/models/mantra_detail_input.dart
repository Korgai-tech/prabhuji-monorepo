//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraDetailInput {
  /// Returns a new [MantraDetailInput] instance.
  MantraDetailInput({
    required this.id,
    required this.title,
    required this.artworkUrl,
    required this.singerName,
    this.languages = const [],
    required this.audioUrl,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
    required this.mantraText,
    required this.transliterationText,
    required this.deepLinkUrl,
    required this.deity,
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

  String mantraText;

  String? transliterationText;

  String? deepLinkUrl;

  MantraDeityCardInput? deity;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraDetailInput &&
    other.id == id &&
    other.title == title &&
    other.artworkUrl == artworkUrl &&
    other.singerName == singerName &&
    _deepEquality.equals(other.languages, languages) &&
    other.audioUrl == audioUrl &&
    other.likeCount == likeCount &&
    other.shareCount == shareCount &&
    other.likedByMe == likedByMe &&
    other.mantraText == mantraText &&
    other.transliterationText == transliterationText &&
    other.deepLinkUrl == deepLinkUrl &&
    other.deity == deity;

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
    (likedByMe.hashCode) +
    (mantraText.hashCode) +
    (transliterationText == null ? 0 : transliterationText!.hashCode) +
    (deepLinkUrl == null ? 0 : deepLinkUrl!.hashCode) +
    (deity == null ? 0 : deity!.hashCode);

  @override
  String toString() => 'MantraDetailInput[id=$id, title=$title, artworkUrl=$artworkUrl, singerName=$singerName, languages=$languages, audioUrl=$audioUrl, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe, mantraText=$mantraText, transliterationText=$transliterationText, deepLinkUrl=$deepLinkUrl, deity=$deity]';

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
      json[r'mantraText'] = this.mantraText;
    if (this.transliterationText != null) {
      json[r'transliterationText'] = this.transliterationText;
    } else {
      json[r'transliterationText'] = null;
    }
    if (this.deepLinkUrl != null) {
      json[r'deepLinkUrl'] = this.deepLinkUrl;
    } else {
      json[r'deepLinkUrl'] = null;
    }
    if (this.deity != null) {
      json[r'deity'] = this.deity;
    } else {
      json[r'deity'] = null;
    }
    return json;
  }

  /// Returns a new [MantraDetailInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraDetailInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "MantraDetailInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "MantraDetailInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "MantraDetailInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "MantraDetailInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'artworkUrl'), 'Required key "MantraDetailInput[artworkUrl]" is missing from JSON.');
        assert(json[r'artworkUrl'] != null, 'Required key "MantraDetailInput[artworkUrl]" has a null value in JSON.');
        assert(json.containsKey(r'singerName'), 'Required key "MantraDetailInput[singerName]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "MantraDetailInput[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "MantraDetailInput[languages]" has a null value in JSON.');
        assert(json.containsKey(r'audioUrl'), 'Required key "MantraDetailInput[audioUrl]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "MantraDetailInput[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "MantraDetailInput[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "MantraDetailInput[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "MantraDetailInput[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "MantraDetailInput[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "MantraDetailInput[likedByMe]" has a null value in JSON.');
        assert(json.containsKey(r'mantraText'), 'Required key "MantraDetailInput[mantraText]" is missing from JSON.');
        assert(json[r'mantraText'] != null, 'Required key "MantraDetailInput[mantraText]" has a null value in JSON.');
        assert(json.containsKey(r'transliterationText'), 'Required key "MantraDetailInput[transliterationText]" is missing from JSON.');
        assert(json.containsKey(r'deepLinkUrl'), 'Required key "MantraDetailInput[deepLinkUrl]" is missing from JSON.');
        assert(json.containsKey(r'deity'), 'Required key "MantraDetailInput[deity]" is missing from JSON.');
        return true;
      }());

      return MantraDetailInput(
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
        mantraText: mapValueOfType<String>(json, r'mantraText')!,
        transliterationText: mapValueOfType<String>(json, r'transliterationText'),
        deepLinkUrl: mapValueOfType<String>(json, r'deepLinkUrl'),
        deity: MantraDeityCardInput.fromJson(json[r'deity']),
      );
    }
    return null;
  }

  static List<MantraDetailInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraDetailInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraDetailInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraDetailInput> mapFromJson(dynamic json) {
    final map = <String, MantraDetailInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraDetailInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraDetailInput-objects as value to a dart map
  static Map<String, List<MantraDetailInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraDetailInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraDetailInput.listFromJson(entry.value, growable: growable,);
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
    'mantraText',
    'transliterationText',
    'deepLinkUrl',
    'deity',
  };
}

