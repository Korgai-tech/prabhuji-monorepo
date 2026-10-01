//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RingtoneCard {
  /// Returns a new [RingtoneCard] instance.
  RingtoneCard({
    required this.id,
    required this.title,
    required this.thumbnailImageUrl,
    required this.playCount,
    required this.setCount,
    required this.deityId,
    required this.deityName,
  });

  String id;

  String title;

  String thumbnailImageUrl;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int playCount;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int setCount;

  String deityId;

  String deityName;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RingtoneCard &&
    other.id == id &&
    other.title == title &&
    other.thumbnailImageUrl == thumbnailImageUrl &&
    other.playCount == playCount &&
    other.setCount == setCount &&
    other.deityId == deityId &&
    other.deityName == deityName;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (title.hashCode) +
    (thumbnailImageUrl.hashCode) +
    (playCount.hashCode) +
    (setCount.hashCode) +
    (deityId.hashCode) +
    (deityName.hashCode);

  @override
  String toString() => 'RingtoneCard[id=$id, title=$title, thumbnailImageUrl=$thumbnailImageUrl, playCount=$playCount, setCount=$setCount, deityId=$deityId, deityName=$deityName]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'title'] = this.title;
      json[r'thumbnailImageUrl'] = this.thumbnailImageUrl;
      json[r'playCount'] = this.playCount;
      json[r'setCount'] = this.setCount;
      json[r'deityId'] = this.deityId;
      json[r'deityName'] = this.deityName;
    return json;
  }

  /// Returns a new [RingtoneCard] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RingtoneCard? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "RingtoneCard[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "RingtoneCard[id]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "RingtoneCard[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "RingtoneCard[title]" has a null value in JSON.');
        assert(json.containsKey(r'thumbnailImageUrl'), 'Required key "RingtoneCard[thumbnailImageUrl]" is missing from JSON.');
        assert(json[r'thumbnailImageUrl'] != null, 'Required key "RingtoneCard[thumbnailImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'playCount'), 'Required key "RingtoneCard[playCount]" is missing from JSON.');
        assert(json[r'playCount'] != null, 'Required key "RingtoneCard[playCount]" has a null value in JSON.');
        assert(json.containsKey(r'setCount'), 'Required key "RingtoneCard[setCount]" is missing from JSON.');
        assert(json[r'setCount'] != null, 'Required key "RingtoneCard[setCount]" has a null value in JSON.');
        assert(json.containsKey(r'deityId'), 'Required key "RingtoneCard[deityId]" is missing from JSON.');
        assert(json[r'deityId'] != null, 'Required key "RingtoneCard[deityId]" has a null value in JSON.');
        assert(json.containsKey(r'deityName'), 'Required key "RingtoneCard[deityName]" is missing from JSON.');
        assert(json[r'deityName'] != null, 'Required key "RingtoneCard[deityName]" has a null value in JSON.');
        return true;
      }());

      return RingtoneCard(
        id: mapValueOfType<String>(json, r'id')!,
        title: mapValueOfType<String>(json, r'title')!,
        thumbnailImageUrl: mapValueOfType<String>(json, r'thumbnailImageUrl')!,
        playCount: mapValueOfType<int>(json, r'playCount')!,
        setCount: mapValueOfType<int>(json, r'setCount')!,
        deityId: mapValueOfType<String>(json, r'deityId')!,
        deityName: mapValueOfType<String>(json, r'deityName')!,
      );
    }
    return null;
  }

  static List<RingtoneCard> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RingtoneCard>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RingtoneCard.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RingtoneCard> mapFromJson(dynamic json) {
    final map = <String, RingtoneCard>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RingtoneCard.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RingtoneCard-objects as value to a dart map
  static Map<String, List<RingtoneCard>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RingtoneCard>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RingtoneCard.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'title',
    'thumbnailImageUrl',
    'playCount',
    'setCount',
    'deityId',
    'deityName',
  };
}

