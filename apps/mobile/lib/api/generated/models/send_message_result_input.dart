//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class SendMessageResultInput {
  /// Returns a new [SendMessageResultInput] instance.
  SendMessageResultInput({
    required this.sessionId,
    required this.agentId,
    required this.userMessage,
    required this.botMessage,
  });

  String sessionId;

  String agentId;

  ChatMessageInput userMessage;

  ChatMessageInput botMessage;

  @override
  bool operator ==(Object other) => identical(this, other) || other is SendMessageResultInput &&
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
  String toString() => 'SendMessageResultInput[sessionId=$sessionId, agentId=$agentId, userMessage=$userMessage, botMessage=$botMessage]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'sessionId'] = this.sessionId;
      json[r'agentId'] = this.agentId;
      json[r'userMessage'] = this.userMessage;
      json[r'botMessage'] = this.botMessage;
    return json;
  }

  /// Returns a new [SendMessageResultInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static SendMessageResultInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'sessionId'), 'Required key "SendMessageResultInput[sessionId]" is missing from JSON.');
        assert(json[r'sessionId'] != null, 'Required key "SendMessageResultInput[sessionId]" has a null value in JSON.');
        assert(json.containsKey(r'agentId'), 'Required key "SendMessageResultInput[agentId]" is missing from JSON.');
        assert(json[r'agentId'] != null, 'Required key "SendMessageResultInput[agentId]" has a null value in JSON.');
        assert(json.containsKey(r'userMessage'), 'Required key "SendMessageResultInput[userMessage]" is missing from JSON.');
        assert(json[r'userMessage'] != null, 'Required key "SendMessageResultInput[userMessage]" has a null value in JSON.');
        assert(json.containsKey(r'botMessage'), 'Required key "SendMessageResultInput[botMessage]" is missing from JSON.');
        assert(json[r'botMessage'] != null, 'Required key "SendMessageResultInput[botMessage]" has a null value in JSON.');
        return true;
      }());

      return SendMessageResultInput(
        sessionId: mapValueOfType<String>(json, r'sessionId')!,
        agentId: mapValueOfType<String>(json, r'agentId')!,
        userMessage: ChatMessageInput.fromJson(json[r'userMessage'])!,
        botMessage: ChatMessageInput.fromJson(json[r'botMessage'])!,
      );
    }
    return null;
  }

  static List<SendMessageResultInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <SendMessageResultInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SendMessageResultInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, SendMessageResultInput> mapFromJson(dynamic json) {
    final map = <String, SendMessageResultInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = SendMessageResultInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of SendMessageResultInput-objects as value to a dart map
  static Map<String, List<SendMessageResultInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<SendMessageResultInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = SendMessageResultInput.listFromJson(entry.value, growable: growable,);
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

