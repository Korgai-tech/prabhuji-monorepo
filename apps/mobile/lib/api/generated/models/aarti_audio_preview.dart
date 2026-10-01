//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiAudioPreview {
  /// Returns a new [AartiAudioPreview] instance.
  AartiAudioPreview({
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
  });

  AartiAudioPreviewKindEnum kind;

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

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiAudioPreview &&
    other.kind == kind &&
    other.id == id &&
    other.title == title &&
    other.coverImageUrl == coverImageUrl &&
    other.singerName == singerName &&
    other.isPrabhujiOriginal == isPrabhujiOriginal &&
    other.audioStreamUrl == audioStreamUrl &&
    other.likeCount == likeCount &&
    other.shareCount == shareCount &&
    other.likedByMe == likedByMe;

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
    (likedByMe.hashCode);

  @override
  String toString() => 'AartiAudioPreview[kind=$kind, id=$id, title=$title, coverImageUrl=$coverImageUrl, singerName=$singerName, isPrabhujiOriginal=$isPrabhujiOriginal, audioStreamUrl=$audioStreamUrl, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe]';

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
    return json;
  }

  /// Returns a new [AartiAudioPreview] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiAudioPreview? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "AartiAudioPreview[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "AartiAudioPreview[kind]" has a null value in JSON.');
        assert(json.containsKey(r'id'), 'Required key "AartiAudioPreview[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "AartiAudioPreview[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "AartiAudioPreview[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "AartiAudioPreview[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "AartiAudioPreview[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "AartiAudioPreview[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'singerName'), 'Required key "AartiAudioPreview[singerName]" is missing from JSON.');
        assert(json.containsKey(r'isPrabhujiOriginal'), 'Required key "AartiAudioPreview[isPrabhujiOriginal]" is missing from JSON.');
        assert(json[r'isPrabhujiOriginal'] != null, 'Required key "AartiAudioPreview[isPrabhujiOriginal]" has a null value in JSON.');
        assert(json.containsKey(r'audioStreamUrl'), 'Required key "AartiAudioPreview[audioStreamUrl]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "AartiAudioPreview[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "AartiAudioPreview[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "AartiAudioPreview[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "AartiAudioPreview[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "AartiAudioPreview[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "AartiAudioPreview[likedByMe]" has a null value in JSON.');
        return true;
      }());

      return AartiAudioPreview(
        kind: AartiAudioPreviewKindEnum.fromJson(json[r'kind'])!,
        id: mapValueOfType<String>(json, r'id')!,
        title: mapValueOfType<String>(json, r'title')!,
        coverImageUrl: mapValueOfType<String>(json, r'coverImageUrl')!,
        singerName: mapValueOfType<String>(json, r'singerName'),
        isPrabhujiOriginal: mapValueOfType<bool>(json, r'isPrabhujiOriginal')!,
        audioStreamUrl: mapValueOfType<String>(json, r'audioStreamUrl'),
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
        shareCount: mapValueOfType<int>(json, r'shareCount')!,
        likedByMe: mapValueOfType<bool>(json, r'likedByMe')!,
      );
    }
    return null;
  }

  static List<AartiAudioPreview> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiAudioPreview>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiAudioPreview.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiAudioPreview> mapFromJson(dynamic json) {
    final map = <String, AartiAudioPreview>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiAudioPreview.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiAudioPreview-objects as value to a dart map
  static Map<String, List<AartiAudioPreview>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiAudioPreview>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiAudioPreview.listFromJson(entry.value, growable: growable,);
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
  };
}


class AartiAudioPreviewKindEnum {
  /// Instantiate a new enum with the provided [value].
  const AartiAudioPreviewKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const audio = AartiAudioPreviewKindEnum._(r'audio');

  /// List of all possible values in this [enum][AartiAudioPreviewKindEnum].
  static const values = <AartiAudioPreviewKindEnum>[
    audio,
  ];

  static AartiAudioPreviewKindEnum? fromJson(dynamic value) => AartiAudioPreviewKindEnumTypeTransformer().decode(value);

  static List<AartiAudioPreviewKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiAudioPreviewKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiAudioPreviewKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AartiAudioPreviewKindEnum] to String,
/// and [decode] dynamic data back to [AartiAudioPreviewKindEnum].
class AartiAudioPreviewKindEnumTypeTransformer {
  factory AartiAudioPreviewKindEnumTypeTransformer() => _instance ??= const AartiAudioPreviewKindEnumTypeTransformer._();

  const AartiAudioPreviewKindEnumTypeTransformer._();

  String encode(AartiAudioPreviewKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AartiAudioPreviewKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AartiAudioPreviewKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'audio': return AartiAudioPreviewKindEnum.audio;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AartiAudioPreviewKindEnumTypeTransformer] instance.
  static AartiAudioPreviewKindEnumTypeTransformer? _instance;
}


