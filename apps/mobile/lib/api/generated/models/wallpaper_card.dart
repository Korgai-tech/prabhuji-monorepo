//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class WallpaperCard {
  /// Returns a new [WallpaperCard] instance.
  WallpaperCard({
    required this.id,
    required this.title,
    required this.mediaType,
    required this.thumbnailUrl,
    required this.previewImageUrl,
    required this.deitySlug,
    required this.setCount,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
  });

  String id;

  String title;

  WallpaperCardMediaTypeEnum mediaType;

  String thumbnailUrl;

  String previewImageUrl;

  String? deitySlug;

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

  @override
  bool operator ==(Object other) => identical(this, other) || other is WallpaperCard &&
    other.id == id &&
    other.title == title &&
    other.mediaType == mediaType &&
    other.thumbnailUrl == thumbnailUrl &&
    other.previewImageUrl == previewImageUrl &&
    other.deitySlug == deitySlug &&
    other.setCount == setCount &&
    other.likeCount == likeCount &&
    other.shareCount == shareCount &&
    other.likedByMe == likedByMe;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (title.hashCode) +
    (mediaType.hashCode) +
    (thumbnailUrl.hashCode) +
    (previewImageUrl.hashCode) +
    (deitySlug == null ? 0 : deitySlug!.hashCode) +
    (setCount.hashCode) +
    (likeCount.hashCode) +
    (shareCount.hashCode) +
    (likedByMe.hashCode);

  @override
  String toString() => 'WallpaperCard[id=$id, title=$title, mediaType=$mediaType, thumbnailUrl=$thumbnailUrl, previewImageUrl=$previewImageUrl, deitySlug=$deitySlug, setCount=$setCount, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'title'] = this.title;
      json[r'mediaType'] = this.mediaType;
      json[r'thumbnailUrl'] = this.thumbnailUrl;
      json[r'previewImageUrl'] = this.previewImageUrl;
    if (this.deitySlug != null) {
      json[r'deitySlug'] = this.deitySlug;
    } else {
      json[r'deitySlug'] = null;
    }
      json[r'setCount'] = this.setCount;
      json[r'likeCount'] = this.likeCount;
      json[r'shareCount'] = this.shareCount;
      json[r'likedByMe'] = this.likedByMe;
    return json;
  }

  /// Returns a new [WallpaperCard] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static WallpaperCard? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "WallpaperCard[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "WallpaperCard[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "WallpaperCard[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "WallpaperCard[title]" has a null value in JSON.');
        assert(json.containsKey(r'mediaType'), 'Required key "WallpaperCard[mediaType]" is missing from JSON.');
        assert(json[r'mediaType'] != null, 'Required key "WallpaperCard[mediaType]" has a null value in JSON.');
        assert(json.containsKey(r'thumbnailUrl'), 'Required key "WallpaperCard[thumbnailUrl]" is missing from JSON.');
        assert(json[r'thumbnailUrl'] != null, 'Required key "WallpaperCard[thumbnailUrl]" has a null value in JSON.');
        assert(json.containsKey(r'previewImageUrl'), 'Required key "WallpaperCard[previewImageUrl]" is missing from JSON.');
        assert(json[r'previewImageUrl'] != null, 'Required key "WallpaperCard[previewImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'deitySlug'), 'Required key "WallpaperCard[deitySlug]" is missing from JSON.');
        assert(json.containsKey(r'setCount'), 'Required key "WallpaperCard[setCount]" is missing from JSON.');
        assert(json[r'setCount'] != null, 'Required key "WallpaperCard[setCount]" has a null value in JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "WallpaperCard[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "WallpaperCard[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "WallpaperCard[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "WallpaperCard[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "WallpaperCard[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "WallpaperCard[likedByMe]" has a null value in JSON.');
        return true;
      }());

      return WallpaperCard(
        id: mapValueOfType<String>(json, r'id')!,
        title: mapValueOfType<String>(json, r'title')!,
        mediaType: WallpaperCardMediaTypeEnum.fromJson(json[r'mediaType'])!,
        thumbnailUrl: mapValueOfType<String>(json, r'thumbnailUrl')!,
        previewImageUrl: mapValueOfType<String>(json, r'previewImageUrl')!,
        deitySlug: mapValueOfType<String>(json, r'deitySlug'),
        setCount: mapValueOfType<int>(json, r'setCount')!,
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
        shareCount: mapValueOfType<int>(json, r'shareCount')!,
        likedByMe: mapValueOfType<bool>(json, r'likedByMe')!,
      );
    }
    return null;
  }

  static List<WallpaperCard> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperCard>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperCard.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, WallpaperCard> mapFromJson(dynamic json) {
    final map = <String, WallpaperCard>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = WallpaperCard.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of WallpaperCard-objects as value to a dart map
  static Map<String, List<WallpaperCard>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<WallpaperCard>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = WallpaperCard.listFromJson(entry.value, growable: growable,);
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
    'deitySlug',
    'setCount',
    'likeCount',
    'shareCount',
    'likedByMe',
  };
}


class WallpaperCardMediaTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const WallpaperCardMediaTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const static_ = WallpaperCardMediaTypeEnum._(r'static');
  static const live = WallpaperCardMediaTypeEnum._(r'live');

  /// List of all possible values in this [enum][WallpaperCardMediaTypeEnum].
  static const values = <WallpaperCardMediaTypeEnum>[
    static_,
    live,
  ];

  static WallpaperCardMediaTypeEnum? fromJson(dynamic value) => WallpaperCardMediaTypeEnumTypeTransformer().decode(value);

  static List<WallpaperCardMediaTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperCardMediaTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperCardMediaTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [WallpaperCardMediaTypeEnum] to String,
/// and [decode] dynamic data back to [WallpaperCardMediaTypeEnum].
class WallpaperCardMediaTypeEnumTypeTransformer {
  factory WallpaperCardMediaTypeEnumTypeTransformer() => _instance ??= const WallpaperCardMediaTypeEnumTypeTransformer._();

  const WallpaperCardMediaTypeEnumTypeTransformer._();

  String encode(WallpaperCardMediaTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a WallpaperCardMediaTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  WallpaperCardMediaTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'static': return WallpaperCardMediaTypeEnum.static_;
        case r'live': return WallpaperCardMediaTypeEnum.live;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [WallpaperCardMediaTypeEnumTypeTransformer] instance.
  static WallpaperCardMediaTypeEnumTypeTransformer? _instance;
}


