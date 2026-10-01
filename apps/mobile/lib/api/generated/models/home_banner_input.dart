//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeBannerInput {
  /// Returns a new [HomeBannerInput] instance.
  HomeBannerInput({
    required this.id,
    required this.mediaType,
    required this.mediaUrl,
    required this.thumbnailUrl,
    required this.destinationType,
    required this.destinationValue,
    required this.isProFeatureDiscovery,
    required this.sortOrder,
  });

  String id;

  /// image | video. A `video` banner plays muted, looped and control-less behind its `thumbnailUrl` still; an `image` banner is just `mediaUrl`.
  HomeBannerInputMediaTypeEnum mediaType;

  String mediaUrl;

  /// Video still — non-null for `video` banners, null for `image` banners. The client paints it first and keeps it if the video fails to load.
  String? thumbnailUrl;

  /// linked_module | content_detail | pro_paywall | informational. `informational` rows are non-navigable (destinationValue = null); `pro_paywall` rows carry the paywall id in destinationValue and force isProFeatureDiscovery.
  HomeBannerInputDestinationTypeEnum destinationType;

  /// Module key, content id/deeplink, or paywall id. Always null for informational (non-navigable by contract).
  String? destinationValue;

  bool isProFeatureDiscovery;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeBannerInput &&
    other.id == id &&
    other.mediaType == mediaType &&
    other.mediaUrl == mediaUrl &&
    other.thumbnailUrl == thumbnailUrl &&
    other.destinationType == destinationType &&
    other.destinationValue == destinationValue &&
    other.isProFeatureDiscovery == isProFeatureDiscovery &&
    other.sortOrder == sortOrder;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (mediaType.hashCode) +
    (mediaUrl.hashCode) +
    (thumbnailUrl == null ? 0 : thumbnailUrl!.hashCode) +
    (destinationType.hashCode) +
    (destinationValue == null ? 0 : destinationValue!.hashCode) +
    (isProFeatureDiscovery.hashCode) +
    (sortOrder.hashCode);

  @override
  String toString() => 'HomeBannerInput[id=$id, mediaType=$mediaType, mediaUrl=$mediaUrl, thumbnailUrl=$thumbnailUrl, destinationType=$destinationType, destinationValue=$destinationValue, isProFeatureDiscovery=$isProFeatureDiscovery, sortOrder=$sortOrder]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'mediaType'] = this.mediaType;
      json[r'mediaUrl'] = this.mediaUrl;
    if (this.thumbnailUrl != null) {
      json[r'thumbnailUrl'] = this.thumbnailUrl;
    } else {
      json[r'thumbnailUrl'] = null;
    }
      json[r'destinationType'] = this.destinationType;
    if (this.destinationValue != null) {
      json[r'destinationValue'] = this.destinationValue;
    } else {
      json[r'destinationValue'] = null;
    }
      json[r'isProFeatureDiscovery'] = this.isProFeatureDiscovery;
      json[r'sortOrder'] = this.sortOrder;
    return json;
  }

  /// Returns a new [HomeBannerInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeBannerInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "HomeBannerInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "HomeBannerInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'mediaType'), 'Required key "HomeBannerInput[mediaType]" is missing from JSON.');
        assert(json[r'mediaType'] != null, 'Required key "HomeBannerInput[mediaType]" has a null value in JSON.');
        assert(json.containsKey(r'mediaUrl'), 'Required key "HomeBannerInput[mediaUrl]" is missing from JSON.');
        assert(json[r'mediaUrl'] != null, 'Required key "HomeBannerInput[mediaUrl]" has a null value in JSON.');
        assert(json.containsKey(r'thumbnailUrl'), 'Required key "HomeBannerInput[thumbnailUrl]" is missing from JSON.');
        assert(json.containsKey(r'destinationType'), 'Required key "HomeBannerInput[destinationType]" is missing from JSON.');
        assert(json[r'destinationType'] != null, 'Required key "HomeBannerInput[destinationType]" has a null value in JSON.');
        assert(json.containsKey(r'destinationValue'), 'Required key "HomeBannerInput[destinationValue]" is missing from JSON.');
        assert(json.containsKey(r'isProFeatureDiscovery'), 'Required key "HomeBannerInput[isProFeatureDiscovery]" is missing from JSON.');
        assert(json[r'isProFeatureDiscovery'] != null, 'Required key "HomeBannerInput[isProFeatureDiscovery]" has a null value in JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "HomeBannerInput[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "HomeBannerInput[sortOrder]" has a null value in JSON.');
        return true;
      }());

      return HomeBannerInput(
        id: mapValueOfType<String>(json, r'id')!,
        mediaType: HomeBannerInputMediaTypeEnum.fromJson(json[r'mediaType'])!,
        mediaUrl: mapValueOfType<String>(json, r'mediaUrl')!,
        thumbnailUrl: mapValueOfType<String>(json, r'thumbnailUrl'),
        destinationType: HomeBannerInputDestinationTypeEnum.fromJson(json[r'destinationType'])!,
        destinationValue: mapValueOfType<String>(json, r'destinationValue'),
        isProFeatureDiscovery: mapValueOfType<bool>(json, r'isProFeatureDiscovery')!,
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
      );
    }
    return null;
  }

  static List<HomeBannerInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeBannerInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeBannerInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeBannerInput> mapFromJson(dynamic json) {
    final map = <String, HomeBannerInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeBannerInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeBannerInput-objects as value to a dart map
  static Map<String, List<HomeBannerInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeBannerInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeBannerInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'mediaType',
    'mediaUrl',
    'thumbnailUrl',
    'destinationType',
    'destinationValue',
    'isProFeatureDiscovery',
    'sortOrder',
  };
}

/// image | video. A `video` banner plays muted, looped and control-less behind its `thumbnailUrl` still; an `image` banner is just `mediaUrl`.
class HomeBannerInputMediaTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const HomeBannerInputMediaTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const image = HomeBannerInputMediaTypeEnum._(r'image');
  static const video = HomeBannerInputMediaTypeEnum._(r'video');

  /// List of all possible values in this [enum][HomeBannerInputMediaTypeEnum].
  static const values = <HomeBannerInputMediaTypeEnum>[
    image,
    video,
  ];

  static HomeBannerInputMediaTypeEnum? fromJson(dynamic value) => HomeBannerInputMediaTypeEnumTypeTransformer().decode(value);

  static List<HomeBannerInputMediaTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeBannerInputMediaTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeBannerInputMediaTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HomeBannerInputMediaTypeEnum] to String,
/// and [decode] dynamic data back to [HomeBannerInputMediaTypeEnum].
class HomeBannerInputMediaTypeEnumTypeTransformer {
  factory HomeBannerInputMediaTypeEnumTypeTransformer() => _instance ??= const HomeBannerInputMediaTypeEnumTypeTransformer._();

  const HomeBannerInputMediaTypeEnumTypeTransformer._();

  String encode(HomeBannerInputMediaTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HomeBannerInputMediaTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HomeBannerInputMediaTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'image': return HomeBannerInputMediaTypeEnum.image;
        case r'video': return HomeBannerInputMediaTypeEnum.video;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HomeBannerInputMediaTypeEnumTypeTransformer] instance.
  static HomeBannerInputMediaTypeEnumTypeTransformer? _instance;
}


/// linked_module | content_detail | pro_paywall | informational. `informational` rows are non-navigable (destinationValue = null); `pro_paywall` rows carry the paywall id in destinationValue and force isProFeatureDiscovery.
class HomeBannerInputDestinationTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const HomeBannerInputDestinationTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const linkedModule = HomeBannerInputDestinationTypeEnum._(r'linked_module');
  static const contentDetail = HomeBannerInputDestinationTypeEnum._(r'content_detail');
  static const proPaywall = HomeBannerInputDestinationTypeEnum._(r'pro_paywall');
  static const informational = HomeBannerInputDestinationTypeEnum._(r'informational');

  /// List of all possible values in this [enum][HomeBannerInputDestinationTypeEnum].
  static const values = <HomeBannerInputDestinationTypeEnum>[
    linkedModule,
    contentDetail,
    proPaywall,
    informational,
  ];

  static HomeBannerInputDestinationTypeEnum? fromJson(dynamic value) => HomeBannerInputDestinationTypeEnumTypeTransformer().decode(value);

  static List<HomeBannerInputDestinationTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeBannerInputDestinationTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeBannerInputDestinationTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [HomeBannerInputDestinationTypeEnum] to String,
/// and [decode] dynamic data back to [HomeBannerInputDestinationTypeEnum].
class HomeBannerInputDestinationTypeEnumTypeTransformer {
  factory HomeBannerInputDestinationTypeEnumTypeTransformer() => _instance ??= const HomeBannerInputDestinationTypeEnumTypeTransformer._();

  const HomeBannerInputDestinationTypeEnumTypeTransformer._();

  String encode(HomeBannerInputDestinationTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a HomeBannerInputDestinationTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  HomeBannerInputDestinationTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'linked_module': return HomeBannerInputDestinationTypeEnum.linkedModule;
        case r'content_detail': return HomeBannerInputDestinationTypeEnum.contentDetail;
        case r'pro_paywall': return HomeBannerInputDestinationTypeEnum.proPaywall;
        case r'informational': return HomeBannerInputDestinationTypeEnum.informational;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [HomeBannerInputDestinationTypeEnumTypeTransformer] instance.
  static HomeBannerInputDestinationTypeEnumTypeTransformer? _instance;
}


