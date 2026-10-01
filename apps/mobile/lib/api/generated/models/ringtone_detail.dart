//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RingtoneDetail {
  /// Returns a new [RingtoneDetail] instance.
  RingtoneDetail({
    required this.id,
    required this.title,
    required this.thumbnailImageUrl,
    required this.audioUrl,
    required this.playCount,
    required this.setCount,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
    required this.deityId,
    required this.deityName,
    this.languages = const [],
  });

  String id;

  String title;

  String thumbnailImageUrl;

  String? audioUrl;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int playCount;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int setCount;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int likeCount;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int shareCount;

  bool likedByMe;

  String deityId;

  String deityName;

  List<String> languages;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RingtoneDetail &&
    other.id == id &&
    other.title == title &&
    other.thumbnailImageUrl == thumbnailImageUrl &&
    other.audioUrl == audioUrl &&
    other.playCount == playCount &&
    other.setCount == setCount &&
    other.likeCount == likeCount &&
    other.shareCount == shareCount &&
    other.likedByMe == likedByMe &&
    other.deityId == deityId &&
    other.deityName == deityName &&
    _deepEquality.equals(other.languages, languages);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (title.hashCode) +
    (thumbnailImageUrl.hashCode) +
    (audioUrl == null ? 0 : audioUrl!.hashCode) +
    (playCount.hashCode) +
    (setCount.hashCode) +
    (likeCount.hashCode) +
    (shareCount.hashCode) +
    (likedByMe.hashCode) +
    (deityId.hashCode) +
    (deityName.hashCode) +
    (languages.hashCode);

  @override
  String toString() => 'RingtoneDetail[id=$id, title=$title, thumbnailImageUrl=$thumbnailImageUrl, audioUrl=$audioUrl, playCount=$playCount, setCount=$setCount, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe, deityId=$deityId, deityName=$deityName, languages=$languages]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'title'] = this.title;
      json[r'thumbnailImageUrl'] = this.thumbnailImageUrl;
    if (this.audioUrl != null) {
      json[r'audioUrl'] = this.audioUrl;
    } else {
      json[r'audioUrl'] = null;
    }
      json[r'playCount'] = this.playCount;
      json[r'setCount'] = this.setCount;
      json[r'likeCount'] = this.likeCount;
      json[r'shareCount'] = this.shareCount;
      json[r'likedByMe'] = this.likedByMe;
      json[r'deityId'] = this.deityId;
      json[r'deityName'] = this.deityName;
      json[r'languages'] = this.languages;
    return json;
  }

  /// Returns a new [RingtoneDetail] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RingtoneDetail? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "RingtoneDetail[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "RingtoneDetail[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "RingtoneDetail[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "RingtoneDetail[title]" has a null value in JSON.');
        assert(json.containsKey(r'thumbnailImageUrl'), 'Required key "RingtoneDetail[thumbnailImageUrl]" is missing from JSON.');
        assert(json[r'thumbnailImageUrl'] != null, 'Required key "RingtoneDetail[thumbnailImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'audioUrl'), 'Required key "RingtoneDetail[audioUrl]" is missing from JSON.');
        assert(json.containsKey(r'playCount'), 'Required key "RingtoneDetail[playCount]" is missing from JSON.');
        assert(json[r'playCount'] != null, 'Required key "RingtoneDetail[playCount]" has a null value in JSON.');
        assert(json.containsKey(r'setCount'), 'Required key "RingtoneDetail[setCount]" is missing from JSON.');
        assert(json[r'setCount'] != null, 'Required key "RingtoneDetail[setCount]" has a null value in JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "RingtoneDetail[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "RingtoneDetail[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "RingtoneDetail[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "RingtoneDetail[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "RingtoneDetail[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "RingtoneDetail[likedByMe]" has a null value in JSON.');
        assert(json.containsKey(r'deityId'), 'Required key "RingtoneDetail[deityId]" is missing from JSON.');
        assert(json[r'deityId'] != null, 'Required key "RingtoneDetail[deityId]" has a null value in JSON.');
        assert(json.containsKey(r'deityName'), 'Required key "RingtoneDetail[deityName]" is missing from JSON.');
        assert(json[r'deityName'] != null, 'Required key "RingtoneDetail[deityName]" has a null value in JSON.');
        assert(json.containsKey(r'languages'), 'Required key "RingtoneDetail[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "RingtoneDetail[languages]" has a null value in JSON.');
        return true;
      }());

      return RingtoneDetail(
        id: mapValueOfType<String>(json, r'id')!,
        title: mapValueOfType<String>(json, r'title')!,
        thumbnailImageUrl: mapValueOfType<String>(json, r'thumbnailImageUrl')!,
        audioUrl: mapValueOfType<String>(json, r'audioUrl'),
        playCount: mapValueOfType<int>(json, r'playCount')!,
        setCount: mapValueOfType<int>(json, r'setCount')!,
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
        shareCount: mapValueOfType<int>(json, r'shareCount')!,
        likedByMe: mapValueOfType<bool>(json, r'likedByMe')!,
        deityId: mapValueOfType<String>(json, r'deityId')!,
        deityName: mapValueOfType<String>(json, r'deityName')!,
        languages: json[r'languages'] is Iterable
            ? (json[r'languages'] as Iterable).cast<String>().toList(growable: false)
            : const [],
      );
    }
    return null;
  }

  static List<RingtoneDetail> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RingtoneDetail>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RingtoneDetail.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RingtoneDetail> mapFromJson(dynamic json) {
    final map = <String, RingtoneDetail>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RingtoneDetail.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RingtoneDetail-objects as value to a dart map
  static Map<String, List<RingtoneDetail>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RingtoneDetail>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RingtoneDetail.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'title',
    'thumbnailImageUrl',
    'audioUrl',
    'playCount',
    'setCount',
    'likeCount',
    'shareCount',
    'likedByMe',
    'deityId',
    'deityName',
    'languages',
  };
}

