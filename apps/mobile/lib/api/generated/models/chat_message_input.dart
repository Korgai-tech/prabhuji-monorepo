//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ChatMessageInput {
  /// Returns a new [ChatMessageInput] instance.
  ChatMessageInput({
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

  ChatMessageInputRoleEnum role;

  String message;

  String? confidence;

  ChatContentGroupsInput content;

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
  bool operator ==(Object other) => identical(this, other) || other is ChatMessageInput &&
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
  String toString() => 'ChatMessageInput[id=$id, sessionId=$sessionId, role=$role, message=$message, confidence=$confidence, content=$content, matchedTags=$matchedTags, intentType=$intentType, recommendedDeity=$recommendedDeity, jaapCount=$jaapCount, declineCategory=$declineCategory, distressDetected=$distressDetected, createdAt=$createdAt]';

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

  /// Returns a new [ChatMessageInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ChatMessageInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "ChatMessageInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "ChatMessageInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'sessionId'), 'Required key "ChatMessageInput[sessionId]" is missing from JSON.');
        assert(json[r'sessionId'] != null, 'Required key "ChatMessageInput[sessionId]" has a null value in JSON.');
        assert(json.containsKey(r'role'), 'Required key "ChatMessageInput[role]" is missing from JSON.');
        assert(json[r'role'] != null, 'Required key "ChatMessageInput[role]" has a null value in JSON.');
        assert(json.containsKey(r'message'), 'Required key "ChatMessageInput[message]" is missing from JSON.');
        assert(json[r'message'] != null, 'Required key "ChatMessageInput[message]" has a null value in JSON.');
        assert(json.containsKey(r'confidence'), 'Required key "ChatMessageInput[confidence]" is missing from JSON.');
        assert(json.containsKey(r'content'), 'Required key "ChatMessageInput[content]" is missing from JSON.');
        assert(json[r'content'] != null, 'Required key "ChatMessageInput[content]" has a null value in JSON.');
        assert(json.containsKey(r'createdAt'), 'Required key "ChatMessageInput[createdAt]" is missing from JSON.');
        assert(json[r'createdAt'] != null, 'Required key "ChatMessageInput[createdAt]" has a null value in JSON.');
        return true;
      }());

      return ChatMessageInput(
        id: mapValueOfType<String>(json, r'id')!,
        sessionId: mapValueOfType<String>(json, r'sessionId')!,
        role: ChatMessageInputRoleEnum.fromJson(json[r'role'])!,
        message: mapValueOfType<String>(json, r'message')!,
        confidence: mapValueOfType<String>(json, r'confidence'),
        content: ChatContentGroupsInput.fromJson(json[r'content'])!,
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

  static List<ChatMessageInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ChatMessageInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChatMessageInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ChatMessageInput> mapFromJson(dynamic json) {
    final map = <String, ChatMessageInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ChatMessageInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ChatMessageInput-objects as value to a dart map
  static Map<String, List<ChatMessageInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ChatMessageInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ChatMessageInput.listFromJson(entry.value, growable: growable,);
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


class ChatMessageInputRoleEnum {
  /// Instantiate a new enum with the provided [value].
  const ChatMessageInputRoleEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const user = ChatMessageInputRoleEnum._(r'user');
  static const bot = ChatMessageInputRoleEnum._(r'bot');

  /// List of all possible values in this [enum][ChatMessageInputRoleEnum].
  static const values = <ChatMessageInputRoleEnum>[
    user,
    bot,
  ];

  static ChatMessageInputRoleEnum? fromJson(dynamic value) => ChatMessageInputRoleEnumTypeTransformer().decode(value);

  static List<ChatMessageInputRoleEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ChatMessageInputRoleEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChatMessageInputRoleEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ChatMessageInputRoleEnum] to String,
/// and [decode] dynamic data back to [ChatMessageInputRoleEnum].
class ChatMessageInputRoleEnumTypeTransformer {
  factory ChatMessageInputRoleEnumTypeTransformer() => _instance ??= const ChatMessageInputRoleEnumTypeTransformer._();

  const ChatMessageInputRoleEnumTypeTransformer._();

  String encode(ChatMessageInputRoleEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a ChatMessageInputRoleEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ChatMessageInputRoleEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'user': return ChatMessageInputRoleEnum.user;
        case r'bot': return ChatMessageInputRoleEnum.bot;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [ChatMessageInputRoleEnumTypeTransformer] instance.
  static ChatMessageInputRoleEnumTypeTransformer? _instance;
}


