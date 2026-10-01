//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeFeedItem {
  /// Returns a new [HomeFeedItem] instance.
  HomeFeedItem({
    required this.id,
    required this.contentType,
    required this.module,
    required this.title,
    required this.subtitle,
    required this.mediaUrl,
    required this.audioPreviewUrl,
    required this.ctaLabel,
    required this.ctaDestinationType,
    required this.ctaDestinationValue,
    this.ctaContentId,
    required this.headerDestinationModule,
    required this.label,
    required this.badge,
    required this.badgeLabel,
    required this.likeCount,
    required this.viewCount,
    required this.shareCount,
    required this.likedByMe,
    required this.shareMetadata,
  });

  String id;

  HomeFeedItemContentTypeEnum contentType;

  String module;

  String title;

  String? subtitle;

  String mediaUrl;

  /// Present only for aarti | mantra | ringtone cards.
  String? audioPreviewUrl;

  String ctaLabel;

  String ctaDestinationType;

  String ctaDestinationValue;

  /// UUID of the underlying content the CTA opens — a side-car to `ctaDestinationValue` (which stays a human-readable slug). Populated by the auto-feed sync so the client can build the correct by-id deep-link into per-content play screens (`/aarti-bhajans/audio/:id`, `/mantras/audio/:id`) that look up by id with no slug fallback. Absent / null on manually-authored admin cards ⇒ the client falls back to opening the owning module. Marked `optional()` so older server builds that don't yet emit this key still parse on the client without a schema break.
  String? ctaContentId;

  String headerDestinationModule;

  String? label;

  HomeFeedItemBadgeEnum? badge;

  /// CMS-owned DISPLAY COPY for `badge` (e.g. \"TRENDING\") — the client must render this string and never hardcode badge copy. Non-null EXACTLY when `badge` is non-null: a badged row whose CMS label is missing is served with BOTH fields null (an unlabelled badge is not renderable).
  String? badgeLabel;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int likeCount;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int viewCount;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int shareCount;

  bool likedByMe;

  HomeShareMetadata shareMetadata;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeFeedItem &&
    other.id == id &&
    other.contentType == contentType &&
    other.module == module &&
    other.title == title &&
    other.subtitle == subtitle &&
    other.mediaUrl == mediaUrl &&
    other.audioPreviewUrl == audioPreviewUrl &&
    other.ctaLabel == ctaLabel &&
    other.ctaDestinationType == ctaDestinationType &&
    other.ctaDestinationValue == ctaDestinationValue &&
    other.ctaContentId == ctaContentId &&
    other.headerDestinationModule == headerDestinationModule &&
    other.label == label &&
    other.badge == badge &&
    other.badgeLabel == badgeLabel &&
    other.likeCount == likeCount &&
    other.viewCount == viewCount &&
    other.shareCount == shareCount &&
    other.likedByMe == likedByMe &&
    other.shareMetadata == shareMetadata;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (contentType.hashCode) +
    (module.hashCode) +
    (title.hashCode) +
    (subtitle == null ? 0 : subtitle!.hashCode) +
    (mediaUrl.hashCode) +
    (audioPreviewUrl == null ? 0 : audioPreviewUrl!.hashCode) +
    (ctaLabel.hashCode) +
    (ctaDestinationType.hashCode) +
    (ctaDestinationValue.hashCode) +
    (ctaContentId == null ? 0 : ctaContentId!.hashCode) +
    (headerDestinationModule.hashCode) +
    (label == null ? 0 : label!.hashCode) +
    (badge == null ? 0 : badge!.hashCode) +
    (badgeLabel == null ? 0 : badgeLabel!.hashCode) +
    (likeCount.hashCode) +
    (viewCount.hashCode) +
    (shareCount.hashCode) +
    (likedByMe.hashCode) +
    (shareMetadata.hashCode);

  @override
  String toString() => 'HomeFeedItem[id=$id, contentType=$contentType, module=$module, title=$title, subtitle=$subtitle, mediaUrl=$mediaUrl, audioPreviewUrl=$audioPreviewUrl, ctaLabel=$ctaLabel, ctaDestinationType=$ctaDestinationType, ctaDestinationValue=$ctaDestinationValue, ctaContentId=$ctaContentId, headerDestinationModule=$headerDestinationModule, label=$label, badge=$badge, badgeLabel=$badgeLabel, likeCount=$likeCount, viewCount=$viewCount, shareCount=$shareCount, likedByMe=$likedByMe, shareMetadata=$shareMetadata]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'contentType'] = this.contentType;
      json[r'module'] = this.module;
      json[r'title'] = this.title;
    if (this.subtitle != null) {
      json[r'subtitle'] = this.subtitle;
    } else {
      json[r'subtitle'] = null;
    }
      json[r'mediaUrl'] = this.mediaUrl;
    if (this.audioPreviewUrl != null) {
      json[r'audioPreviewUrl'] = this.audioPreviewUrl;
    } else {
      json[r'audioPreviewUrl'] = null;
    }
      json[r'ctaLabel'] = this.ctaLabel;
      json[r'ctaDestinationType'] = this.ctaDestinationType;
      json[r'ctaDestinationValue'] = this.ctaDestinationValue;
    if (this.ctaContentId != null) {
      json[r'ctaContentId'] = this.ctaContentId;
    } else {
      json[r'ctaContentId'] = null;
    }
      json[r'headerDestinationModule'] = this.headerDestinationModule;
    if (this.label != null) {
      json[r'label'] = this.label;
    } else {
      json[r'label'] = null;
    }
    if (this.badge != null) {
      json[r'badge'] = this.badge;
    } else {
      json[r'badge'] = null;
    }
    if (this.badgeLabel != null) {
      json[r'badgeLabel'] = this.badgeLabel;
    } else {
      json[r'badgeLabel'] = null;
    }
      json[r'likeCount'] = this.likeCount;
      json[r'viewCount'] = this.viewCount;
      json[r'shareCount'] = this.shareCount;
      json[r'likedByMe'] = this.likedByMe;
      json[r'shareMetadata'] = this.shareMetadata;
    return json;
  }

  /// Returns a new [HomeFeedItem] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeFeedItem? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "HomeFeedItem[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "HomeFeedItem[id]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'), 'Required key "HomeFeedItem[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "HomeFeedItem[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'module'), 'Required key "HomeFeedItem[module]" is missing from JSON.');
        assert(json[r'module'] != null, 'Required key "HomeFeedItem[module]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "HomeFeedItem[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "HomeFeedItem[title]" has a null value in JSON.');
        assert(json.containsKey(r'subtitle'), 'Required key "HomeFeedItem[subtitle]" is missing from JSON.');
        assert(json.containsKey(r'mediaUrl'), 'Required key "HomeFeedItem[mediaUrl]" is missing from JSON.');
        assert(json[r'mediaUrl'] != null, 'Required key "HomeFeedItem[mediaUrl]" has a null value in JSON.');
        assert(json.containsKey(r'audioPreviewUrl'), 'Required key "HomeFeedItem[audioPreviewUrl]" is missing from JSON.');
        assert(json.containsKey(r'ctaLabel'), 'Required key "HomeFeedItem[ctaLabel]" is missing from JSON.');
        assert(json[r'ctaLabel'] != null, 'Required key "HomeFeedItem[ctaLabel]" has a null value in JSON.');
        assert(json.containsKey(r'ctaDestinationType'), 'Required key "HomeFeedItem[ctaDestinationType]" is missing from JSON.');
        assert(json[r'ctaDestinationType'] != null, 'Required key "HomeFeedItem[ctaDestinationType]" has a null value in JSON.');
        assert(json.containsKey(r'ctaDestinationValue'), 'Required key "HomeFeedItem[ctaDestinationValue]" is missing from JSON.');
        assert(json[r'ctaDestinationValue'] != null, 'Required key "HomeFeedItem[ctaDestinationValue]" has a null value in JSON.');
        assert(json.containsKey(r'headerDestinationModule'), 'Required key "HomeFeedItem[headerDestinationModule]" is missing from JSON.');
        assert(json[r'headerDestinationModule'] != null, 'Required key "HomeFeedItem[headerDestinationModule]" has a null value in JSON.');
        assert(json.containsKey(r'label'), 'Required key "HomeFeedItem[label]" is missing from JSON.');
        assert(json.containsKey(r'badge'), 'Required key "HomeFeedItem[badge]" is missing from JSON.');
        assert(json.containsKey(r'badgeLabel'), 'Required key "HomeFeedItem[badgeLabel]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "HomeFeedItem[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "HomeFeedItem[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'viewCount'), 'Required key "HomeFeedItem[viewCount]" is missing from JSON.');
        assert(json[r'viewCount'] != null, 'Required key "HomeFeedItem[viewCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "HomeFeedItem[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "HomeFeedItem[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "HomeFeedItem[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "HomeFeedItem[likedByMe]" has a null value in JSON.');
        assert(json.containsKey(r'shareMetadata'), 'Required key "HomeFeedItem[shareMetadata]" is missing from JSON.');
        assert(json[r'shareMetadata'] != null, 'Required key "HomeFeedItem[shareMetadata]" has a null value in JSON.');
        return true;
      }());

      return HomeFeedItem(
        id: mapValueOfType<String>(json, r'id')!,
        contentType: HomeFeedItemContentTypeEnum.fromJson(json[r'contentType'])!,
        module: mapValueOfType<String>(json, r'module')!,
        title: mapValueOfType<String>(json, r'title')!,
        subtitle: mapValueOfType<String>(json, r'subtitle'),
        mediaUrl: mapValueOfType<String>(json, r'mediaUrl')!,
        audioPreviewUrl: mapValueOfType<String>(json, r'audioPreviewUrl'),
        ctaLabel: mapValueOfType<String>(json, r'ctaLabel')!,
        ctaDestinationType: mapValueOfType<String>(json, r'ctaDestinationType')!,
        ctaDestinationValue: mapValueOfType<String>(json, r'ctaDestinationValue')!,
        ctaContentId: mapValueOfType<String>(json, r'ctaContentId'),
        headerDestinationModule: mapValueOfType<String>(json, r'headerDestinationModule')!,
        label: mapValueOfType<String>(json, r'label'),
        badge: HomeFeedItemBadgeEnum.fromJson(json[r'badge']),
        badgeLabel: mapValueOfType<String>(json, r'badgeLabel'),
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
        viewCount: mapValueOfType<int>(json, r'viewCount')!,
        shareCount: mapValueOfType<int>(json, r'shareCount')!,
        likedByMe: mapValueOfType<bool>(json, r'likedByMe')!,
        shareMetadata: HomeShareMetadata.fromJson(json[r'shareMetadata'])!,
      );
    }
    return null;
  }

  static List<HomeFeedItem> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeFeedItem>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeFeedItem.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeFeedItem> mapFromJson(dynamic json) {
    final map = <String, HomeFeedItem>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeFeedItem.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeFeedItem-objects as value to a dart map
  static Map<String, List<HomeFeedItem>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeFeedItem>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeFeedItem.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'contentType',
    'module',
    'title',
    'subtitle',
    'mediaUrl',
    'audioPreviewUrl',
    'ctaLabel',
    'ctaDestinationType',
    'ctaDestinationValue',
    'headerDestinationModule',
    'label',
    'badge',
    'badgeLabel',
    'likeCount',
    'viewCount',
    'shareCount',
    'likedByMe',
    'shareMetadata',
  };
}


class HomeFeedItemContentTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const HomeFeedItemContentTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const wallpaper = HomeFeedItemContentTypeEnum._(r'wallpaper');
  static const status = HomeFeedItemContentTypeEnum._(r'status');
  static const aarti = HomeFeedItemContentTypeEnum._(r'aarti');
  static const mantra = HomeFeedItemContentTypeEnum._(r'mantra');
  static const ringtone = HomeFeedItemContentTypeEnum._(r'ringtone');

  /// List of all possible values in this [enum][HomeFeedItemContentTypeEnum].
  static const values = <HomeFeedItemContentTypeEnum>[
    wallpaper,
    status,
    aarti,
    mantra,
    ringtone,
  ];

  static HomeFeedItemContentTypeEnum? fromJson(dynamic value) => HomeFeedItemContentTypeEnumTypeTransformer().decode(value);

  static List<HomeFeedItemContentTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeFeedItemContentTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeFeedItemContentTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HomeFeedItemContentTypeEnum] to String,
/// and [decode] dynamic data back to [HomeFeedItemContentTypeEnum].
class HomeFeedItemContentTypeEnumTypeTransformer {
  factory HomeFeedItemContentTypeEnumTypeTransformer() => _instance ??= const HomeFeedItemContentTypeEnumTypeTransformer._();

  const HomeFeedItemContentTypeEnumTypeTransformer._();

  String encode(HomeFeedItemContentTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HomeFeedItemContentTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HomeFeedItemContentTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'wallpaper': return HomeFeedItemContentTypeEnum.wallpaper;
        case r'status': return HomeFeedItemContentTypeEnum.status;
        case r'aarti': return HomeFeedItemContentTypeEnum.aarti;
        case r'mantra': return HomeFeedItemContentTypeEnum.mantra;
        case r'ringtone': return HomeFeedItemContentTypeEnum.ringtone;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HomeFeedItemContentTypeEnumTypeTransformer] instance.
  static HomeFeedItemContentTypeEnumTypeTransformer? _instance;
}



class HomeFeedItemBadgeEnum {
  /// Instantiate a new enum with the provided [value].
  const HomeFeedItemBadgeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const trending = HomeFeedItemBadgeEnum._(r'trending');
  static const suggested = HomeFeedItemBadgeEnum._(r'suggested');

  /// List of all possible values in this [enum][HomeFeedItemBadgeEnum].
  static const values = <HomeFeedItemBadgeEnum>[
    trending,
    suggested,
  ];

  static HomeFeedItemBadgeEnum? fromJson(dynamic value) => HomeFeedItemBadgeEnumTypeTransformer().decode(value);

  static List<HomeFeedItemBadgeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeFeedItemBadgeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeFeedItemBadgeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HomeFeedItemBadgeEnum] to String,
/// and [decode] dynamic data back to [HomeFeedItemBadgeEnum].
class HomeFeedItemBadgeEnumTypeTransformer {
  factory HomeFeedItemBadgeEnumTypeTransformer() => _instance ??= const HomeFeedItemBadgeEnumTypeTransformer._();

  const HomeFeedItemBadgeEnumTypeTransformer._();

  String encode(HomeFeedItemBadgeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HomeFeedItemBadgeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HomeFeedItemBadgeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'trending': return HomeFeedItemBadgeEnum.trending;
        case r'suggested': return HomeFeedItemBadgeEnum.suggested;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HomeFeedItemBadgeEnumTypeTransformer] instance.
  static HomeFeedItemBadgeEnumTypeTransformer? _instance;
}


