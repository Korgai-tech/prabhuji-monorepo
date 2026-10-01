//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ChatRecommendedMessage {
  /// Returns a new [ChatRecommendedMessage] instance.
  ChatRecommendedMessage({
    required this.id,
    required this.order,
    required this.text,
    this.category,
  });

  String id;

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  int order;

  String text;

  ChatRecommendedMessageCategoryEnum? category;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ChatRecommendedMessage &&
    other.id == id &&
    other.order == order &&
    other.text == text &&
    other.category == category;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (order.hashCode) +
    (text.hashCode) +
    (category == null ? 0 : category!.hashCode);

  @override
  String toString() => 'ChatRecommendedMessage[id=$id, order=$order, text=$text, category=$category]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'order'] = this.order;
      json[r'text'] = this.text;
    if (this.category != null) {
      json[r'category'] = this.category;
    } else {
      json[r'category'] = null;
    }
    return json;
  }

  /// Returns a new [ChatRecommendedMessage] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ChatRecommendedMessage? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "ChatRecommendedMessage[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "ChatRecommendedMessage[id]" has a null value in JSON.');
        assert(json.containsKey(r'order'), 'Required key "ChatRecommendedMessage[order]" is missing from JSON.');
        assert(json[r'order'] != null, 'Required key "ChatRecommendedMessage[order]" has a null value in JSON.');
        assert(json.containsKey(r'text'), 'Required key "ChatRecommendedMessage[text]" is missing from JSON.');
        assert(json[r'text'] != null, 'Required key "ChatRecommendedMessage[text]" has a null value in JSON.');
        return true;
      }());

      return ChatRecommendedMessage(
        id: mapValueOfType<String>(json, r'id')!,
        order: mapValueOfType<int>(json, r'order')!,
        text: mapValueOfType<String>(json, r'text')!,
        category: ChatRecommendedMessageCategoryEnum.fromJson(json[r'category']),
      );
    }
    return null;
  }

  static List<ChatRecommendedMessage> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ChatRecommendedMessage>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChatRecommendedMessage.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ChatRecommendedMessage> mapFromJson(dynamic json) {
    final map = <String, ChatRecommendedMessage>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ChatRecommendedMessage.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ChatRecommendedMessage-objects as value to a dart map
  static Map<String, List<ChatRecommendedMessage>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ChatRecommendedMessage>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ChatRecommendedMessage.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'order',
    'text',
  };
}


class ChatRecommendedMessageCategoryEnum {
  /// Instantiate a new enum with the provided [value].
  const ChatRecommendedMessageCategoryEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const mood = ChatRecommendedMessageCategoryEnum._(r'mood');
  static const content = ChatRecommendedMessageCategoryEnum._(r'content');
  static const horoscope = ChatRecommendedMessageCategoryEnum._(r'horoscope');
  static const scripture = ChatRecommendedMessageCategoryEnum._(r'scripture');

  /// List of all possible values in this [enum][ChatRecommendedMessageCategoryEnum].
  static const values = <ChatRecommendedMessageCategoryEnum>[
    mood,
    content,
    horoscope,
    scripture,
  ];

  static ChatRecommendedMessageCategoryEnum? fromJson(dynamic value) => ChatRecommendedMessageCategoryEnumTypeTransformer().decode(value);

  static List<ChatRecommendedMessageCategoryEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ChatRecommendedMessageCategoryEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChatRecommendedMessageCategoryEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ChatRecommendedMessageCategoryEnum] to String,
/// and [decode] dynamic data back to [ChatRecommendedMessageCategoryEnum].
class ChatRecommendedMessageCategoryEnumTypeTransformer {
  factory ChatRecommendedMessageCategoryEnumTypeTransformer() => _instance ??= const ChatRecommendedMessageCategoryEnumTypeTransformer._();

  const ChatRecommendedMessageCategoryEnumTypeTransformer._();

  String encode(ChatRecommendedMessageCategoryEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a ChatRecommendedMessageCategoryEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ChatRecommendedMessageCategoryEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'mood': return ChatRecommendedMessageCategoryEnum.mood;
        case r'content': return ChatRecommendedMessageCategoryEnum.content;
        case r'horoscope': return ChatRecommendedMessageCategoryEnum.horoscope;
        case r'scripture': return ChatRecommendedMessageCategoryEnum.scripture;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [ChatRecommendedMessageCategoryEnumTypeTransformer] instance.
  static ChatRecommendedMessageCategoryEnumTypeTransformer? _instance;
}


