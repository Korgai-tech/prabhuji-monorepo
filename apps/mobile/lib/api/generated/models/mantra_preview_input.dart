//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraPreviewInput {
  /// Returns a new [MantraPreviewInput] instance.
  MantraPreviewInput({
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

  MantraPreviewInputKindEnum kind;

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
  bool operator ==(Object other) => identical(this, other) || other is MantraPreviewInput &&
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
  String toString() => 'MantraPreviewInput[kind=$kind, id=$id, title=$title, artworkUrl=$artworkUrl, singerName=$singerName, audioUrl=$audioUrl, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe]';

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

  /// Returns a new [MantraPreviewInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraPreviewInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "MantraPreviewInput[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "MantraPreviewInput[kind]" has a null value in JSON.');
        assert(json.containsKey(r'id'), 'Required key "MantraPreviewInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "MantraPreviewInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "MantraPreviewInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "MantraPreviewInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'artworkUrl'), 'Required key "MantraPreviewInput[artworkUrl]" is missing from JSON.');
        assert(json[r'artworkUrl'] != null, 'Required key "MantraPreviewInput[artworkUrl]" has a null value in JSON.');
        assert(json.containsKey(r'singerName'), 'Required key "MantraPreviewInput[singerName]" is missing from JSON.');
        assert(json.containsKey(r'audioUrl'), 'Required key "MantraPreviewInput[audioUrl]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "MantraPreviewInput[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "MantraPreviewInput[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "MantraPreviewInput[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "MantraPreviewInput[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "MantraPreviewInput[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "MantraPreviewInput[likedByMe]" has a null value in JSON.');
        return true;
      }());

      return MantraPreviewInput(
        kind: MantraPreviewInputKindEnum.fromJson(json[r'kind'])!,
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

  static List<MantraPreviewInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraPreviewInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraPreviewInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraPreviewInput> mapFromJson(dynamic json) {
    final map = <String, MantraPreviewInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraPreviewInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraPreviewInput-objects as value to a dart map
  static Map<String, List<MantraPreviewInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraPreviewInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraPreviewInput.listFromJson(entry.value, growable: growable,);
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


class MantraPreviewInputKindEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraPreviewInputKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const mantra = MantraPreviewInputKindEnum._(r'mantra');

  /// List of all possible values in this [enum][MantraPreviewInputKindEnum].
  static const values = <MantraPreviewInputKindEnum>[
    mantra,
  ];

  static MantraPreviewInputKindEnum? fromJson(dynamic value) => MantraPreviewInputKindEnumTypeTransformer().decode(value);

  static List<MantraPreviewInputKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraPreviewInputKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraPreviewInputKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraPreviewInputKindEnum] to String,
/// and [decode] dynamic data back to [MantraPreviewInputKindEnum].
class MantraPreviewInputKindEnumTypeTransformer {
  factory MantraPreviewInputKindEnumTypeTransformer() => _instance ??= const MantraPreviewInputKindEnumTypeTransformer._();

  const MantraPreviewInputKindEnumTypeTransformer._();

  String encode(MantraPreviewInputKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraPreviewInputKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraPreviewInputKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'mantra': return MantraPreviewInputKindEnum.mantra;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraPreviewInputKindEnumTypeTransformer] instance.
  static MantraPreviewInputKindEnumTypeTransformer? _instance;
}


