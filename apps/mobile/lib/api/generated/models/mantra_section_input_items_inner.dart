//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraSectionInputItemsInner {
  /// Returns a new [MantraSectionInputItemsInner] instance.
  MantraSectionInputItemsInner({
    required this.kind,
    required this.id,
    required this.title,
    required this.artworkUrl,
    required this.singerName,
    required this.audioUrl,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
    required this.slug,
    required this.displayName,
    required this.iconUrl,
    required this.name,
    required this.imageUrl,
    required this.backgroundColorToken,
  });

  MantraSectionInputItemsInnerKindEnum kind;

  String id;

  String title;

  String artworkUrl;

  String? singerName;

  String? audioUrl;

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

  String? backgroundColorToken;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraSectionInputItemsInner &&
    other.kind == kind &&
    other.id == id &&
    other.title == title &&
    other.artworkUrl == artworkUrl &&
    other.singerName == singerName &&
    other.audioUrl == audioUrl &&
    other.likeCount == likeCount &&
    other.shareCount == shareCount &&
    other.likedByMe == likedByMe &&
    other.slug == slug &&
    other.displayName == displayName &&
    other.iconUrl == iconUrl &&
    other.name == name &&
    other.imageUrl == imageUrl &&
    other.backgroundColorToken == backgroundColorToken;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (kind.hashCode) +
    (id.hashCode) +
    (title.hashCode) +
    (artworkUrl.hashCode) +
    (singerName == null ? 0 : singerName!.hashCode) +
    (audioUrl == null ? 0 : audioUrl!.hashCode) +
    (likeCount.hashCode) +
    (shareCount.hashCode) +
    (likedByMe.hashCode) +
    (slug.hashCode) +
    (displayName.hashCode) +
    (iconUrl.hashCode) +
    (name.hashCode) +
    (imageUrl == null ? 0 : imageUrl!.hashCode) +
    (backgroundColorToken == null ? 0 : backgroundColorToken!.hashCode);

  @override
  String toString() => 'MantraSectionInputItemsInner[kind=$kind, id=$id, title=$title, artworkUrl=$artworkUrl, singerName=$singerName, audioUrl=$audioUrl, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe, slug=$slug, displayName=$displayName, iconUrl=$iconUrl, name=$name, imageUrl=$imageUrl, backgroundColorToken=$backgroundColorToken]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'kind'] = this.kind;
      json[r'id'] = this.id;
      json[r'title'] = this.title;
      json[r'artworkUrl'] = this.artworkUrl;
    if (this.singerName != null) {
      json[r'singerName'] = this.singerName;
    } else {
      json[r'singerName'] = null;
    }
    if (this.audioUrl != null) {
      json[r'audioUrl'] = this.audioUrl;
    } else {
      json[r'audioUrl'] = null;
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
    if (this.backgroundColorToken != null) {
      json[r'backgroundColorToken'] = this.backgroundColorToken;
    } else {
      json[r'backgroundColorToken'] = null;
    }
    return json;
  }

  /// Returns a new [MantraSectionInputItemsInner] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraSectionInputItemsInner? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "MantraSectionInputItemsInner[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "MantraSectionInputItemsInner[kind]" has a null value in JSON.');
        assert(json.containsKey(r'id'), 'Required key "MantraSectionInputItemsInner[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "MantraSectionInputItemsInner[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "MantraSectionInputItemsInner[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "MantraSectionInputItemsInner[title]" has a null value in JSON.');
        assert(json.containsKey(r'artworkUrl'), 'Required key "MantraSectionInputItemsInner[artworkUrl]" is missing from JSON.');
        assert(json[r'artworkUrl'] != null, 'Required key "MantraSectionInputItemsInner[artworkUrl]" has a null value in JSON.');
        assert(json.containsKey(r'singerName'), 'Required key "MantraSectionInputItemsInner[singerName]" is missing from JSON.');
        assert(json.containsKey(r'audioUrl'), 'Required key "MantraSectionInputItemsInner[audioUrl]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "MantraSectionInputItemsInner[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "MantraSectionInputItemsInner[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "MantraSectionInputItemsInner[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "MantraSectionInputItemsInner[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "MantraSectionInputItemsInner[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "MantraSectionInputItemsInner[likedByMe]" has a null value in JSON.');
        assert(json.containsKey(r'slug'), 'Required key "MantraSectionInputItemsInner[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "MantraSectionInputItemsInner[slug]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'), 'Required key "MantraSectionInputItemsInner[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null, 'Required key "MantraSectionInputItemsInner[displayName]" has a null value in JSON.');
        assert(json.containsKey(r'iconUrl'), 'Required key "MantraSectionInputItemsInner[iconUrl]" is missing from JSON.');
        assert(json[r'iconUrl'] != null, 'Required key "MantraSectionInputItemsInner[iconUrl]" has a null value in JSON.');
        assert(json.containsKey(r'name'), 'Required key "MantraSectionInputItemsInner[name]" is missing from JSON.');
        assert(json[r'name'] != null, 'Required key "MantraSectionInputItemsInner[name]" has a null value in JSON.');
        assert(json.containsKey(r'imageUrl'), 'Required key "MantraSectionInputItemsInner[imageUrl]" is missing from JSON.');
        assert(json.containsKey(r'backgroundColorToken'), 'Required key "MantraSectionInputItemsInner[backgroundColorToken]" is missing from JSON.');
        return true;
      }());

      return MantraSectionInputItemsInner(
        kind: MantraSectionInputItemsInnerKindEnum.fromJson(json[r'kind'])!,
        id: mapValueOfType<String>(json, r'id')!,
        title: mapValueOfType<String>(json, r'title')!,
        artworkUrl: mapValueOfType<String>(json, r'artworkUrl')!,
        singerName: mapValueOfType<String>(json, r'singerName'),
        audioUrl: mapValueOfType<String>(json, r'audioUrl'),
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
        shareCount: mapValueOfType<int>(json, r'shareCount')!,
        likedByMe: mapValueOfType<bool>(json, r'likedByMe')!,
        slug: mapValueOfType<String>(json, r'slug')!,
        displayName: mapValueOfType<String>(json, r'displayName')!,
        iconUrl: mapValueOfType<String>(json, r'iconUrl')!,
        name: mapValueOfType<String>(json, r'name')!,
        imageUrl: mapValueOfType<String>(json, r'imageUrl'),
        backgroundColorToken: mapValueOfType<String>(json, r'backgroundColorToken'),
      );
    }
    return null;
  }

  static List<MantraSectionInputItemsInner> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraSectionInputItemsInner>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraSectionInputItemsInner.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraSectionInputItemsInner> mapFromJson(dynamic json) {
    final map = <String, MantraSectionInputItemsInner>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraSectionInputItemsInner.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraSectionInputItemsInner-objects as value to a dart map
  static Map<String, List<MantraSectionInputItemsInner>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraSectionInputItemsInner>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraSectionInputItemsInner.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'kind',
    'id',
    'title',
    'artworkUrl',
    'singerName',
    'audioUrl',
    'likeCount',
    'shareCount',
    'likedByMe',
    'slug',
    'displayName',
    'iconUrl',
    'name',
    'imageUrl',
    'backgroundColorToken',
  };
}


class MantraSectionInputItemsInnerKindEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraSectionInputItemsInnerKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const category = MantraSectionInputItemsInnerKindEnum._(r'category');

  /// List of all possible values in this [enum][MantraSectionInputItemsInnerKindEnum].
  static const values = <MantraSectionInputItemsInnerKindEnum>[
    category,
  ];

  static MantraSectionInputItemsInnerKindEnum? fromJson(dynamic value) => MantraSectionInputItemsInnerKindEnumTypeTransformer().decode(value);

  static List<MantraSectionInputItemsInnerKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraSectionInputItemsInnerKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraSectionInputItemsInnerKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraSectionInputItemsInnerKindEnum] to String,
/// and [decode] dynamic data back to [MantraSectionInputItemsInnerKindEnum].
class MantraSectionInputItemsInnerKindEnumTypeTransformer {
  factory MantraSectionInputItemsInnerKindEnumTypeTransformer() => _instance ??= const MantraSectionInputItemsInnerKindEnumTypeTransformer._();

  const MantraSectionInputItemsInnerKindEnumTypeTransformer._();

  String encode(MantraSectionInputItemsInnerKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraSectionInputItemsInnerKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraSectionInputItemsInnerKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'category': return MantraSectionInputItemsInnerKindEnum.category;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraSectionInputItemsInnerKindEnumTypeTransformer] instance.
  static MantraSectionInputItemsInnerKindEnumTypeTransformer? _instance;
}


