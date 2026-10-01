//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiSectionItemsInner {
  /// Returns a new [AartiSectionItemsInner] instance.
  AartiSectionItemsInner({
    required this.kind,
    required this.id,
    required this.title,
    required this.coverImageUrl,
    required this.singerName,
    required this.isPrabhujiOriginal,
    required this.audioStreamUrl,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
    required this.slug,
    required this.displayName,
    required this.iconUrl,
    required this.name,
    required this.imageUrl,
  });

  AartiSectionItemsInnerKindEnum kind;

  String id;

  String title;

  String coverImageUrl;

  String? singerName;

  bool isPrabhujiOriginal;

  String? audioStreamUrl;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int likeCount;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int shareCount;

  bool likedByMe;

  String slug;

  String displayName;

  String iconUrl;

  String name;

  String? imageUrl;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiSectionItemsInner &&
    other.kind == kind &&
    other.id == id &&
    other.title == title &&
    other.coverImageUrl == coverImageUrl &&
    other.singerName == singerName &&
    other.isPrabhujiOriginal == isPrabhujiOriginal &&
    other.audioStreamUrl == audioStreamUrl &&
    other.likeCount == likeCount &&
    other.shareCount == shareCount &&
    other.likedByMe == likedByMe &&
    other.slug == slug &&
    other.displayName == displayName &&
    other.iconUrl == iconUrl &&
    other.name == name &&
    other.imageUrl == imageUrl;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (kind.hashCode) +
    (id.hashCode) +
    (title.hashCode) +
    (coverImageUrl.hashCode) +
    (singerName == null ? 0 : singerName!.hashCode) +
    (isPrabhujiOriginal.hashCode) +
    (audioStreamUrl == null ? 0 : audioStreamUrl!.hashCode) +
    (likeCount.hashCode) +
    (shareCount.hashCode) +
    (likedByMe.hashCode) +
    (slug.hashCode) +
    (displayName.hashCode) +
    (iconUrl.hashCode) +
    (name.hashCode) +
    (imageUrl == null ? 0 : imageUrl!.hashCode);

  @override
  String toString() => 'AartiSectionItemsInner[kind=$kind, id=$id, title=$title, coverImageUrl=$coverImageUrl, singerName=$singerName, isPrabhujiOriginal=$isPrabhujiOriginal, audioStreamUrl=$audioStreamUrl, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe, slug=$slug, displayName=$displayName, iconUrl=$iconUrl, name=$name, imageUrl=$imageUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'kind'] = this.kind;
      json[r'id'] = this.id;
      json[r'title'] = this.title;
      json[r'coverImageUrl'] = this.coverImageUrl;
    if (this.singerName != null) {
      json[r'singerName'] = this.singerName;
    } else {
      json[r'singerName'] = null;
    }
      json[r'isPrabhujiOriginal'] = this.isPrabhujiOriginal;
    if (this.audioStreamUrl != null) {
      json[r'audioStreamUrl'] = this.audioStreamUrl;
    } else {
      json[r'audioStreamUrl'] = null;
    }
      json[r'likeCount'] = this.likeCount;
      json[r'shareCount'] = this.shareCount;
      json[r'likedByMe'] = this.likedByMe;
      json[r'slug'] = this.slug;
      json[r'displayName'] = this.displayName;
      json[r'iconUrl'] = this.iconUrl;
      json[r'name'] = this.name;
    if (this.imageUrl != null) {
      json[r'imageUrl'] = this.imageUrl;
    } else {
      json[r'imageUrl'] = null;
    }
    return json;
  }

  /// Returns a new [AartiSectionItemsInner] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiSectionItemsInner? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "AartiSectionItemsInner[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "AartiSectionItemsInner[kind]" has a null value in JSON.');
        assert(json.containsKey(r'id'), 'Required key "AartiSectionItemsInner[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "AartiSectionItemsInner[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "AartiSectionItemsInner[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "AartiSectionItemsInner[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "AartiSectionItemsInner[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "AartiSectionItemsInner[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'singerName'), 'Required key "AartiSectionItemsInner[singerName]" is missing from JSON.');
        assert(json.containsKey(r'isPrabhujiOriginal'), 'Required key "AartiSectionItemsInner[isPrabhujiOriginal]" is missing from JSON.');
        assert(json[r'isPrabhujiOriginal'] != null, 'Required key "AartiSectionItemsInner[isPrabhujiOriginal]" has a null value in JSON.');
        assert(json.containsKey(r'audioStreamUrl'), 'Required key "AartiSectionItemsInner[audioStreamUrl]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "AartiSectionItemsInner[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "AartiSectionItemsInner[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "AartiSectionItemsInner[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "AartiSectionItemsInner[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "AartiSectionItemsInner[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "AartiSectionItemsInner[likedByMe]" has a null value in JSON.');
        assert(json.containsKey(r'slug'), 'Required key "AartiSectionItemsInner[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "AartiSectionItemsInner[slug]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'), 'Required key "AartiSectionItemsInner[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null, 'Required key "AartiSectionItemsInner[displayName]" has a null value in JSON.');
        assert(json.containsKey(r'iconUrl'), 'Required key "AartiSectionItemsInner[iconUrl]" is missing from JSON.');
        assert(json[r'iconUrl'] != null, 'Required key "AartiSectionItemsInner[iconUrl]" has a null value in JSON.');
        assert(json.containsKey(r'name'), 'Required key "AartiSectionItemsInner[name]" is missing from JSON.');
        assert(json[r'name'] != null, 'Required key "AartiSectionItemsInner[name]" has a null value in JSON.');
        assert(json.containsKey(r'imageUrl'), 'Required key "AartiSectionItemsInner[imageUrl]" is missing from JSON.');
        return true;
      }());

      return AartiSectionItemsInner(
        kind: AartiSectionItemsInnerKindEnum.fromJson(json[r'kind'])!,
        id: mapValueOfType<String>(json, r'id')!,
        title: mapValueOfType<String>(json, r'title')!,
        coverImageUrl: mapValueOfType<String>(json, r'coverImageUrl')!,
        singerName: mapValueOfType<String>(json, r'singerName'),
        isPrabhujiOriginal: mapValueOfType<bool>(json, r'isPrabhujiOriginal')!,
        audioStreamUrl: mapValueOfType<String>(json, r'audioStreamUrl'),
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
        shareCount: mapValueOfType<int>(json, r'shareCount')!,
        likedByMe: mapValueOfType<bool>(json, r'likedByMe')!,
        slug: mapValueOfType<String>(json, r'slug')!,
        displayName: mapValueOfType<String>(json, r'displayName')!,
        iconUrl: mapValueOfType<String>(json, r'iconUrl')!,
        name: mapValueOfType<String>(json, r'name')!,
        imageUrl: mapValueOfType<String>(json, r'imageUrl'),
      );
    }
    return null;
  }

  static List<AartiSectionItemsInner> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiSectionItemsInner>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiSectionItemsInner.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiSectionItemsInner> mapFromJson(dynamic json) {
    final map = <String, AartiSectionItemsInner>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiSectionItemsInner.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiSectionItemsInner-objects as value to a dart map
  static Map<String, List<AartiSectionItemsInner>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiSectionItemsInner>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiSectionItemsInner.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'kind',
    'id',
    'title',
    'coverImageUrl',
    'singerName',
    'isPrabhujiOriginal',
    'audioStreamUrl',
    'likeCount',
    'shareCount',
    'likedByMe',
    'slug',
    'displayName',
    'iconUrl',
    'name',
    'imageUrl',
  };
}


class AartiSectionItemsInnerKindEnum {
  /// Instantiate a new enum with the provided [value].
  const AartiSectionItemsInnerKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const category = AartiSectionItemsInnerKindEnum._(r'category');

  /// List of all possible values in this [enum][AartiSectionItemsInnerKindEnum].
  static const values = <AartiSectionItemsInnerKindEnum>[
    category,
  ];

  static AartiSectionItemsInnerKindEnum? fromJson(dynamic value) => AartiSectionItemsInnerKindEnumTypeTransformer().decode(value);

  static List<AartiSectionItemsInnerKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiSectionItemsInnerKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiSectionItemsInnerKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AartiSectionItemsInnerKindEnum] to String,
/// and [decode] dynamic data back to [AartiSectionItemsInnerKindEnum].
class AartiSectionItemsInnerKindEnumTypeTransformer {
  factory AartiSectionItemsInnerKindEnumTypeTransformer() => _instance ??= const AartiSectionItemsInnerKindEnumTypeTransformer._();

  const AartiSectionItemsInnerKindEnumTypeTransformer._();

  String encode(AartiSectionItemsInnerKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AartiSectionItemsInnerKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AartiSectionItemsInnerKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'category': return AartiSectionItemsInnerKindEnum.category;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AartiSectionItemsInnerKindEnumTypeTransformer] instance.
  static AartiSectionItemsInnerKindEnumTypeTransformer? _instance;
}


