//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class WallpaperDetailInput {
  /// Returns a new [WallpaperDetailInput] instance.
  WallpaperDetailInput({
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

  WallpaperDetailInputMediaTypeEnum mediaType;

  String thumbnailUrl;

  String previewImageUrl;

  String? previewVideoUrl;

  String? liveWallpaperAssetUrl;

  String? liveWallpaperPackage;

  String? fallbackStaticThumbnailUrl;

  String? altText;

  String? dominantColor;

  List<String> supportedAndroidVersions;

  WallpaperFocalPointInput? focalPoint;

  WallpaperSafeAreaInput? safeAreaMetadata;

  WallpaperDeityInput? deity;

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
  bool operator ==(Object other) => identical(this, other) || other is WallpaperDetailInput &&
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
  String toString() => 'WallpaperDetailInput[id=$id, title=$title, mediaType=$mediaType, thumbnailUrl=$thumbnailUrl, previewImageUrl=$previewImageUrl, previewVideoUrl=$previewVideoUrl, liveWallpaperAssetUrl=$liveWallpaperAssetUrl, liveWallpaperPackage=$liveWallpaperPackage, fallbackStaticThumbnailUrl=$fallbackStaticThumbnailUrl, altText=$altText, dominantColor=$dominantColor, supportedAndroidVersions=$supportedAndroidVersions, focalPoint=$focalPoint, safeAreaMetadata=$safeAreaMetadata, deity=$deity, languages=$languages, setCount=$setCount, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe, createdAt=$createdAt]';

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

  /// Returns a new [WallpaperDetailInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static WallpaperDetailInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "WallpaperDetailInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "WallpaperDetailInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "WallpaperDetailInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "WallpaperDetailInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'mediaType'), 'Required key "WallpaperDetailInput[mediaType]" is missing from JSON.');
        assert(json[r'mediaType'] != null, 'Required key "WallpaperDetailInput[mediaType]" has a null value in JSON.');
        assert(json.containsKey(r'thumbnailUrl'), 'Required key "WallpaperDetailInput[thumbnailUrl]" is missing from JSON.');
        assert(json[r'thumbnailUrl'] != null, 'Required key "WallpaperDetailInput[thumbnailUrl]" has a null value in JSON.');
        assert(json.containsKey(r'previewImageUrl'), 'Required key "WallpaperDetailInput[previewImageUrl]" is missing from JSON.');
        assert(json[r'previewImageUrl'] != null, 'Required key "WallpaperDetailInput[previewImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'previewVideoUrl'), 'Required key "WallpaperDetailInput[previewVideoUrl]" is missing from JSON.');
        assert(json.containsKey(r'liveWallpaperAssetUrl'), 'Required key "WallpaperDetailInput[liveWallpaperAssetUrl]" is missing from JSON.');
        assert(json.containsKey(r'liveWallpaperPackage'), 'Required key "WallpaperDetailInput[liveWallpaperPackage]" is missing from JSON.');
        assert(json.containsKey(r'fallbackStaticThumbnailUrl'), 'Required key "WallpaperDetailInput[fallbackStaticThumbnailUrl]" is missing from JSON.');
        assert(json.containsKey(r'altText'), 'Required key "WallpaperDetailInput[altText]" is missing from JSON.');
        assert(json.containsKey(r'dominantColor'), 'Required key "WallpaperDetailInput[dominantColor]" is missing from JSON.');
        assert(json.containsKey(r'supportedAndroidVersions'), 'Required key "WallpaperDetailInput[supportedAndroidVersions]" is missing from JSON.');
        assert(json[r'supportedAndroidVersions'] != null, 'Required key "WallpaperDetailInput[supportedAndroidVersions]" has a null value in JSON.');
        assert(json.containsKey(r'focalPoint'), 'Required key "WallpaperDetailInput[focalPoint]" is missing from JSON.');
        assert(json.containsKey(r'safeAreaMetadata'), 'Required key "WallpaperDetailInput[safeAreaMetadata]" is missing from JSON.');
        assert(json.containsKey(r'deity'), 'Required key "WallpaperDetailInput[deity]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "WallpaperDetailInput[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "WallpaperDetailInput[languages]" has a null value in JSON.');
        assert(json.containsKey(r'setCount'), 'Required key "WallpaperDetailInput[setCount]" is missing from JSON.');
        assert(json[r'setCount'] != null, 'Required key "WallpaperDetailInput[setCount]" has a null value in JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "WallpaperDetailInput[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "WallpaperDetailInput[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "WallpaperDetailInput[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "WallpaperDetailInput[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "WallpaperDetailInput[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "WallpaperDetailInput[likedByMe]" has a null value in JSON.');
        assert(json.containsKey(r'createdAt'), 'Required key "WallpaperDetailInput[createdAt]" is missing from JSON.');
        assert(json[r'createdAt'] != null, 'Required key "WallpaperDetailInput[createdAt]" has a null value in JSON.');
        return true;
      }());

      return WallpaperDetailInput(
        id: mapValueOfType<String>(json, r'id')!,
        title: mapValueOfType<String>(json, r'title')!,
        mediaType: WallpaperDetailInputMediaTypeEnum.fromJson(json[r'mediaType'])!,
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
        focalPoint: WallpaperFocalPointInput.fromJson(json[r'focalPoint']),
        safeAreaMetadata: WallpaperSafeAreaInput.fromJson(json[r'safeAreaMetadata']),
        deity: WallpaperDeityInput.fromJson(json[r'deity']),
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

  static List<WallpaperDetailInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperDetailInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperDetailInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, WallpaperDetailInput> mapFromJson(dynamic json) {
    final map = <String, WallpaperDetailInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = WallpaperDetailInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of WallpaperDetailInput-objects as value to a dart map
  static Map<String, List<WallpaperDetailInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<WallpaperDetailInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = WallpaperDetailInput.listFromJson(entry.value, growable: growable,);
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


class WallpaperDetailInputMediaTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const WallpaperDetailInputMediaTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const static_ = WallpaperDetailInputMediaTypeEnum._(r'static');
  static const live = WallpaperDetailInputMediaTypeEnum._(r'live');

  /// List of all possible values in this [enum][WallpaperDetailInputMediaTypeEnum].
  static const values = <WallpaperDetailInputMediaTypeEnum>[
    static_,
    live,
  ];

  static WallpaperDetailInputMediaTypeEnum? fromJson(dynamic value) => WallpaperDetailInputMediaTypeEnumTypeTransformer().decode(value);

  static List<WallpaperDetailInputMediaTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperDetailInputMediaTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperDetailInputMediaTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [WallpaperDetailInputMediaTypeEnum] to String,
/// and [decode] dynamic data back to [WallpaperDetailInputMediaTypeEnum].
class WallpaperDetailInputMediaTypeEnumTypeTransformer {
  factory WallpaperDetailInputMediaTypeEnumTypeTransformer() => _instance ??= const WallpaperDetailInputMediaTypeEnumTypeTransformer._();

  const WallpaperDetailInputMediaTypeEnumTypeTransformer._();

  String encode(WallpaperDetailInputMediaTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a WallpaperDetailInputMediaTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  WallpaperDetailInputMediaTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'static': return WallpaperDetailInputMediaTypeEnum.static_;
        case r'live': return WallpaperDetailInputMediaTypeEnum.live;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [WallpaperDetailInputMediaTypeEnumTypeTransformer] instance.
  static WallpaperDetailInputMediaTypeEnumTypeTransformer? _instance;
}


