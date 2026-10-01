//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ChatHistoryResponseInputData {
  /// Returns a new [ChatHistoryResponseInputData] instance.
  ChatHistoryResponseInputData({
    required this.sessionId,
    this.previousChat = const [],
    required this.nextCursor,
    required this.chatConfig,
  });

  String? sessionId;

  List<ChatMessageInput> previousChat;

  String? nextCursor;

  ChatScreenConfigInput chatConfig;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ChatHistoryResponseInputData &&
    other.sessionId == sessionId &&
    _deepEquality.equals(other.previousChat, previousChat) &&
    other.nextCursor == nextCursor &&
    other.chatConfig == chatConfig;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (sessionId == null ? 0 : sessionId!.hashCode) +
    (previousChat.hashCode) +
    (nextCursor == null ? 0 : nextCursor!.hashCode) +
    (chatConfig.hashCode);

  @override
  String toString() => 'ChatHistoryResponseInputData[sessionId=$sessionId, previousChat=$previousChat, nextCursor=$nextCursor, chatConfig=$chatConfig]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.sessionId != null) {
      json[r'sessionId'] = this.sessionId;
    } else {
      json[r'sessionId'] = null;
    }
      json[r'previousChat'] = this.previousChat;
    if (this.nextCursor != null) {
      json[r'nextCursor'] = this.nextCursor;
    } else {
      json[r'nextCursor'] = null;
    }
      json[r'chatConfig'] = this.chatConfig;
    return json;
  }

  /// Returns a new [ChatHistoryResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ChatHistoryResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'sessionId'), 'Required key "ChatHistoryResponseInputData[sessionId]" is missing from JSON.');
        assert(json.containsKey(r'previousChat'), 'Required key "ChatHistoryResponseInputData[previousChat]" is missing from JSON.');
        assert(json[r'previousChat'] != null, 'Required key "ChatHistoryResponseInputData[previousChat]" has a null value in JSON.');
        assert(json.containsKey(r'nextCursor'), 'Required key "ChatHistoryResponseInputData[nextCursor]" is missing from JSON.');
        assert(json.containsKey(r'chatConfig'), 'Required key "ChatHistoryResponseInputData[chatConfig]" is missing from JSON.');
        assert(json[r'chatConfig'] != null, 'Required key "ChatHistoryResponseInputData[chatConfig]" has a null value in JSON.');
        return true;
      }());

      return ChatHistoryResponseInputData(
        sessionId: mapValueOfType<String>(json, r'sessionId'),
        previousChat: ChatMessageInput.listFromJson(json[r'previousChat']),
        nextCursor: mapValueOfType<String>(json, r'nextCursor'),
        chatConfig: ChatScreenConfigInput.fromJson(json[r'chatConfig'])!,
      );
    }
    return null;
  }

  static List<ChatHistoryResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ChatHistoryResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChatHistoryResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ChatHistoryResponseInputData> mapFromJson(dynamic json) {
    final map = <String, ChatHistoryResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ChatHistoryResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ChatHistoryResponseInputData-objects as value to a dart map
  static Map<String, List<ChatHistoryResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ChatHistoryResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ChatHistoryResponseInputData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'sessionId',
    'previousChat',
    'nextCursor',
    'chatConfig',
  };
}

