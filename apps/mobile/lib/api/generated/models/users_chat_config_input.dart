//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class UsersChatConfigInput {
  /// Returns a new [UsersChatConfigInput] instance.
  UsersChatConfigInput({
    required this.enabled,
    required this.agentId,
    required this.chatType,
    required this.kuldevtaAssigned,
    required this.showKuldevetaChat,
    required this.kuldevetaName,
    required this.requiresPro,
  });

  bool enabled;

  String? agentId;

  String? chatType;

  bool kuldevtaAssigned;

  bool showKuldevetaChat;

  String? kuldevetaName;

  bool requiresPro;

  @override
  bool operator ==(Object other) => identical(this, other) || other is UsersChatConfigInput &&
    other.enabled == enabled &&
    other.agentId == agentId &&
    other.chatType == chatType &&
    other.kuldevtaAssigned == kuldevtaAssigned &&
    other.showKuldevetaChat == showKuldevetaChat &&
    other.kuldevetaName == kuldevetaName &&
    other.requiresPro == requiresPro;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (enabled.hashCode) +
    (agentId == null ? 0 : agentId!.hashCode) +
    (chatType == null ? 0 : chatType!.hashCode) +
    (kuldevtaAssigned.hashCode) +
    (showKuldevetaChat.hashCode) +
    (kuldevetaName == null ? 0 : kuldevetaName!.hashCode) +
    (requiresPro.hashCode);

  @override
  String toString() => 'UsersChatConfigInput[enabled=$enabled, agentId=$agentId, chatType=$chatType, kuldevtaAssigned=$kuldevtaAssigned, showKuldevetaChat=$showKuldevetaChat, kuldevetaName=$kuldevetaName, requiresPro=$requiresPro]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'enabled'] = this.enabled;
    if (this.agentId != null) {
      json[r'agentId'] = this.agentId;
    } else {
      json[r'agentId'] = null;
    }
    if (this.chatType != null) {
      json[r'chat_type'] = this.chatType;
    } else {
      json[r'chat_type'] = null;
    }
      json[r'kuldevtaAssigned'] = this.kuldevtaAssigned;
      json[r'show_kuldeveta_chat'] = this.showKuldevetaChat;
    if (this.kuldevetaName != null) {
      json[r'kuldeveta_name'] = this.kuldevetaName;
    } else {
      json[r'kuldeveta_name'] = null;
    }
      json[r'requiresPro'] = this.requiresPro;
    return json;
  }

  /// Returns a new [UsersChatConfigInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static UsersChatConfigInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'enabled'), 'Required key "UsersChatConfigInput[enabled]" is missing from JSON.');
        assert(json[r'enabled'] != null, 'Required key "UsersChatConfigInput[enabled]" has a null value in JSON.');
        assert(json.containsKey(r'agentId'), 'Required key "UsersChatConfigInput[agentId]" is missing from JSON.');
        assert(json.containsKey(r'chat_type'), 'Required key "UsersChatConfigInput[chat_type]" is missing from JSON.');
        assert(json.containsKey(r'kuldevtaAssigned'), 'Required key "UsersChatConfigInput[kuldevtaAssigned]" is missing from JSON.');
        assert(json[r'kuldevtaAssigned'] != null, 'Required key "UsersChatConfigInput[kuldevtaAssigned]" has a null value in JSON.');
        assert(json.containsKey(r'show_kuldeveta_chat'), 'Required key "UsersChatConfigInput[show_kuldeveta_chat]" is missing from JSON.');
        assert(json[r'show_kuldeveta_chat'] != null, 'Required key "UsersChatConfigInput[show_kuldeveta_chat]" has a null value in JSON.');
        assert(json.containsKey(r'kuldeveta_name'), 'Required key "UsersChatConfigInput[kuldeveta_name]" is missing from JSON.');
        assert(json.containsKey(r'requiresPro'), 'Required key "UsersChatConfigInput[requiresPro]" is missing from JSON.');
        assert(json[r'requiresPro'] != null, 'Required key "UsersChatConfigInput[requiresPro]" has a null value in JSON.');
        return true;
      }());

      return UsersChatConfigInput(
        enabled: mapValueOfType<bool>(json, r'enabled')!,
        agentId: mapValueOfType<String>(json, r'agentId'),
        chatType: mapValueOfType<String>(json, r'chat_type'),
        kuldevtaAssigned: mapValueOfType<bool>(json, r'kuldevtaAssigned')!,
        showKuldevetaChat: mapValueOfType<bool>(json, r'show_kuldeveta_chat')!,
        kuldevetaName: mapValueOfType<String>(json, r'kuldeveta_name'),
        requiresPro: mapValueOfType<bool>(json, r'requiresPro')!,
      );
    }
    return null;
  }

  static List<UsersChatConfigInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <UsersChatConfigInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = UsersChatConfigInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, UsersChatConfigInput> mapFromJson(dynamic json) {
    final map = <String, UsersChatConfigInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = UsersChatConfigInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of UsersChatConfigInput-objects as value to a dart map
  static Map<String, List<UsersChatConfigInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<UsersChatConfigInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = UsersChatConfigInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'enabled',
    'agentId',
    'chat_type',
    'kuldevtaAssigned',
    'show_kuldeveta_chat',
    'kuldeveta_name',
    'requiresPro',
  };
}

