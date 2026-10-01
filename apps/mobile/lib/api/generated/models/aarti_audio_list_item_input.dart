//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiAudioListItemInput {
  /// Returns a new [AartiAudioListItemInput] instance.
  AartiAudioListItemInput({
    required this.id,
    required this.title,
    required this.coverImageUrl,
    required this.singerName,
    required this.composerNames,
    this.languages = const [],
    required this.isPrabhujiOriginal,
    required this.audioStreamUrl,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
  });

  String id;

  String title;

  String coverImageUrl;

  String? singerName;

  String? composerNames;

  List<String> languages;

  bool isPrabhujiOriginal;

  String? audioStreamUrl;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int likeCount;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int shareCount;

  bool likedByMe;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiAudioListItemInput &&
    other.id == id &&
    other.title == title &&
    other.coverImageUrl == coverImageUrl &&
    other.singerName == singerName &&
    other.composerNames == composerNames &&
    _deepEquality.equals(other.languages, languages) &&
    other.isPrabhujiOriginal == isPrabhujiOriginal &&
    other.audioStreamUrl == audioStreamUrl &&
    other.likeCount == likeCount &&
    other.shareCount == shareCount &&
    other.likedByMe == likedByMe;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (title.hashCode) +
    (coverImageUrl.hashCode) +
    (singerName == null ? 0 : singerName!.hashCode) +
    (composerNames == null ? 0 : composerNames!.hashCode) +
    (languages.hashCode) +
    (isPrabhujiOriginal.hashCode) +
    (audioStreamUrl == null ? 0 : audioStreamUrl!.hashCode) +
    (likeCount.hashCode) +
    (shareCount.hashCode) +
    (likedByMe.hashCode);

  @override
  String toString() => 'AartiAudioListItemInput[id=$id, title=$title, coverImageUrl=$coverImageUrl, singerName=$singerName, composerNames=$composerNames, languages=$languages, isPrabhujiOriginal=$isPrabhujiOriginal, audioStreamUrl=$audioStreamUrl, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'title'] = this.title;
      json[r'coverImageUrl'] = this.coverImageUrl;
    if (this.singerName != null) {
      json[r'singerName'] = this.singerName;
    } else {
      json[r'singerName'] = null;
    }
    if (this.composerNames != null) {
      json[r'composerNames'] = this.composerNames;
    } else {
      json[r'composerNames'] = null;
    }
      json[r'languages'] = this.languages;
      json[r'isPrabhujiOriginal'] = this.isPrabhujiOriginal;
    if (this.audioStreamUrl != null) {
      json[r'audioStreamUrl'] = this.audioStreamUrl;
    } else {
      json[r'audioStreamUrl'] = null;
    }
      json[r'likeCount'] = this.likeCount;
      json[r'shareCount'] = this.shareCount;
      json[r'likedByMe'] = this.likedByMe;
    return json;
  }

  /// Returns a new [AartiAudioListItemInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiAudioListItemInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "AartiAudioListItemInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "AartiAudioListItemInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "AartiAudioListItemInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "AartiAudioListItemInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "AartiAudioListItemInput[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "AartiAudioListItemInput[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'singerName'), 'Required key "AartiAudioListItemInput[singerName]" is missing from JSON.');
        assert(json.containsKey(r'composerNames'), 'Required key "AartiAudioListItemInput[composerNames]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "AartiAudioListItemInput[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "AartiAudioListItemInput[languages]" has a null value in JSON.');
        assert(json.containsKey(r'isPrabhujiOriginal'), 'Required key "AartiAudioListItemInput[isPrabhujiOriginal]" is missing from JSON.');
        assert(json[r'isPrabhujiOriginal'] != null, 'Required key "AartiAudioListItemInput[isPrabhujiOriginal]" has a null value in JSON.');
        assert(json.containsKey(r'audioStreamUrl'), 'Required key "AartiAudioListItemInput[audioStreamUrl]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "AartiAudioListItemInput[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "AartiAudioListItemInput[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "AartiAudioListItemInput[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "AartiAudioListItemInput[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "AartiAudioListItemInput[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "AartiAudioListItemInput[likedByMe]" has a null value in JSON.');
        return true;
      }());

      return AartiAudioListItemInput(
        id: mapValueOfType<String>(json, r'id')!,
        title: mapValueOfType<String>(json, r'title')!,
        coverImageUrl: mapValueOfType<String>(json, r'coverImageUrl')!,
        singerName: mapValueOfType<String>(json, r'singerName'),
        composerNames: mapValueOfType<String>(json, r'composerNames'),
        languages: json[r'languages'] is Iterable
            ? (json[r'languages'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        isPrabhujiOriginal: mapValueOfType<bool>(json, r'isPrabhujiOriginal')!,
        audioStreamUrl: mapValueOfType<String>(json, r'audioStreamUrl'),
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
        shareCount: mapValueOfType<int>(json, r'shareCount')!,
        likedByMe: mapValueOfType<bool>(json, r'likedByMe')!,
      );
    }
    return null;
  }

  static List<AartiAudioListItemInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiAudioListItemInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiAudioListItemInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiAudioListItemInput> mapFromJson(dynamic json) {
    final map = <String, AartiAudioListItemInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiAudioListItemInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiAudioListItemInput-objects as value to a dart map
  static Map<String, List<AartiAudioListItemInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiAudioListItemInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiAudioListItemInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'title',
    'coverImageUrl',
    'singerName',
    'composerNames',
    'languages',
    'isPrabhujiOriginal',
    'audioStreamUrl',
    'likeCount',
    'shareCount',
    'likedByMe',
  };
}

