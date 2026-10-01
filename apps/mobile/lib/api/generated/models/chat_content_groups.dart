//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ChatContentGroups {
  /// Returns a new [ChatContentGroups] instance.
  ChatContentGroups({
    this.aarti = const [],
    this.bhajan = const [],
    this.mantra = const [],
    this.ringtone = const [],
    this.status = const [],
    this.wallpaper = const [],
    this.horoscope = const [],
  });

  List<ChatContentItem> aarti;

  List<ChatContentItem> bhajan;

  List<ChatContentItem> mantra;

  List<ChatContentItem> ringtone;

  List<ChatContentItem> status;

  List<ChatContentItem> wallpaper;

  List<ChatContentItem> horoscope;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ChatContentGroups &&
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
  String toString() => 'ChatContentGroups[aarti=$aarti, bhajan=$bhajan, mantra=$mantra, ringtone=$ringtone, status=$status, wallpaper=$wallpaper, horoscope=$horoscope]';

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

  /// Returns a new [ChatContentGroups] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ChatContentGroups? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'aarti'), 'Required key "ChatContentGroups[aarti]" is missing from JSON.');
        assert(json[r'aarti'] != null, 'Required key "ChatContentGroups[aarti]" has a null value in JSON.');
        assert(json.containsKey(r'bhajan'), 'Required key "ChatContentGroups[bhajan]" is missing from JSON.');
        assert(json[r'bhajan'] != null, 'Required key "ChatContentGroups[bhajan]" has a null value in JSON.');
        assert(json.containsKey(r'mantra'), 'Required key "ChatContentGroups[mantra]" is missing from JSON.');
        assert(json[r'mantra'] != null, 'Required key "ChatContentGroups[mantra]" has a null value in JSON.');
        assert(json.containsKey(r'ringtone'), 'Required key "ChatContentGroups[ringtone]" is missing from JSON.');
        assert(json[r'ringtone'] != null, 'Required key "ChatContentGroups[ringtone]" has a null value in JSON.');
        assert(json.containsKey(r'status'), 'Required key "ChatContentGroups[status]" is missing from JSON.');
        assert(json[r'status'] != null, 'Required key "ChatContentGroups[status]" has a null value in JSON.');
        assert(json.containsKey(r'wallpaper'), 'Required key "ChatContentGroups[wallpaper]" is missing from JSON.');
        assert(json[r'wallpaper'] != null, 'Required key "ChatContentGroups[wallpaper]" has a null value in JSON.');
        assert(json.containsKey(r'horoscope'), 'Required key "ChatContentGroups[horoscope]" is missing from JSON.');
        assert(json[r'horoscope'] != null, 'Required key "ChatContentGroups[horoscope]" has a null value in JSON.');
        return true;
      }());

      return ChatContentGroups(
        aarti: ChatContentItem.listFromJson(json[r'aarti']),
        bhajan: ChatContentItem.listFromJson(json[r'bhajan']),
        mantra: ChatContentItem.listFromJson(json[r'mantra']),
        ringtone: ChatContentItem.listFromJson(json[r'ringtone']),
        status: ChatContentItem.listFromJson(json[r'status']),
        wallpaper: ChatContentItem.listFromJson(json[r'wallpaper']),
        horoscope: ChatContentItem.listFromJson(json[r'horoscope']),
      );
    }
    return null;
  }

  static List<ChatContentGroups> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ChatContentGroups>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChatContentGroups.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ChatContentGroups> mapFromJson(dynamic json) {
    final map = <String, ChatContentGroups>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ChatContentGroups.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ChatContentGroups-objects as value to a dart map
  static Map<String, List<ChatContentGroups>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ChatContentGroups>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ChatContentGroups.listFromJson(entry.value, growable: growable,);
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

