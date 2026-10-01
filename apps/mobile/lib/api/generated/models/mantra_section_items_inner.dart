//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraSectionItemsInner {
  /// Returns a new [MantraSectionItemsInner] instance.
  MantraSectionItemsInner({
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

  MantraSectionItemsInnerKindEnum kind;

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
  bool operator ==(Object other) => identical(this, other) || other is MantraSectionItemsInner &&
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
  String toString() => 'MantraSectionItemsInner[kind=$kind, id=$id, title=$title, artworkUrl=$artworkUrl, singerName=$singerName, audioUrl=$audioUrl, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe, slug=$slug, displayName=$displayName, iconUrl=$iconUrl, name=$name, imageUrl=$imageUrl, backgroundColorToken=$backgroundColorToken]';

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

  /// Returns a new [MantraSectionItemsInner] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraSectionItemsInner? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "MantraSectionItemsInner[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "MantraSectionItemsInner[kind]" has a null value in JSON.');
        assert(json.containsKey(r'id'), 'Required key "MantraSectionItemsInner[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "MantraSectionItemsInner[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "MantraSectionItemsInner[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "MantraSectionItemsInner[title]" has a null value in JSON.');
        assert(json.containsKey(r'artworkUrl'), 'Required key "MantraSectionItemsInner[artworkUrl]" is missing from JSON.');
        assert(json[r'artworkUrl'] != null, 'Required key "MantraSectionItemsInner[artworkUrl]" has a null value in JSON.');
        assert(json.containsKey(r'singerName'), 'Required key "MantraSectionItemsInner[singerName]" is missing from JSON.');
        assert(json.containsKey(r'audioUrl'), 'Required key "MantraSectionItemsInner[audioUrl]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "MantraSectionItemsInner[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "MantraSectionItemsInner[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "MantraSectionItemsInner[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "MantraSectionItemsInner[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "MantraSectionItemsInner[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "MantraSectionItemsInner[likedByMe]" has a null value in JSON.');
        assert(json.containsKey(r'slug'), 'Required key "MantraSectionItemsInner[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "MantraSectionItemsInner[slug]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'), 'Required key "MantraSectionItemsInner[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null, 'Required key "MantraSectionItemsInner[displayName]" has a null value in JSON.');
        assert(json.containsKey(r'iconUrl'), 'Required key "MantraSectionItemsInner[iconUrl]" is missing from JSON.');
        assert(json[r'iconUrl'] != null, 'Required key "MantraSectionItemsInner[iconUrl]" has a null value in JSON.');
        assert(json.containsKey(r'name'), 'Required key "MantraSectionItemsInner[name]" is missing from JSON.');
        assert(json[r'name'] != null, 'Required key "MantraSectionItemsInner[name]" has a null value in JSON.');
        assert(json.containsKey(r'imageUrl'), 'Required key "MantraSectionItemsInner[imageUrl]" is missing from JSON.');
        assert(json.containsKey(r'backgroundColorToken'), 'Required key "MantraSectionItemsInner[backgroundColorToken]" is missing from JSON.');
        return true;
      }());

      return MantraSectionItemsInner(
        kind: MantraSectionItemsInnerKindEnum.fromJson(json[r'kind'])!,
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

  static List<MantraSectionItemsInner> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraSectionItemsInner>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraSectionItemsInner.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraSectionItemsInner> mapFromJson(dynamic json) {
    final map = <String, MantraSectionItemsInner>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraSectionItemsInner.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraSectionItemsInner-objects as value to a dart map
  static Map<String, List<MantraSectionItemsInner>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraSectionItemsInner>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraSectionItemsInner.listFromJson(entry.value, growable: growable,);
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


class MantraSectionItemsInnerKindEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraSectionItemsInnerKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const category = MantraSectionItemsInnerKindEnum._(r'category');

  /// List of all possible values in this [enum][MantraSectionItemsInnerKindEnum].
  static const values = <MantraSectionItemsInnerKindEnum>[
    category,
  ];

  static MantraSectionItemsInnerKindEnum? fromJson(dynamic value) => MantraSectionItemsInnerKindEnumTypeTransformer().decode(value);

  static List<MantraSectionItemsInnerKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraSectionItemsInnerKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraSectionItemsInnerKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraSectionItemsInnerKindEnum] to String,
/// and [decode] dynamic data back to [MantraSectionItemsInnerKindEnum].
class MantraSectionItemsInnerKindEnumTypeTransformer {
  factory MantraSectionItemsInnerKindEnumTypeTransformer() => _instance ??= const MantraSectionItemsInnerKindEnumTypeTransformer._();

  const MantraSectionItemsInnerKindEnumTypeTransformer._();

  String encode(MantraSectionItemsInnerKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraSectionItemsInnerKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraSectionItemsInnerKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'category': return MantraSectionItemsInnerKindEnum.category;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraSectionItemsInnerKindEnumTypeTransformer] instance.
  static MantraSectionItemsInnerKindEnumTypeTransformer? _instance;
}


