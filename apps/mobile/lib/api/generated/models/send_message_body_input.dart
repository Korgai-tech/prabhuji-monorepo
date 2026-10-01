//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class SendMessageBodyInput {
  /// Returns a new [SendMessageBodyInput] instance.
  SendMessageBodyInput({
    required this.message,
    required this.agentId,
    this.sessionId,
  });

  String message;

  String agentId;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? sessionId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is SendMessageBodyInput &&
    other.message == message &&
    other.agentId == agentId &&
    other.sessionId == sessionId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (message.hashCode) +
    (agentId.hashCode) +
    (sessionId == null ? 0 : sessionId!.hashCode);

  @override
  String toString() => 'SendMessageBodyInput[message=$message, agentId=$agentId, sessionId=$sessionId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'message'] = this.message;
      json[r'agentId'] = this.agentId;
    if (this.sessionId != null) {
      json[r'sessionId'] = this.sessionId;
    } else {
      json[r'sessionId'] = null;
    }
    return json;
  }

  /// Returns a new [SendMessageBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static SendMessageBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'message'), 'Required key "SendMessageBodyInput[message]" is missing from JSON.');
        assert(json[r'message'] != null, 'Required key "SendMessageBodyInput[message]" has a null value in JSON.');
        assert(json.containsKey(r'agentId'), 'Required key "SendMessageBodyInput[agentId]" is missing from JSON.');
        assert(json[r'agentId'] != null, 'Required key "SendMessageBodyInput[agentId]" has a null value in JSON.');
        return true;
      }());

      return SendMessageBodyInput(
        message: mapValueOfType<String>(json, r'message')!,
        agentId: mapValueOfType<String>(json, r'agentId')!,
        sessionId: mapValueOfType<String>(json, r'sessionId'),
      );
    }
    return null;
  }

  static List<SendMessageBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <SendMessageBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SendMessageBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, SendMessageBodyInput> mapFromJson(dynamic json) {
    final map = <String, SendMessageBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = SendMessageBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of SendMessageBodyInput-objects as value to a dart map
  static Map<String, List<SendMessageBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<SendMessageBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = SendMessageBodyInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'message',
    'agentId',
  };
}

