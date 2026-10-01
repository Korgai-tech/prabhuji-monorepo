//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StatusCard {
  /// Returns a new [StatusCard] instance.
  StatusCard({
    required this.id,
    required this.slug,
    required this.title,
    required this.mediaType,
    required this.imageUrl,
    required this.videoUrl,
    required this.thumbnailUrl,
    required this.overlaySafeArea,
    required this.deitySlug,
    required this.deityName,
    this.languages = const [],
    required this.shareCaption,
    required this.creator,
    required this.likeCount,
    required this.viewCount,
    required this.likedByMe,
  });

  String id;

  String slug;

  String title;

  StatusCardMediaTypeEnum mediaType;

  String? imageUrl;

  String? videoUrl;

  String thumbnailUrl;

  StatusOverlaySafeArea overlaySafeArea;

  String? deitySlug;

  String? deityName;

  List<String> languages;

  String? shareCaption;

  StatusCreator creator;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int likeCount;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int viewCount;

  bool likedByMe;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StatusCard &&
    other.id == id &&
    other.slug == slug &&
    other.title == title &&
    other.mediaType == mediaType &&
    other.imageUrl == imageUrl &&
    other.videoUrl == videoUrl &&
    other.thumbnailUrl == thumbnailUrl &&
    other.overlaySafeArea == overlaySafeArea &&
    other.deitySlug == deitySlug &&
    other.deityName == deityName &&
    _deepEquality.equals(other.languages, languages) &&
    other.shareCaption == shareCaption &&
    other.creator == creator &&
    other.likeCount == likeCount &&
    other.viewCount == viewCount &&
    other.likedByMe == likedByMe;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (slug.hashCode) +
    (title.hashCode) +
    (mediaType.hashCode) +
    (imageUrl == null ? 0 : imageUrl!.hashCode) +
    (videoUrl == null ? 0 : videoUrl!.hashCode) +
    (thumbnailUrl.hashCode) +
    (overlaySafeArea.hashCode) +
    (deitySlug == null ? 0 : deitySlug!.hashCode) +
    (deityName == null ? 0 : deityName!.hashCode) +
    (languages.hashCode) +
    (shareCaption == null ? 0 : shareCaption!.hashCode) +
    (creator.hashCode) +
    (likeCount.hashCode) +
    (viewCount.hashCode) +
    (likedByMe.hashCode);

  @override
  String toString() => 'StatusCard[id=$id, slug=$slug, title=$title, mediaType=$mediaType, imageUrl=$imageUrl, videoUrl=$videoUrl, thumbnailUrl=$thumbnailUrl, overlaySafeArea=$overlaySafeArea, deitySlug=$deitySlug, deityName=$deityName, languages=$languages, shareCaption=$shareCaption, creator=$creator, likeCount=$likeCount, viewCount=$viewCount, likedByMe=$likedByMe]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'slug'] = this.slug;
      json[r'title'] = this.title;
      json[r'mediaType'] = this.mediaType;
    if (this.imageUrl != null) {
      json[r'imageUrl'] = this.imageUrl;
    } else {
      json[r'imageUrl'] = null;
    }
    if (this.videoUrl != null) {
      json[r'videoUrl'] = this.videoUrl;
    } else {
      json[r'videoUrl'] = null;
    }
      json[r'thumbnailUrl'] = this.thumbnailUrl;
      json[r'overlaySafeArea'] = this.overlaySafeArea;
    if (this.deitySlug != null) {
      json[r'deitySlug'] = this.deitySlug;
    } else {
      json[r'deitySlug'] = null;
    }
    if (this.deityName != null) {
      json[r'deityName'] = this.deityName;
    } else {
      json[r'deityName'] = null;
    }
      json[r'languages'] = this.languages;
    if (this.shareCaption != null) {
      json[r'shareCaption'] = this.shareCaption;
    } else {
      json[r'shareCaption'] = null;
    }
      json[r'creator'] = this.creator;
      json[r'likeCount'] = this.likeCount;
      json[r'viewCount'] = this.viewCount;
      json[r'likedByMe'] = this.likedByMe;
    return json;
  }

  /// Returns a new [StatusCard] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StatusCard? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "StatusCard[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "StatusCard[id]" has a null value in JSON.');
        assert(json.containsKey(r'slug'), 'Required key "StatusCard[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "StatusCard[slug]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "StatusCard[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "StatusCard[title]" has a null value in JSON.');
        assert(json.containsKey(r'mediaType'), 'Required key "StatusCard[mediaType]" is missing from JSON.');
        assert(json[r'mediaType'] != null, 'Required key "StatusCard[mediaType]" has a null value in JSON.');
        assert(json.containsKey(r'imageUrl'), 'Required key "StatusCard[imageUrl]" is missing from JSON.');
        assert(json.containsKey(r'videoUrl'), 'Required key "StatusCard[videoUrl]" is missing from JSON.');
        assert(json.containsKey(r'thumbnailUrl'), 'Required key "StatusCard[thumbnailUrl]" is missing from JSON.');
        assert(json[r'thumbnailUrl'] != null, 'Required key "StatusCard[thumbnailUrl]" has a null value in JSON.');
        assert(json.containsKey(r'overlaySafeArea'), 'Required key "StatusCard[overlaySafeArea]" is missing from JSON.');
        assert(json[r'overlaySafeArea'] != null, 'Required key "StatusCard[overlaySafeArea]" has a null value in JSON.');
        assert(json.containsKey(r'deitySlug'), 'Required key "StatusCard[deitySlug]" is missing from JSON.');
        assert(json.containsKey(r'deityName'), 'Required key "StatusCard[deityName]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "StatusCard[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "StatusCard[languages]" has a null value in JSON.');
        assert(json.containsKey(r'shareCaption'), 'Required key "StatusCard[shareCaption]" is missing from JSON.');
        assert(json.containsKey(r'creator'), 'Required key "StatusCard[creator]" is missing from JSON.');
        assert(json[r'creator'] != null, 'Required key "StatusCard[creator]" has a null value in JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "StatusCard[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "StatusCard[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'viewCount'), 'Required key "StatusCard[viewCount]" is missing from JSON.');
        assert(json[r'viewCount'] != null, 'Required key "StatusCard[viewCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "StatusCard[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "StatusCard[likedByMe]" has a null value in JSON.');
        return true;
      }());

      return StatusCard(
        id: mapValueOfType<String>(json, r'id')!,
        slug: mapValueOfType<String>(json, r'slug')!,
        title: mapValueOfType<String>(json, r'title')!,
        mediaType: StatusCardMediaTypeEnum.fromJson(json[r'mediaType'])!,
        imageUrl: mapValueOfType<String>(json, r'imageUrl'),
        videoUrl: mapValueOfType<String>(json, r'videoUrl'),
        thumbnailUrl: mapValueOfType<String>(json, r'thumbnailUrl')!,
        overlaySafeArea: StatusOverlaySafeArea.fromJson(json[r'overlaySafeArea'])!,
        deitySlug: mapValueOfType<String>(json, r'deitySlug'),
        deityName: mapValueOfType<String>(json, r'deityName'),
        languages: json[r'languages'] is Iterable
            ? (json[r'languages'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        shareCaption: mapValueOfType<String>(json, r'shareCaption'),
        creator: StatusCreator.fromJson(json[r'creator'])!,
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
        viewCount: mapValueOfType<int>(json, r'viewCount')!,
        likedByMe: mapValueOfType<bool>(json, r'likedByMe')!,
      );
    }
    return null;
  }

  static List<StatusCard> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusCard>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusCard.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StatusCard> mapFromJson(dynamic json) {
    final map = <String, StatusCard>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StatusCard.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StatusCard-objects as value to a dart map
  static Map<String, List<StatusCard>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StatusCard>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StatusCard.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'slug',
    'title',
    'mediaType',
    'imageUrl',
    'videoUrl',
    'thumbnailUrl',
    'overlaySafeArea',
    'deitySlug',
    'deityName',
    'languages',
    'shareCaption',
    'creator',
    'likeCount',
    'viewCount',
    'likedByMe',
  };
}


class StatusCardMediaTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const StatusCardMediaTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const image = StatusCardMediaTypeEnum._(r'image');
  static const video = StatusCardMediaTypeEnum._(r'video');

  /// List of all possible values in this [enum][StatusCardMediaTypeEnum].
  static const values = <StatusCardMediaTypeEnum>[
    image,
    video,
  ];

  static StatusCardMediaTypeEnum? fromJson(dynamic value) => StatusCardMediaTypeEnumTypeTransformer().decode(value);

  static List<StatusCardMediaTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusCardMediaTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusCardMediaTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [StatusCardMediaTypeEnum] to String,
/// and [decode] dynamic data back to [StatusCardMediaTypeEnum].
class StatusCardMediaTypeEnumTypeTransformer {
  factory StatusCardMediaTypeEnumTypeTransformer() => _instance ??= const StatusCardMediaTypeEnumTypeTransformer._();

  const StatusCardMediaTypeEnumTypeTransformer._();

  String encode(StatusCardMediaTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a StatusCardMediaTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  StatusCardMediaTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'image': return StatusCardMediaTypeEnum.image;
        case r'video': return StatusCardMediaTypeEnum.video;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [StatusCardMediaTypeEnumTypeTransformer] instance.
  static StatusCardMediaTypeEnumTypeTransformer? _instance;
}


