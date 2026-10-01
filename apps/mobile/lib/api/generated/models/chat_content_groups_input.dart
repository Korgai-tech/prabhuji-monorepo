//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ChatContentGroupsInput {
  /// Returns a new [ChatContentGroupsInput] instance.
  ChatContentGroupsInput({
    this.aarti = const [],
    this.bhajan = const [],
    this.mantra = const [],
    this.ringtone = const [],
    this.status = const [],
    this.wallpaper = const [],
    this.horoscope = const [],
  });

  List<ChatContentItemInput> aarti;

  List<ChatContentItemInput> bhajan;

  List<ChatContentItemInput> mantra;

  List<ChatContentItemInput> ringtone;

  List<ChatContentItemInput> status;

  List<ChatContentItemInput> wallpaper;

  List<ChatContentItemInput> horoscope;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ChatContentGroupsInput &&
    _deepEquality.equals(other.aarti, aarti) &&
    _deepEquality.equals(other.bhajan, bhajan) &&
    _deepEquality.equals(other.mantra, mantra) &&
    _deepEquality.equals(other.ringtone, ringtone) &&
    _deepEquality.equals(other.status, status) &&
    _deepEquality.equals(other.wallpaper, wallpaper) &&
    _deepEquality.equals(other.horoscope, horoscope);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (aarti.hashCode) +
    (bhajan.hashCode) +
    (mantra.hashCode) +
    (ringtone.hashCode) +
    (status.hashCode) +
    (wallpaper.hashCode) +
    (horoscope.hashCode);

  @override
  String toString() => 'ChatContentGroupsInput[aarti=$aarti, bhajan=$bhajan, mantra=$mantra, ringtone=$ringtone, status=$status, wallpaper=$wallpaper, horoscope=$horoscope]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'aarti'] = this.aarti;
      json[r'bhajan'] = this.bhajan;
      json[r'mantra'] = this.mantra;
      json[r'ringtone'] = this.ringtone;
      json[r'status'] = this.status;
      json[r'wallpaper'] = this.wallpaper;
      json[r'horoscope'] = this.horoscope;
    return json;
  }

  /// Returns a new [ChatContentGroupsInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ChatContentGroupsInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'aarti'), 'Required key "ChatContentGroupsInput[aarti]" is missing from JSON.');
        assert(json[r'aarti'] != null, 'Required key "ChatContentGroupsInput[aarti]" has a null value in JSON.');
        assert(json.containsKey(r'bhajan'), 'Required key "ChatContentGroupsInput[bhajan]" is missing from JSON.');
        assert(json[r'bhajan'] != null, 'Required key "ChatContentGroupsInput[bhajan]" has a null value in JSON.');
        assert(json.containsKey(r'mantra'), 'Required key "ChatContentGroupsInput[mantra]" is missing from JSON.');
        assert(json[r'mantra'] != null, 'Required key "ChatContentGroupsInput[mantra]" has a null value in JSON.');
        assert(json.containsKey(r'ringtone'), 'Required key "ChatContentGroupsInput[ringtone]" is missing from JSON.');
        assert(json[r'ringtone'] != null, 'Required key "ChatContentGroupsInput[ringtone]" has a null value in JSON.');
        assert(json.containsKey(r'status'), 'Required key "ChatContentGroupsInput[status]" is missing from JSON.');
        assert(json[r'status'] != null, 'Required key "ChatContentGroupsInput[status]" has a null value in JSON.');
        assert(json.containsKey(r'wallpaper'), 'Required key "ChatContentGroupsInput[wallpaper]" is missing from JSON.');
        assert(json[r'wallpaper'] != null, 'Required key "ChatContentGroupsInput[wallpaper]" has a null value in JSON.');
        assert(json.containsKey(r'horoscope'), 'Required key "ChatContentGroupsInput[horoscope]" is missing from JSON.');
        assert(json[r'horoscope'] != null, 'Required key "ChatContentGroupsInput[horoscope]" has a null value in JSON.');
        return true;
      }());

      return ChatContentGroupsInput(
        aarti: ChatContentItemInput.listFromJson(json[r'aarti']),
        bhajan: ChatContentItemInput.listFromJson(json[r'bhajan']),
        mantra: ChatContentItemInput.listFromJson(json[r'mantra']),
        ringtone: ChatContentItemInput.listFromJson(json[r'ringtone']),
        status: ChatContentItemInput.listFromJson(json[r'status']),
        wallpaper: ChatContentItemInput.listFromJson(json[r'wallpaper']),
        horoscope: ChatContentItemInput.listFromJson(json[r'horoscope']),
      );
    }
    return null;
  }

  static List<ChatContentGroupsInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ChatContentGroupsInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChatContentGroupsInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ChatContentGroupsInput> mapFromJson(dynamic json) {
    final map = <String, ChatContentGroupsInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ChatContentGroupsInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ChatContentGroupsInput-objects as value to a dart map
  static Map<String, List<ChatContentGroupsInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ChatContentGroupsInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ChatContentGroupsInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'aarti',
    'bhajan',
    'mantra',
    'ringtone',
    'status',
    'wallpaper',
    'horoscope',
  };
}

