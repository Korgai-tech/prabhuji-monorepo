//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ChatIntroVideoInput {
  /// Returns a new [ChatIntroVideoInput] instance.
  ChatIntroVideoInput({
    required this.videoId,
    required this.url,
    required this.durationMs,
    this.posterUrl,
  });

  String videoId;

  String url;

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  int durationMs;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? posterUrl;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ChatIntroVideoInput &&
    other.videoId == videoId &&
    other.url == url &&
    other.durationMs == durationMs &&
    other.posterUrl == posterUrl;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (videoId.hashCode) +
    (url.hashCode) +
    (durationMs.hashCode) +
    (posterUrl == null ? 0 : posterUrl!.hashCode);

  @override
  String toString() => 'ChatIntroVideoInput[videoId=$videoId, url=$url, durationMs=$durationMs, posterUrl=$posterUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'videoId'] = this.videoId;
      json[r'url'] = this.url;
      json[r'durationMs'] = this.durationMs;
    if (this.posterUrl != null) {
      json[r'posterUrl'] = this.posterUrl;
    } else {
      json[r'posterUrl'] = null;
    }
    return json;
  }

  /// Returns a new [ChatIntroVideoInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ChatIntroVideoInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'videoId'), 'Required key "ChatIntroVideoInput[videoId]" is missing from JSON.');
        assert(json[r'videoId'] != null, 'Required key "ChatIntroVideoInput[videoId]" has a null value in JSON.');
        assert(json.containsKey(r'url'), 'Required key "ChatIntroVideoInput[url]" is missing from JSON.');
        assert(json[r'url'] != null, 'Required key "ChatIntroVideoInput[url]" has a null value in JSON.');
        assert(json.containsKey(r'durationMs'), 'Required key "ChatIntroVideoInput[durationMs]" is missing from JSON.');
        assert(json[r'durationMs'] != null, 'Required key "ChatIntroVideoInput[durationMs]" has a null value in JSON.');
        return true;
      }());

      return ChatIntroVideoInput(
        videoId: mapValueOfType<String>(json, r'videoId')!,
        url: mapValueOfType<String>(json, r'url')!,
        durationMs: mapValueOfType<int>(json, r'durationMs')!,
        posterUrl: mapValueOfType<String>(json, r'posterUrl'),
      );
    }
    return null;
  }

  static List<ChatIntroVideoInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ChatIntroVideoInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChatIntroVideoInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ChatIntroVideoInput> mapFromJson(dynamic json) {
    final map = <String, ChatIntroVideoInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ChatIntroVideoInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ChatIntroVideoInput-objects as value to a dart map
  static Map<String, List<ChatIntroVideoInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ChatIntroVideoInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ChatIntroVideoInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'videoId',
    'url',
    'durationMs',
  };
}

