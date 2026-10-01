//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiSectionInputItemsInner {
  /// Returns a new [AartiSectionInputItemsInner] instance.
  AartiSectionInputItemsInner({
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

  AartiSectionInputItemsInnerKindEnum kind;

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
  bool operator ==(Object other) => identical(this, other) || other is AartiSectionInputItemsInner &&
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
  String toString() => 'AartiSectionInputItemsInner[kind=$kind, id=$id, title=$title, coverImageUrl=$coverImageUrl, singerName=$singerName, isPrabhujiOriginal=$isPrabhujiOriginal, audioStreamUrl=$audioStreamUrl, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe, slug=$slug, displayName=$displayName, iconUrl=$iconUrl, name=$name, imageUrl=$imageUrl]';

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

  /// Returns a new [AartiSectionInputItemsInner] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiSectionInputItemsInner? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "AartiSectionInputItemsInner[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "AartiSectionInputItemsInner[kind]" has a null value in JSON.');
        assert(json.containsKey(r'id'), 'Required key "AartiSectionInputItemsInner[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "AartiSectionInputItemsInner[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "AartiSectionInputItemsInner[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "AartiSectionInputItemsInner[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "AartiSectionInputItemsInner[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "AartiSectionInputItemsInner[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'singerName'), 'Required key "AartiSectionInputItemsInner[singerName]" is missing from JSON.');
        assert(json.containsKey(r'isPrabhujiOriginal'), 'Required key "AartiSectionInputItemsInner[isPrabhujiOriginal]" is missing from JSON.');
        assert(json[r'isPrabhujiOriginal'] != null, 'Required key "AartiSectionInputItemsInner[isPrabhujiOriginal]" has a null value in JSON.');
        assert(json.containsKey(r'audioStreamUrl'), 'Required key "AartiSectionInputItemsInner[audioStreamUrl]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "AartiSectionInputItemsInner[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "AartiSectionInputItemsInner[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "AartiSectionInputItemsInner[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "AartiSectionInputItemsInner[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "AartiSectionInputItemsInner[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "AartiSectionInputItemsInner[likedByMe]" has a null value in JSON.');
        assert(json.containsKey(r'slug'), 'Required key "AartiSectionInputItemsInner[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "AartiSectionInputItemsInner[slug]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'), 'Required key "AartiSectionInputItemsInner[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null, 'Required key "AartiSectionInputItemsInner[displayName]" has a null value in JSON.');
        assert(json.containsKey(r'iconUrl'), 'Required key "AartiSectionInputItemsInner[iconUrl]" is missing from JSON.');
        assert(json[r'iconUrl'] != null, 'Required key "AartiSectionInputItemsInner[iconUrl]" has a null value in JSON.');
        assert(json.containsKey(r'name'), 'Required key "AartiSectionInputItemsInner[name]" is missing from JSON.');
        assert(json[r'name'] != null, 'Required key "AartiSectionInputItemsInner[name]" has a null value in JSON.');
        assert(json.containsKey(r'imageUrl'), 'Required key "AartiSectionInputItemsInner[imageUrl]" is missing from JSON.');
        return true;
      }());

      return AartiSectionInputItemsInner(
        kind: AartiSectionInputItemsInnerKindEnum.fromJson(json[r'kind'])!,
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

  static List<AartiSectionInputItemsInner> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiSectionInputItemsInner>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiSectionInputItemsInner.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiSectionInputItemsInner> mapFromJson(dynamic json) {
    final map = <String, AartiSectionInputItemsInner>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiSectionInputItemsInner.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiSectionInputItemsInner-objects as value to a dart map
  static Map<String, List<AartiSectionInputItemsInner>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiSectionInputItemsInner>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiSectionInputItemsInner.listFromJson(entry.value, growable: growable,);
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


class AartiSectionInputItemsInnerKindEnum {
  /// Instantiate a new enum with the provided [value].
  const AartiSectionInputItemsInnerKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const category = AartiSectionInputItemsInnerKindEnum._(r'category');

  /// List of all possible values in this [enum][AartiSectionInputItemsInnerKindEnum].
  static const values = <AartiSectionInputItemsInnerKindEnum>[
    category,
  ];

  static AartiSectionInputItemsInnerKindEnum? fromJson(dynamic value) => AartiSectionInputItemsInnerKindEnumTypeTransformer().decode(value);

  static List<AartiSectionInputItemsInnerKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiSectionInputItemsInnerKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiSectionInputItemsInnerKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AartiSectionInputItemsInnerKindEnum] to String,
/// and [decode] dynamic data back to [AartiSectionInputItemsInnerKindEnum].
class AartiSectionInputItemsInnerKindEnumTypeTransformer {
  factory AartiSectionInputItemsInnerKindEnumTypeTransformer() => _instance ??= const AartiSectionInputItemsInnerKindEnumTypeTransformer._();

  const AartiSectionInputItemsInnerKindEnumTypeTransformer._();

  String encode(AartiSectionInputItemsInnerKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AartiSectionInputItemsInnerKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AartiSectionInputItemsInnerKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'category': return AartiSectionInputItemsInnerKindEnum.category;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AartiSectionInputItemsInnerKindEnumTypeTransformer] instance.
  static AartiSectionInputItemsInnerKindEnumTypeTransformer? _instance;
}


