//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class WallpaperDetail {
  /// Returns a new [WallpaperDetail] instance.
  WallpaperDetail({
    required this.id,
    required this.title,
    required this.mediaType,
    required this.thumbnailUrl,
    required this.previewImageUrl,
    required this.previewVideoUrl,
    required this.liveWallpaperAssetUrl,
    required this.liveWallpaperPackage,
    required this.fallbackStaticThumbnailUrl,
    required this.altText,
    required this.dominantColor,
    this.supportedAndroidVersions = const [],
    required this.focalPoint,
    required this.safeAreaMetadata,
    required this.deity,
    this.languages = const [],
    required this.setCount,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
    required this.createdAt,
  });

  String id;

  String title;

  WallpaperDetailMediaTypeEnum mediaType;

  String thumbnailUrl;

  String previewImageUrl;

  String? previewVideoUrl;

  String? liveWallpaperAssetUrl;

  String? liveWallpaperPackage;

  String? fallbackStaticThumbnailUrl;

  String? altText;

  String? dominantColor;

  List<String> supportedAndroidVersions;

  WallpaperFocalPoint? focalPoint;

  WallpaperSafeArea? safeAreaMetadata;

  WallpaperDeity? deity;

  List<String> languages;

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

  String createdAt;

  @override
  bool operator ==(Object other) => identical(this, other) || other is WallpaperDetail &&
    other.id == id &&
    other.title == title &&
    other.mediaType == mediaType &&
    other.thumbnailUrl == thumbnailUrl &&
    other.previewImageUrl == previewImageUrl &&
    other.previewVideoUrl == previewVideoUrl &&
    other.liveWallpaperAssetUrl == liveWallpaperAssetUrl &&
    other.liveWallpaperPackage == liveWallpaperPackage &&
    other.fallbackStaticThumbnailUrl == fallbackStaticThumbnailUrl &&
    other.altText == altText &&
    other.dominantColor == dominantColor &&
    _deepEquality.equals(other.supportedAndroidVersions, supportedAndroidVersions) &&
    other.focalPoint == focalPoint &&
    other.safeAreaMetadata == safeAreaMetadata &&
    other.deity == deity &&
    _deepEquality.equals(other.languages, languages) &&
    other.setCount == setCount &&
    other.likeCount == likeCount &&
    other.shareCount == shareCount &&
    other.likedByMe == likedByMe &&
    other.createdAt == createdAt;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (title.hashCode) +
    (mediaType.hashCode) +
    (thumbnailUrl.hashCode) +
    (previewImageUrl.hashCode) +
    (previewVideoUrl == null ? 0 : previewVideoUrl!.hashCode) +
    (liveWallpaperAssetUrl == null ? 0 : liveWallpaperAssetUrl!.hashCode) +
    (liveWallpaperPackage == null ? 0 : liveWallpaperPackage!.hashCode) +
    (fallbackStaticThumbnailUrl == null ? 0 : fallbackStaticThumbnailUrl!.hashCode) +
    (altText == null ? 0 : altText!.hashCode) +
    (dominantColor == null ? 0 : dominantColor!.hashCode) +
    (supportedAndroidVersions.hashCode) +
    (focalPoint == null ? 0 : focalPoint!.hashCode) +
    (safeAreaMetadata == null ? 0 : safeAreaMetadata!.hashCode) +
    (deity == null ? 0 : deity!.hashCode) +
    (languages.hashCode) +
    (setCount.hashCode) +
    (likeCount.hashCode) +
    (shareCount.hashCode) +
    (likedByMe.hashCode) +
    (createdAt.hashCode);

  @override
  String toString() => 'WallpaperDetail[id=$id, title=$title, mediaType=$mediaType, thumbnailUrl=$thumbnailUrl, previewImageUrl=$previewImageUrl, previewVideoUrl=$previewVideoUrl, liveWallpaperAssetUrl=$liveWallpaperAssetUrl, liveWallpaperPackage=$liveWallpaperPackage, fallbackStaticThumbnailUrl=$fallbackStaticThumbnailUrl, altText=$altText, dominantColor=$dominantColor, supportedAndroidVersions=$supportedAndroidVersions, focalPoint=$focalPoint, safeAreaMetadata=$safeAreaMetadata, deity=$deity, languages=$languages, setCount=$setCount, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe, createdAt=$createdAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'title'] = this.title;
      json[r'mediaType'] = this.mediaType;
      json[r'thumbnailUrl'] = this.thumbnailUrl;
      json[r'previewImageUrl'] = this.previewImageUrl;
    if (this.previewVideoUrl != null) {
      json[r'previewVideoUrl'] = this.previewVideoUrl;
    } else {
      json[r'previewVideoUrl'] = null;
    }
    if (this.liveWallpaperAssetUrl != null) {
      json[r'liveWallpaperAssetUrl'] = this.liveWallpaperAssetUrl;
    } else {
      json[r'liveWallpaperAssetUrl'] = null;
    }
    if (this.liveWallpaperPackage != null) {
      json[r'liveWallpaperPackage'] = this.liveWallpaperPackage;
    } else {
      json[r'liveWallpaperPackage'] = null;
    }
    if (this.fallbackStaticThumbnailUrl != null) {
      json[r'fallbackStaticThumbnailUrl'] = this.fallbackStaticThumbnailUrl;
    } else {
      json[r'fallbackStaticThumbnailUrl'] = null;
    }
    if (this.altText != null) {
      json[r'altText'] = this.altText;
    } else {
      json[r'altText'] = null;
    }
    if (this.dominantColor != null) {
      json[r'dominantColor'] = this.dominantColor;
    } else {
      json[r'dominantColor'] = null;
    }
      json[r'supportedAndroidVersions'] = this.supportedAndroidVersions;
    if (this.focalPoint != null) {
      json[r'focalPoint'] = this.focalPoint;
    } else {
      json[r'focalPoint'] = null;
    }
    if (this.safeAreaMetadata != null) {
      json[r'safeAreaMetadata'] = this.safeAreaMetadata;
    } else {
      json[r'safeAreaMetadata'] = null;
    }
    if (this.deity != null) {
      json[r'deity'] = this.deity;
    } else {
      json[r'deity'] = null;
    }
      json[r'languages'] = this.languages;
      json[r'setCount'] = this.setCount;
      json[r'likeCount'] = this.likeCount;
      json[r'shareCount'] = this.shareCount;
      json[r'likedByMe'] = this.likedByMe;
      json[r'createdAt'] = this.createdAt;
    return json;
  }

  /// Returns a new [WallpaperDetail] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static WallpaperDetail? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "WallpaperDetail[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "WallpaperDetail[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "WallpaperDetail[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "WallpaperDetail[title]" has a null value in JSON.');
        assert(json.containsKey(r'mediaType'), 'Required key "WallpaperDetail[mediaType]" is missing from JSON.');
        assert(json[r'mediaType'] != null, 'Required key "WallpaperDetail[mediaType]" has a null value in JSON.');
        assert(json.containsKey(r'thumbnailUrl'), 'Required key "WallpaperDetail[thumbnailUrl]" is missing from JSON.');
        assert(json[r'thumbnailUrl'] != null, 'Required key "WallpaperDetail[thumbnailUrl]" has a null value in JSON.');
        assert(json.containsKey(r'previewImageUrl'), 'Required key "WallpaperDetail[previewImageUrl]" is missing from JSON.');
        assert(json[r'previewImageUrl'] != null, 'Required key "WallpaperDetail[previewImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'previewVideoUrl'), 'Required key "WallpaperDetail[previewVideoUrl]" is missing from JSON.');
        assert(json.containsKey(r'liveWallpaperAssetUrl'), 'Required key "WallpaperDetail[liveWallpaperAssetUrl]" is missing from JSON.');
        assert(json.containsKey(r'liveWallpaperPackage'), 'Required key "WallpaperDetail[liveWallpaperPackage]" is missing from JSON.');
        assert(json.containsKey(r'fallbackStaticThumbnailUrl'), 'Required key "WallpaperDetail[fallbackStaticThumbnailUrl]" is missing from JSON.');
        assert(json.containsKey(r'altText'), 'Required key "WallpaperDetail[altText]" is missing from JSON.');
        assert(json.containsKey(r'dominantColor'), 'Required key "WallpaperDetail[dominantColor]" is missing from JSON.');
        assert(json.containsKey(r'supportedAndroidVersions'), 'Required key "WallpaperDetail[supportedAndroidVersions]" is missing from JSON.');
        assert(json[r'supportedAndroidVersions'] != null, 'Required key "WallpaperDetail[supportedAndroidVersions]" has a null value in JSON.');
        assert(json.containsKey(r'focalPoint'), 'Required key "WallpaperDetail[focalPoint]" is missing from JSON.');
        assert(json.containsKey(r'safeAreaMetadata'), 'Required key "WallpaperDetail[safeAreaMetadata]" is missing from JSON.');
        assert(json.containsKey(r'deity'), 'Required key "WallpaperDetail[deity]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "WallpaperDetail[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "WallpaperDetail[languages]" has a null value in JSON.');
        assert(json.containsKey(r'setCount'), 'Required key "WallpaperDetail[setCount]" is missing from JSON.');
        assert(json[r'setCount'] != null, 'Required key "WallpaperDetail[setCount]" has a null value in JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "WallpaperDetail[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "WallpaperDetail[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "WallpaperDetail[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "WallpaperDetail[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "WallpaperDetail[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "WallpaperDetail[likedByMe]" has a null value in JSON.');
        assert(json.containsKey(r'createdAt'), 'Required key "WallpaperDetail[createdAt]" is missing from JSON.');
        assert(json[r'createdAt'] != null, 'Required key "WallpaperDetail[createdAt]" has a null value in JSON.');
        return true;
      }());

      return WallpaperDetail(
        id: mapValueOfType<String>(json, r'id')!,
        title: mapValueOfType<String>(json, r'title')!,
        mediaType: WallpaperDetailMediaTypeEnum.fromJson(json[r'mediaType'])!,
        thumbnailUrl: mapValueOfType<String>(json, r'thumbnailUrl')!,
        previewImageUrl: mapValueOfType<String>(json, r'previewImageUrl')!,
        previewVideoUrl: mapValueOfType<String>(json, r'previewVideoUrl'),
        liveWallpaperAssetUrl: mapValueOfType<String>(json, r'liveWallpaperAssetUrl'),
        liveWallpaperPackage: mapValueOfType<String>(json, r'liveWallpaperPackage'),
        fallbackStaticThumbnailUrl: mapValueOfType<String>(json, r'fallbackStaticThumbnailUrl'),
        altText: mapValueOfType<String>(json, r'altText'),
        dominantColor: mapValueOfType<String>(json, r'dominantColor'),
        supportedAndroidVersions: json[r'supportedAndroidVersions'] is Iterable
            ? (json[r'supportedAndroidVersions'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        focalPoint: WallpaperFocalPoint.fromJson(json[r'focalPoint']),
        safeAreaMetadata: WallpaperSafeArea.fromJson(json[r'safeAreaMetadata']),
        deity: WallpaperDeity.fromJson(json[r'deity']),
        languages: json[r'languages'] is Iterable
            ? (json[r'languages'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        setCount: mapValueOfType<int>(json, r'setCount')!,
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
        shareCount: mapValueOfType<int>(json, r'shareCount')!,
        likedByMe: mapValueOfType<bool>(json, r'likedByMe')!,
        createdAt: mapValueOfType<String>(json, r'createdAt')!,
      );
    }
    return null;
  }

  static List<WallpaperDetail> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperDetail>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperDetail.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, WallpaperDetail> mapFromJson(dynamic json) {
    final map = <String, WallpaperDetail>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = WallpaperDetail.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of WallpaperDetail-objects as value to a dart map
  static Map<String, List<WallpaperDetail>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<WallpaperDetail>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = WallpaperDetail.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'title',
    'mediaType',
    'thumbnailUrl',
    'previewImageUrl',
    'previewVideoUrl',
    'liveWallpaperAssetUrl',
    'liveWallpaperPackage',
    'fallbackStaticThumbnailUrl',
    'altText',
    'dominantColor',
    'supportedAndroidVersions',
    'focalPoint',
    'safeAreaMetadata',
    'deity',
    'languages',
    'setCount',
    'likeCount',
    'shareCount',
    'likedByMe',
    'createdAt',
  };
}


class WallpaperDetailMediaTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const WallpaperDetailMediaTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const static_ = WallpaperDetailMediaTypeEnum._(r'static');
  static const live = WallpaperDetailMediaTypeEnum._(r'live');

  /// List of all possible values in this [enum][WallpaperDetailMediaTypeEnum].
  static const values = <WallpaperDetailMediaTypeEnum>[
    static_,
    live,
  ];

  static WallpaperDetailMediaTypeEnum? fromJson(dynamic value) => WallpaperDetailMediaTypeEnumTypeTransformer().decode(value);

  static List<WallpaperDetailMediaTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperDetailMediaTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperDetailMediaTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [WallpaperDetailMediaTypeEnum] to String,
/// and [decode] dynamic data back to [WallpaperDetailMediaTypeEnum].
class WallpaperDetailMediaTypeEnumTypeTransformer {
  factory WallpaperDetailMediaTypeEnumTypeTransformer() => _instance ??= const WallpaperDetailMediaTypeEnumTypeTransformer._();

  const WallpaperDetailMediaTypeEnumTypeTransformer._();

  String encode(WallpaperDetailMediaTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a WallpaperDetailMediaTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  WallpaperDetailMediaTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'static': return WallpaperDetailMediaTypeEnum.static_;
        case r'live': return WallpaperDetailMediaTypeEnum.live;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [WallpaperDetailMediaTypeEnumTypeTransformer] instance.
  static WallpaperDetailMediaTypeEnumTypeTransformer? _instance;
}


