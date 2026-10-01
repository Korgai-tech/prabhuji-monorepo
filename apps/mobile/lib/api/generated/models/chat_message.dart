//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ChatMessage {
  /// Returns a new [ChatMessage] instance.
  ChatMessage({
    required this.id,
    required this.sessionId,
    required this.role,
    required this.message,
    required this.confidence,
    required this.content,
    this.matchedTags = const [],
    this.intentType,
    this.recommendedDeity,
    this.jaapCount,
    this.declineCategory,
    this.distressDetected,
    required this.createdAt,
  });

  String id;

  String sessionId;

  ChatMessageRoleEnum role;

  String message;

  String? confidence;

  ChatContentGroups content;

  List<String> matchedTags;

  String? intentType;

  String? recommendedDeity;

  num? jaapCount;

  String? declineCategory;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  bool? distressDetected;

  DateTime createdAt;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ChatMessage &&
    other.id == id &&
    other.sessionId == sessionId &&
    other.role == role &&
    other.message == message &&
    other.confidence == confidence &&
    other.content == content &&
    _deepEquality.equals(other.matchedTags, matchedTags) &&
    other.intentType == intentType &&
    other.recommendedDeity == recommendedDeity &&
    other.jaapCount == jaapCount &&
    other.declineCategory == declineCategory &&
    other.distressDetected == distressDetected &&
    other.createdAt == createdAt;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (sessionId.hashCode) +
    (role.hashCode) +
    (message.hashCode) +
    (confidence == null ? 0 : confidence!.hashCode) +
    (content.hashCode) +
    (matchedTags.hashCode) +
    (intentType == null ? 0 : intentType!.hashCode) +
    (recommendedDeity == null ? 0 : recommendedDeity!.hashCode) +
    (jaapCount == null ? 0 : jaapCount!.hashCode) +
    (declineCategory == null ? 0 : declineCategory!.hashCode) +
    (distressDetected == null ? 0 : distressDetected!.hashCode) +
    (createdAt.hashCode);

  @override
  String toString() => 'ChatMessage[id=$id, sessionId=$sessionId, role=$role, message=$message, confidence=$confidence, content=$content, matchedTags=$matchedTags, intentType=$intentType, recommendedDeity=$recommendedDeity, jaapCount=$jaapCount, declineCategory=$declineCategory, distressDetected=$distressDetected, createdAt=$createdAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'sessionId'] = this.sessionId;
      json[r'role'] = this.role;
      json[r'message'] = this.message;
    if (this.confidence != null) {
      json[r'confidence'] = this.confidence;
    } else {
      json[r'confidence'] = null;
    }
      json[r'content'] = this.content;
      json[r'matchedTags'] = this.matchedTags;
    if (this.intentType != null) {
      json[r'intentType'] = this.intentType;
    } else {
      json[r'intentType'] = null;
    }
    if (this.recommendedDeity != null) {
      json[r'recommendedDeity'] = this.recommendedDeity;
    } else {
      json[r'recommendedDeity'] = null;
    }
    if (this.jaapCount != null) {
      json[r'jaapCount'] = this.jaapCount;
    } else {
      json[r'jaapCount'] = null;
    }
    if (this.declineCategory != null) {
      json[r'declineCategory'] = this.declineCategory;
    } else {
      json[r'declineCategory'] = null;
    }
    if (this.distressDetected != null) {
      json[r'distressDetected'] = this.distressDetected;
    } else {
      json[r'distressDetected'] = null;
    }
      json[r'createdAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.createdAt.millisecondsSinceEpoch
        : this.createdAt.toUtc().toIso8601String();
    return json;
  }

  /// Returns a new [ChatMessage] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ChatMessage? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "ChatMessage[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "ChatMessage[id]" has a null value in JSON.');
        assert(json.containsKey(r'sessionId'), 'Required key "ChatMessage[sessionId]" is missing from JSON.');
        assert(json[r'sessionId'] != null, 'Required key "ChatMessage[sessionId]" has a null value in JSON.');
        assert(json.containsKey(r'role'), 'Required key "ChatMessage[role]" is missing from JSON.');
        assert(json[r'role'] != null, 'Required key "ChatMessage[role]" has a null value in JSON.');
        assert(json.containsKey(r'message'), 'Required key "ChatMessage[message]" is missing from JSON.');
        assert(json[r'message'] != null, 'Required key "ChatMessage[message]" has a null value in JSON.');
        assert(json.containsKey(r'confidence'), 'Required key "ChatMessage[confidence]" is missing from JSON.');
        assert(json.containsKey(r'content'), 'Required key "ChatMessage[content]" is missing from JSON.');
        assert(json[r'content'] != null, 'Required key "ChatMessage[content]" has a null value in JSON.');
        assert(json.containsKey(r'createdAt'), 'Required key "ChatMessage[createdAt]" is missing from JSON.');
        assert(json[r'createdAt'] != null, 'Required key "ChatMessage[createdAt]" has a null value in JSON.');
        return true;
      }());

      return ChatMessage(
        id: mapValueOfType<String>(json, r'id')!,
        sessionId: mapValueOfType<String>(json, r'sessionId')!,
        role: ChatMessageRoleEnum.fromJson(json[r'role'])!,
        message: mapValueOfType<String>(json, r'message')!,
        confidence: mapValueOfType<String>(json, r'confidence'),
        content: ChatContentGroups.fromJson(json[r'content'])!,
        matchedTags: json[r'matchedTags'] is Iterable
            ? (json[r'matchedTags'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        intentType: mapValueOfType<String>(json, r'intentType'),
        recommendedDeity: mapValueOfType<String>(json, r'recommendedDeity'),
        jaapCount: json[r'jaapCount'] == null
            ? null
            : num.parse('${json[r'jaapCount']}'),
        declineCategory: mapValueOfType<String>(json, r'declineCategory'),
        distressDetected: mapValueOfType<bool>(json, r'distressDetected'),
        createdAt: mapDateTime(json, r'createdAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')!,
      );
    }
    return null;
  }

  static List<ChatMessage> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ChatMessage>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChatMessage.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ChatMessage> mapFromJson(dynamic json) {
    final map = <String, ChatMessage>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ChatMessage.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ChatMessage-objects as value to a dart map
  static Map<String, List<ChatMessage>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ChatMessage>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ChatMessage.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'sessionId',
    'role',
    'message',
    'confidence',
    'content',
    'createdAt',
  };
}


class ChatMessageRoleEnum {
  /// Instantiate a new enum with the provided [value].
  const ChatMessageRoleEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const user = ChatMessageRoleEnum._(r'user');
  static const bot = ChatMessageRoleEnum._(r'bot');

  /// List of all possible values in this [enum][ChatMessageRoleEnum].
  static const values = <ChatMessageRoleEnum>[
    user,
    bot,
  ];

  static ChatMessageRoleEnum? fromJson(dynamic value) => ChatMessageRoleEnumTypeTransformer().decode(value);

  static List<ChatMessageRoleEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ChatMessageRoleEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChatMessageRoleEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ChatMessageRoleEnum] to String,
/// and [decode] dynamic data back to [ChatMessageRoleEnum].
class ChatMessageRoleEnumTypeTransformer {
  factory ChatMessageRoleEnumTypeTransformer() => _instance ??= const ChatMessageRoleEnumTypeTransformer._();

  const ChatMessageRoleEnumTypeTransformer._();

  String encode(ChatMessageRoleEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a ChatMessageRoleEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ChatMessageRoleEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'user': return ChatMessageRoleEnum.user;
        case r'bot': return ChatMessageRoleEnum.bot;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [ChatMessageRoleEnumTypeTransformer] instance.
  static ChatMessageRoleEnumTypeTransformer? _instance;
}


