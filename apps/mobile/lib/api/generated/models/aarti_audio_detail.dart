//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiAudioDetail {
  /// Returns a new [AartiAudioDetail] instance.
  AartiAudioDetail({
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
    required this.deity,
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

  AartiDeityCard? deity;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiAudioDetail &&
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
    other.likedByMe == likedByMe &&
    other.deity == deity;

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
    (likedByMe.hashCode) +
    (deity == null ? 0 : deity!.hashCode);

  @override
  String toString() => 'AartiAudioDetail[id=$id, title=$title, coverImageUrl=$coverImageUrl, singerName=$singerName, composerNames=$composerNames, languages=$languages, isPrabhujiOriginal=$isPrabhujiOriginal, audioStreamUrl=$audioStreamUrl, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe, deity=$deity]';

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
    if (this.deity != null) {
      json[r'deity'] = this.deity;
    } else {
      json[r'deity'] = null;
    }
    return json;
  }

  /// Returns a new [AartiAudioDetail] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiAudioDetail? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "AartiAudioDetail[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "AartiAudioDetail[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "AartiAudioDetail[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "AartiAudioDetail[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "AartiAudioDetail[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "AartiAudioDetail[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'singerName'), 'Required key "AartiAudioDetail[singerName]" is missing from JSON.');
        assert(json.containsKey(r'composerNames'), 'Required key "AartiAudioDetail[composerNames]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "AartiAudioDetail[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "AartiAudioDetail[languages]" has a null value in JSON.');
        assert(json.containsKey(r'isPrabhujiOriginal'), 'Required key "AartiAudioDetail[isPrabhujiOriginal]" is missing from JSON.');
        assert(json[r'isPrabhujiOriginal'] != null, 'Required key "AartiAudioDetail[isPrabhujiOriginal]" has a null value in JSON.');
        assert(json.containsKey(r'audioStreamUrl'), 'Required key "AartiAudioDetail[audioStreamUrl]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "AartiAudioDetail[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "AartiAudioDetail[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "AartiAudioDetail[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "AartiAudioDetail[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "AartiAudioDetail[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "AartiAudioDetail[likedByMe]" has a null value in JSON.');
        assert(json.containsKey(r'deity'), 'Required key "AartiAudioDetail[deity]" is missing from JSON.');
        return true;
      }());

      return AartiAudioDetail(
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
        deity: AartiDeityCard.fromJson(json[r'deity']),
      );
    }
    return null;
  }

  static List<AartiAudioDetail> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiAudioDetail>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiAudioDetail.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiAudioDetail> mapFromJson(dynamic json) {
    final map = <String, AartiAudioDetail>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiAudioDetail.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiAudioDetail-objects as value to a dart map
  static Map<String, List<AartiAudioDetail>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiAudioDetail>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiAudioDetail.listFromJson(entry.value, growable: growable,);
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
    'deity',
  };
}

