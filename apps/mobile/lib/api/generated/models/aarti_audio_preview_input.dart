//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiAudioPreviewInput {
  /// Returns a new [AartiAudioPreviewInput] instance.
  AartiAudioPreviewInput({
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

  AartiAudioPreviewInputKindEnum kind;

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
  bool operator ==(Object other) => identical(this, other) || other is AartiAudioPreviewInput &&
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
  String toString() => 'AartiAudioPreviewInput[kind=$kind, id=$id, title=$title, coverImageUrl=$coverImageUrl, singerName=$singerName, isPrabhujiOriginal=$isPrabhujiOriginal, audioStreamUrl=$audioStreamUrl, likeCount=$likeCount, shareCount=$shareCount, likedByMe=$likedByMe]';

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

  /// Returns a new [AartiAudioPreviewInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiAudioPreviewInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'), 'Required key "AartiAudioPreviewInput[kind]" is missing from JSON.');
        assert(json[r'kind'] != null, 'Required key "AartiAudioPreviewInput[kind]" has a null value in JSON.');
        assert(json.containsKey(r'id'), 'Required key "AartiAudioPreviewInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "AartiAudioPreviewInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "AartiAudioPreviewInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "AartiAudioPreviewInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "AartiAudioPreviewInput[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "AartiAudioPreviewInput[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'singerName'), 'Required key "AartiAudioPreviewInput[singerName]" is missing from JSON.');
        assert(json.containsKey(r'isPrabhujiOriginal'), 'Required key "AartiAudioPreviewInput[isPrabhujiOriginal]" is missing from JSON.');
        assert(json[r'isPrabhujiOriginal'] != null, 'Required key "AartiAudioPreviewInput[isPrabhujiOriginal]" has a null value in JSON.');
        assert(json.containsKey(r'audioStreamUrl'), 'Required key "AartiAudioPreviewInput[audioStreamUrl]" is missing from JSON.');
        assert(json.containsKey(r'likeCount'), 'Required key "AartiAudioPreviewInput[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null, 'Required key "AartiAudioPreviewInput[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'shareCount'), 'Required key "AartiAudioPreviewInput[shareCount]" is missing from JSON.');
        assert(json[r'shareCount'] != null, 'Required key "AartiAudioPreviewInput[shareCount]" has a null value in JSON.');
        assert(json.containsKey(r'likedByMe'), 'Required key "AartiAudioPreviewInput[likedByMe]" is missing from JSON.');
        assert(json[r'likedByMe'] != null, 'Required key "AartiAudioPreviewInput[likedByMe]" has a null value in JSON.');
        return true;
      }());

      return AartiAudioPreviewInput(
        kind: AartiAudioPreviewInputKindEnum.fromJson(json[r'kind'])!,
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

  static List<AartiAudioPreviewInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiAudioPreviewInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiAudioPreviewInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiAudioPreviewInput> mapFromJson(dynamic json) {
    final map = <String, AartiAudioPreviewInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiAudioPreviewInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiAudioPreviewInput-objects as value to a dart map
  static Map<String, List<AartiAudioPreviewInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiAudioPreviewInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiAudioPreviewInput.listFromJson(entry.value, growable: growable,);
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


class AartiAudioPreviewInputKindEnum {
  /// Instantiate a new enum with the provided [value].
  const AartiAudioPreviewInputKindEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const audio = AartiAudioPreviewInputKindEnum._(r'audio');

  /// List of all possible values in this [enum][AartiAudioPreviewInputKindEnum].
  static const values = <AartiAudioPreviewInputKindEnum>[
    audio,
  ];

  static AartiAudioPreviewInputKindEnum? fromJson(dynamic value) => AartiAudioPreviewInputKindEnumTypeTransformer().decode(value);

  static List<AartiAudioPreviewInputKindEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiAudioPreviewInputKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiAudioPreviewInputKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AartiAudioPreviewInputKindEnum] to String,
/// and [decode] dynamic data back to [AartiAudioPreviewInputKindEnum].
class AartiAudioPreviewInputKindEnumTypeTransformer {
  factory AartiAudioPreviewInputKindEnumTypeTransformer() => _instance ??= const AartiAudioPreviewInputKindEnumTypeTransformer._();

  const AartiAudioPreviewInputKindEnumTypeTransformer._();

  String encode(AartiAudioPreviewInputKindEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AartiAudioPreviewInputKindEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AartiAudioPreviewInputKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'audio': return AartiAudioPreviewInputKindEnum.audio;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AartiAudioPreviewInputKindEnumTypeTransformer] instance.
  static AartiAudioPreviewInputKindEnumTypeTransformer? _instance;
}


