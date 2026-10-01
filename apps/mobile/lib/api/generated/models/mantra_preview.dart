//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraPreview {
  /// Returns a new [MantraPreview] instance.
  MantraPreview({
    required this.kind,
    required this.id,
    required this.title,
    required this.artworkUrl,
    required this.singerName,
    required this.audioUrl,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
  });

  MantraPreviewKindEnum kind;

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

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraPreview &&
    other.kind == kind &&
    other.id == id &&
    other.title == title &&
    other.artworkUrl == artworkUrl &&
    other.singerName == singerName &&
    other.audioUrl == audioUrl &&
    other.likeCount == likeCount &&
    other.shareCount == shareCount &&
    other.likedByMe == likedByMe;

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
    (likedByMe.hashCode);

  @override
  String toString() => 'MantraPreview[kind=$kind, id=$id, title=$title, artworkUrl=$artworkUrl, singerName=$singerName, audioUrl=$audioUrl, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe]';

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
    return json;
  }

  /// Returns a new [MantraPreview] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraPreview? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "MantraPreview[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "MantraPreview[kind]" has a null value in JSON.');
        assert(json.containsKey(r'id'), 'Required key "MantraPreview[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "MantraPreview[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "MantraPreview[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "MantraPreview[title]" has a null value in JSON.');
        assert(json.containsKey(r'artworkUrl'), 'Required key "MantraPreview[artworkUrl]" is missing from JSON.');
        assert(json[r'artworkUrl'] != null, 'Required key "MantraPreview[artworkUrl]" has a null value in JSON.');
        assert(json.containsKey(r'singerName'), 'Required key "MantraPreview[singerName]" is missing from JSON.');
        assert(json.containsKey(r'audioUrl'), 'Required key "MantraPreview[audioUrl]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "MantraPreview[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "MantraPreview[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "MantraPreview[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "MantraPreview[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "MantraPreview[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "MantraPreview[likedByMe]" has a null value in JSON.');
        return true;
      }());

      return MantraPreview(
        kind: MantraPreviewKindEnum.fromJson(json[r'kind'])!,
        id: mapValueOfType<String>(json, r'id')!,
        title: mapValueOfType<String>(json, r'title')!,
        artworkUrl: mapValueOfType<String>(json, r'artworkUrl')!,
        singerName: mapValueOfType<String>(json, r'singerName'),
        audioUrl: mapValueOfType<String>(json, r'audioUrl'),
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
        shareCount: mapValueOfType<int>(json, r'shareCount')!,
        likedByMe: mapValueOfType<bool>(json, r'likedByMe')!,
      );
    }
    return null;
  }

  static List<MantraPreview> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraPreview>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraPreview.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraPreview> mapFromJson(dynamic json) {
    final map = <String, MantraPreview>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraPreview.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraPreview-objects as value to a dart map
  static Map<String, List<MantraPreview>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraPreview>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraPreview.listFromJson(entry.value, growable: growable,);
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
  };
}


class MantraPreviewKindEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraPreviewKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const mantra = MantraPreviewKindEnum._(r'mantra');

  /// List of all possible values in this [enum][MantraPreviewKindEnum].
  static const values = <MantraPreviewKindEnum>[
    mantra,
  ];

  static MantraPreviewKindEnum? fromJson(dynamic value) => MantraPreviewKindEnumTypeTransformer().decode(value);

  static List<MantraPreviewKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraPreviewKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraPreviewKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraPreviewKindEnum] to String,
/// and [decode] dynamic data back to [MantraPreviewKindEnum].
class MantraPreviewKindEnumTypeTransformer {
  factory MantraPreviewKindEnumTypeTransformer() => _instance ??= const MantraPreviewKindEnumTypeTransformer._();

  const MantraPreviewKindEnumTypeTransformer._();

  String encode(MantraPreviewKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraPreviewKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraPreviewKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'mantra': return MantraPreviewKindEnum.mantra;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraPreviewKindEnumTypeTransformer] instance.
  static MantraPreviewKindEnumTypeTransformer? _instance;
}


