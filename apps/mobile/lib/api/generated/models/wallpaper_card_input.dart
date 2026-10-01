//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class WallpaperCardInput {
  /// Returns a new [WallpaperCardInput] instance.
  WallpaperCardInput({
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

  WallpaperCardInputMediaTypeEnum mediaType;

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
  bool operator ==(Object other) => identical(this, other) || other is WallpaperCardInput &&
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
  String toString() => 'WallpaperCardInput[id=$id, title=$title, mediaType=$mediaType, thumbnailUrl=$thumbnailUrl, previewImageUrl=$previewImageUrl, deitySlug=$deitySlug, setCount=$setCount, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe]';

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

  /// Returns a new [WallpaperCardInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static WallpaperCardInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "WallpaperCardInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "WallpaperCardInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "WallpaperCardInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "WallpaperCardInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'mediaType'), 'Required key "WallpaperCardInput[mediaType]" is missing from JSON.');
        assert(json[r'mediaType'] != null, 'Required key "WallpaperCardInput[mediaType]" has a null value in JSON.');
        assert(json.containsKey(r'thumbnailUrl'), 'Required key "WallpaperCardInput[thumbnailUrl]" is missing from JSON.');
        assert(json[r'thumbnailUrl'] != null, 'Required key "WallpaperCardInput[thumbnailUrl]" has a null value in JSON.');
        assert(json.containsKey(r'previewImageUrl'), 'Required key "WallpaperCardInput[previewImageUrl]" is missing from JSON.');
        assert(json[r'previewImageUrl'] != null, 'Required key "WallpaperCardInput[previewImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'deitySlug'), 'Required key "WallpaperCardInput[deitySlug]" is missing from JSON.');
        assert(json.containsKey(r'setCount'), 'Required key "WallpaperCardInput[setCount]" is missing from JSON.');
        assert(json[r'setCount'] != null, 'Required key "WallpaperCardInput[setCount]" has a null value in JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "WallpaperCardInput[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "WallpaperCardInput[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "WallpaperCardInput[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "WallpaperCardInput[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "WallpaperCardInput[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "WallpaperCardInput[likedByMe]" has a null value in JSON.');
        return true;
      }());

      return WallpaperCardInput(
        id: mapValueOfType<String>(json, r'id')!,
        title: mapValueOfType<String>(json, r'title')!,
        mediaType: WallpaperCardInputMediaTypeEnum.fromJson(json[r'mediaType'])!,
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

  static List<WallpaperCardInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperCardInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperCardInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, WallpaperCardInput> mapFromJson(dynamic json) {
    final map = <String, WallpaperCardInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = WallpaperCardInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of WallpaperCardInput-objects as value to a dart map
  static Map<String, List<WallpaperCardInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<WallpaperCardInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = WallpaperCardInput.listFromJson(entry.value, growable: growable,);
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


class WallpaperCardInputMediaTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const WallpaperCardInputMediaTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const static_ = WallpaperCardInputMediaTypeEnum._(r'static');
  static const live = WallpaperCardInputMediaTypeEnum._(r'live');

  /// List of all possible values in this [enum][WallpaperCardInputMediaTypeEnum].
  static const values = <WallpaperCardInputMediaTypeEnum>[
    static_,
    live,
  ];

  static WallpaperCardInputMediaTypeEnum? fromJson(dynamic value) => WallpaperCardInputMediaTypeEnumTypeTransformer().decode(value);

  static List<WallpaperCardInputMediaTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperCardInputMediaTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperCardInputMediaTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [WallpaperCardInputMediaTypeEnum] to String,
/// and [decode] dynamic data back to [WallpaperCardInputMediaTypeEnum].
class WallpaperCardInputMediaTypeEnumTypeTransformer {
  factory WallpaperCardInputMediaTypeEnumTypeTransformer() => _instance ??= const WallpaperCardInputMediaTypeEnumTypeTransformer._();

  const WallpaperCardInputMediaTypeEnumTypeTransformer._();

  String encode(WallpaperCardInputMediaTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a WallpaperCardInputMediaTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  WallpaperCardInputMediaTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'static': return WallpaperCardInputMediaTypeEnum.static_;
        case r'live': return WallpaperCardInputMediaTypeEnum.live;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [WallpaperCardInputMediaTypeEnumTypeTransformer] instance.
  static WallpaperCardInputMediaTypeEnumTypeTransformer? _instance;
}


