//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ChatContentItemInput {
  /// Returns a new [ChatContentItemInput] instance.
  ChatContentItemInput({
    required this.id,
    required this.title,
    required this.playUrl,
    required this.icon,
  });

  String id;

  String title;

  String? playUrl;

  String icon;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ChatContentItemInput &&
    other.id == id &&
    other.title == title &&
    other.playUrl == playUrl &&
    other.icon == icon;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (title.hashCode) +
    (playUrl == null ? 0 : playUrl!.hashCode) +
    (icon.hashCode);

  @override
  String toString() => 'ChatContentItemInput[id=$id, title=$title, playUrl=$playUrl, icon=$icon]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'title'] = this.title;
    if (this.playUrl != null) {
      json[r'playUrl'] = this.playUrl;
    } else {
      json[r'playUrl'] = null;
    }
      json[r'icon'] = this.icon;
    return json;
  }

  /// Returns a new [ChatContentItemInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ChatContentItemInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "ChatContentItemInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "ChatContentItemInput[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "ChatContentItemInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "ChatContentItemInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'playUrl'), 'Required key "ChatContentItemInput[playUrl]" is missing from JSON.');
        assert(json.containsKey(r'icon'), 'Required key "ChatContentItemInput[icon]" is missing from JSON.');
        assert(json[r'icon'] != null, 'Required key "ChatContentItemInput[icon]" has a null value in JSON.');
        return true;
      }());

      return ChatContentItemInput(
        id: mapValueOfType<String>(json, r'id')!,
        title: mapValueOfType<String>(json, r'title')!,
        playUrl: mapValueOfType<String>(json, r'playUrl'),
        icon: mapValueOfType<String>(json, r'icon')!,
      );
    }
    return null;
  }

  static List<ChatContentItemInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ChatContentItemInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChatContentItemInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ChatContentItemInput> mapFromJson(dynamic json) {
    final map = <String, ChatContentItemInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ChatContentItemInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ChatContentItemInput-objects as value to a dart map
  static Map<String, List<ChatContentItemInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ChatContentItemInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ChatContentItemInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'title',
    'playUrl',
    'icon',
  };
}

