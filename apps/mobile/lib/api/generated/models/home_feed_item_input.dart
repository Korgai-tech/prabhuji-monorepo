//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeFeedItemInput {
  /// Returns a new [HomeFeedItemInput] instance.
  HomeFeedItemInput({
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

  HomeFeedItemInputContentTypeEnum contentType;

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

  HomeFeedItemInputBadgeEnum? badge;

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

  HomeShareMetadataInput shareMetadata;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeFeedItemInput &&
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
  String toString() => 'HomeFeedItemInput[id=$id, contentType=$contentType, module=$module, title=$title, subtitle=$subtitle, mediaUrl=$mediaUrl, audioPreviewUrl=$audioPreviewUrl, ctaLabel=$ctaLabel, ctaDestinationType=$ctaDestinationType, ctaDestinationValue=$ctaDestinationValue, ctaContentId=$ctaContentId, headerDestinationModule=$headerDestinationModule, label=$label, badge=$badge, badgeLabel=$badgeLabel, likeCount=$likeCount, viewCount=$viewCount, shareCount=$shareCount, likedByMe=$likedByMe, shareMetadata=$shareMetadata]';

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

  /// Returns a new [HomeFeedItemInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeFeedItemInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "HomeFeedItemInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "HomeFeedItemInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'), 'Required key "HomeFeedItemInput[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "HomeFeedItemInput[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'module'), 'Required key "HomeFeedItemInput[module]" is missing from JSON.');
        assert(json[r'module'] != null, 'Required key "HomeFeedItemInput[module]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "HomeFeedItemInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "HomeFeedItemInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'subtitle'), 'Required key "HomeFeedItemInput[subtitle]" is missing from JSON.');
        assert(json.containsKey(r'mediaUrl'), 'Required key "HomeFeedItemInput[mediaUrl]" is missing from JSON.');
        assert(json[r'mediaUrl'] != null, 'Required key "HomeFeedItemInput[mediaUrl]" has a null value in JSON.');
        assert(json.containsKey(r'audioPreviewUrl'), 'Required key "HomeFeedItemInput[audioPreviewUrl]" is missing from JSON.');
        assert(json.containsKey(r'ctaLabel'), 'Required key "HomeFeedItemInput[ctaLabel]" is missing from JSON.');
        assert(json[r'ctaLabel'] != null, 'Required key "HomeFeedItemInput[ctaLabel]" has a null value in JSON.');
        assert(json.containsKey(r'ctaDestinationType'), 'Required key "HomeFeedItemInput[ctaDestinationType]" is missing from JSON.');
        assert(json[r'ctaDestinationType'] != null, 'Required key "HomeFeedItemInput[ctaDestinationType]" has a null value in JSON.');
        assert(json.containsKey(r'ctaDestinationValue'), 'Required key "HomeFeedItemInput[ctaDestinationValue]" is missing from JSON.');
        assert(json[r'ctaDestinationValue'] != null, 'Required key "HomeFeedItemInput[ctaDestinationValue]" has a null value in JSON.');
        assert(json.containsKey(r'headerDestinationModule'), 'Required key "HomeFeedItemInput[headerDestinationModule]" is missing from JSON.');
        assert(json[r'headerDestinationModule'] != null, 'Required key "HomeFeedItemInput[headerDestinationModule]" has a null value in JSON.');
        assert(json.containsKey(r'label'), 'Required key "HomeFeedItemInput[label]" is missing from JSON.');
        assert(json.containsKey(r'badge'), 'Required key "HomeFeedItemInput[badge]" is missing from JSON.');
        assert(json.containsKey(r'badgeLabel'), 'Required key "HomeFeedItemInput[badgeLabel]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "HomeFeedItemInput[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "HomeFeedItemInput[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'viewCount'), 'Required key "HomeFeedItemInput[viewCount]" is missing from JSON.');
        assert(json[r'viewCount'] != null, 'Required key "HomeFeedItemInput[viewCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "HomeFeedItemInput[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "HomeFeedItemInput[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "HomeFeedItemInput[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "HomeFeedItemInput[likedByMe]" has a null value in JSON.');
        assert(json.containsKey(r'shareMetadata'), 'Required key "HomeFeedItemInput[shareMetadata]" is missing from JSON.');
        assert(json[r'shareMetadata'] != null, 'Required key "HomeFeedItemInput[shareMetadata]" has a null value in JSON.');
        return true;
      }());

      return HomeFeedItemInput(
        id: mapValueOfType<String>(json, r'id')!,
        contentType: HomeFeedItemInputContentTypeEnum.fromJson(json[r'contentType'])!,
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
        badge: HomeFeedItemInputBadgeEnum.fromJson(json[r'badge']),
        badgeLabel: mapValueOfType<String>(json, r'badgeLabel'),
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
        viewCount: mapValueOfType<int>(json, r'viewCount')!,
        shareCount: mapValueOfType<int>(json, r'shareCount')!,
        likedByMe: mapValueOfType<bool>(json, r'likedByMe')!,
        shareMetadata: HomeShareMetadataInput.fromJson(json[r'shareMetadata'])!,
      );
    }
    return null;
  }

  static List<HomeFeedItemInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeFeedItemInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeFeedItemInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeFeedItemInput> mapFromJson(dynamic json) {
    final map = <String, HomeFeedItemInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeFeedItemInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeFeedItemInput-objects as value to a dart map
  static Map<String, List<HomeFeedItemInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeFeedItemInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeFeedItemInput.listFromJson(entry.value, growable: growable,);
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


class HomeFeedItemInputContentTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const HomeFeedItemInputContentTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const wallpaper = HomeFeedItemInputContentTypeEnum._(r'wallpaper');
  static const status = HomeFeedItemInputContentTypeEnum._(r'status');
  static const aarti = HomeFeedItemInputContentTypeEnum._(r'aarti');
  static const mantra = HomeFeedItemInputContentTypeEnum._(r'mantra');
  static const ringtone = HomeFeedItemInputContentTypeEnum._(r'ringtone');

  /// List of all possible values in this [enum][HomeFeedItemInputContentTypeEnum].
  static const values = <HomeFeedItemInputContentTypeEnum>[
    wallpaper,
    status,
    aarti,
    mantra,
    ringtone,
  ];

  static HomeFeedItemInputContentTypeEnum? fromJson(dynamic value) => HomeFeedItemInputContentTypeEnumTypeTransformer().decode(value);

  static List<HomeFeedItemInputContentTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeFeedItemInputContentTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeFeedItemInputContentTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HomeFeedItemInputContentTypeEnum] to String,
/// and [decode] dynamic data back to [HomeFeedItemInputContentTypeEnum].
class HomeFeedItemInputContentTypeEnumTypeTransformer {
  factory HomeFeedItemInputContentTypeEnumTypeTransformer() => _instance ??= const HomeFeedItemInputContentTypeEnumTypeTransformer._();

  const HomeFeedItemInputContentTypeEnumTypeTransformer._();

  String encode(HomeFeedItemInputContentTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HomeFeedItemInputContentTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HomeFeedItemInputContentTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'wallpaper': return HomeFeedItemInputContentTypeEnum.wallpaper;
        case r'status': return HomeFeedItemInputContentTypeEnum.status;
        case r'aarti': return HomeFeedItemInputContentTypeEnum.aarti;
        case r'mantra': return HomeFeedItemInputContentTypeEnum.mantra;
        case r'ringtone': return HomeFeedItemInputContentTypeEnum.ringtone;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HomeFeedItemInputContentTypeEnumTypeTransformer] instance.
  static HomeFeedItemInputContentTypeEnumTypeTransformer? _instance;
}



class HomeFeedItemInputBadgeEnum {
  /// Instantiate a new enum with the provided [value].
  const HomeFeedItemInputBadgeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const trending = HomeFeedItemInputBadgeEnum._(r'trending');
  static const suggested = HomeFeedItemInputBadgeEnum._(r'suggested');

  /// List of all possible values in this [enum][HomeFeedItemInputBadgeEnum].
  static const values = <HomeFeedItemInputBadgeEnum>[
    trending,
    suggested,
  ];

  static HomeFeedItemInputBadgeEnum? fromJson(dynamic value) => HomeFeedItemInputBadgeEnumTypeTransformer().decode(value);

  static List<HomeFeedItemInputBadgeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeFeedItemInputBadgeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeFeedItemInputBadgeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HomeFeedItemInputBadgeEnum] to String,
/// and [decode] dynamic data back to [HomeFeedItemInputBadgeEnum].
class HomeFeedItemInputBadgeEnumTypeTransformer {
  factory HomeFeedItemInputBadgeEnumTypeTransformer() => _instance ??= const HomeFeedItemInputBadgeEnumTypeTransformer._();

  const HomeFeedItemInputBadgeEnumTypeTransformer._();

  String encode(HomeFeedItemInputBadgeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HomeFeedItemInputBadgeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HomeFeedItemInputBadgeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'trending': return HomeFeedItemInputBadgeEnum.trending;
        case r'suggested': return HomeFeedItemInputBadgeEnum.suggested;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HomeFeedItemInputBadgeEnumTypeTransformer] instance.
  static HomeFeedItemInputBadgeEnumTypeTransformer? _instance;
}


