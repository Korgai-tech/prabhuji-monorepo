//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class SendMessageResult {
  /// Returns a new [SendMessageResult] instance.
  SendMessageResult({
    required this.sessionId,
    required this.agentId,
    required this.userMessage,
    required this.botMessage,
  });

  String sessionId;

  String agentId;

  ChatMessage userMessage;

  ChatMessage botMessage;

  @override
  bool operator ==(Object other) => identical(this, other) || other is SendMessageResult &&
    other.sessionId == sessionId &&
    other.agentId == agentId &&
    other.userMessage == userMessage &&
    other.botMessage == botMessage;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (sessionId.hashCode) +
    (agentId.hashCode) +
    (userMessage.hashCode) +
    (botMessage.hashCode);

  @override
  String toString() => 'SendMessageResult[sessionId=$sessionId, agentId=$agentId, userMessage=$userMessage, botMessage=$botMessage]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'sessionId'] = this.sessionId;
      json[r'agentId'] = this.agentId;
      json[r'userMessage'] = this.userMessage;
      json[r'botMessage'] = this.botMessage;
    return json;
  }

  /// Returns a new [SendMessageResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static SendMessageResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'sessionId'), 'Required key "SendMessageResult[sessionId]" is missing from JSON.');
        assert(json[r'sessionId'] != null, 'Required key "SendMessageResult[sessionId]" has a null value in JSON.');
        assert(json.containsKey(r'agentId'), 'Required key "SendMessageResult[agentId]" is missing from JSON.');
        assert(json[r'agentId'] != null, 'Required key "SendMessageResult[agentId]" has a null value in JSON.');
        assert(json.containsKey(r'userMessage'), 'Required key "SendMessageResult[userMessage]" is missing from JSON.');
        assert(json[r'userMessage'] != null, 'Required key "SendMessageResult[userMessage]" has a null value in JSON.');
        assert(json.containsKey(r'botMessage'), 'Required key "SendMessageResult[botMessage]" is missing from JSON.');
        assert(json[r'botMessage'] != null, 'Required key "SendMessageResult[botMessage]" has a null value in JSON.');
        return true;
      }());

      return SendMessageResult(
        sessionId: mapValueOfType<String>(json, r'sessionId')!,
        agentId: mapValueOfType<String>(json, r'agentId')!,
        userMessage: ChatMessage.fromJson(json[r'userMessage'])!,
        botMessage: ChatMessage.fromJson(json[r'botMessage'])!,
      );
    }
    return null;
  }

  static List<SendMessageResult> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <SendMessageResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SendMessageResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, SendMessageResult> mapFromJson(dynamic json) {
    final map = <String, SendMessageResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = SendMessageResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of SendMessageResult-objects as value to a dart map
  static Map<String, List<SendMessageResult>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<SendMessageResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = SendMessageResult.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'sessionId',
    'agentId',
    'userMessage',
    'botMessage',
  };
}

