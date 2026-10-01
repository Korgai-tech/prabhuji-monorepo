//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ChatScreenConfigInput {
  /// Returns a new [ChatScreenConfigInput] instance.
  ChatScreenConfigInput({
    required this.enabled,
    required this.agentId,
    required this.title,
    required this.subtitle,
    this.suggestionSetId,
    this.recommendedMessages = const [],
    required this.introVideo,
  });

  bool enabled;

  String? agentId;

  String title;

  String subtitle;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? suggestionSetId;

  List<ChatRecommendedMessageInput> recommendedMessages;

  ChatIntroVideoInput? introVideo;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ChatScreenConfigInput &&
    other.enabled == enabled &&
    other.agentId == agentId &&
    other.title == title &&
    other.subtitle == subtitle &&
    other.suggestionSetId == suggestionSetId &&
    _deepEquality.equals(other.recommendedMessages, recommendedMessages) &&
    other.introVideo == introVideo;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (enabled.hashCode) +
    (agentId == null ? 0 : agentId!.hashCode) +
    (title.hashCode) +
    (subtitle.hashCode) +
    (suggestionSetId == null ? 0 : suggestionSetId!.hashCode) +
    (recommendedMessages.hashCode) +
    (introVideo == null ? 0 : introVideo!.hashCode);

  @override
  String toString() => 'ChatScreenConfigInput[enabled=$enabled, agentId=$agentId, title=$title, subtitle=$subtitle, suggestionSetId=$suggestionSetId, recommendedMessages=$recommendedMessages, introVideo=$introVideo]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'enabled'] = this.enabled;
    if (this.agentId != null) {
      json[r'agentId'] = this.agentId;
    } else {
      json[r'agentId'] = null;
    }
      json[r'title'] = this.title;
      json[r'subtitle'] = this.subtitle;
    if (this.suggestionSetId != null) {
      json[r'suggestionSetId'] = this.suggestionSetId;
    } else {
      json[r'suggestionSetId'] = null;
    }
      json[r'recommendedMessages'] = this.recommendedMessages;
    if (this.introVideo != null) {
      json[r'introVideo'] = this.introVideo;
    } else {
      json[r'introVideo'] = null;
    }
    return json;
  }

  /// Returns a new [ChatScreenConfigInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ChatScreenConfigInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'enabled'), 'Required key "ChatScreenConfigInput[enabled]" is missing from JSON.');
        assert(json[r'enabled'] != null, 'Required key "ChatScreenConfigInput[enabled]" has a null value in JSON.');
        assert(json.containsKey(r'agentId'), 'Required key "ChatScreenConfigInput[agentId]" is missing from JSON.');
        assert(json.containsKey(r'title'), 'Required key "ChatScreenConfigInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "ChatScreenConfigInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'subtitle'), 'Required key "ChatScreenConfigInput[subtitle]" is missing from JSON.');
        assert(json[r'subtitle'] != null, 'Required key "ChatScreenConfigInput[subtitle]" has a null value in JSON.');
        assert(json.containsKey(r'recommendedMessages'), 'Required key "ChatScreenConfigInput[recommendedMessages]" is missing from JSON.');
        assert(json[r'recommendedMessages'] != null, 'Required key "ChatScreenConfigInput[recommendedMessages]" has a null value in JSON.');
        assert(json.containsKey(r'introVideo'), 'Required key "ChatScreenConfigInput[introVideo]" is missing from JSON.');
        return true;
      }());

      return ChatScreenConfigInput(
        enabled: mapValueOfType<bool>(json, r'enabled')!,
        agentId: mapValueOfType<String>(json, r'agentId'),
        title: mapValueOfType<String>(json, r'title')!,
        subtitle: mapValueOfType<String>(json, r'subtitle')!,
        suggestionSetId: mapValueOfType<String>(json, r'suggestionSetId'),
        recommendedMessages: ChatRecommendedMessageInput.listFromJson(json[r'recommendedMessages']),
        introVideo: ChatIntroVideoInput.fromJson(json[r'introVideo']),
      );
    }
    return null;
  }

  static List<ChatScreenConfigInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ChatScreenConfigInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChatScreenConfigInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ChatScreenConfigInput> mapFromJson(dynamic json) {
    final map = <String, ChatScreenConfigInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ChatScreenConfigInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ChatScreenConfigInput-objects as value to a dart map
  static Map<String, List<ChatScreenConfigInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ChatScreenConfigInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ChatScreenConfigInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'enabled',
    'agentId',
    'title',
    'subtitle',
    'recommendedMessages',
    'introVideo',
  };
}

