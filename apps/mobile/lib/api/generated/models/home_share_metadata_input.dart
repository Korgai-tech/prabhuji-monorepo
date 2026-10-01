//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeShareMetadataInput {
  /// Returns a new [HomeShareMetadataInput] instance.
  HomeShareMetadataInput({
    required this.title,
    required this.text,
    required this.deepLink,
    required this.thumbnailUrl,
  });

  String title;

  String text;

  String deepLink;

  String? thumbnailUrl;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeShareMetadataInput &&
    other.title == title &&
    other.text == text &&
    other.deepLink == deepLink &&
    other.thumbnailUrl == thumbnailUrl;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (title.hashCode) +
    (text.hashCode) +
    (deepLink.hashCode) +
    (thumbnailUrl == null ? 0 : thumbnailUrl!.hashCode);

  @override
  String toString() => 'HomeShareMetadataInput[title=$title, text=$text, deepLink=$deepLink, thumbnailUrl=$thumbnailUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'title'] = this.title;
      json[r'text'] = this.text;
      json[r'deepLink'] = this.deepLink;
    if (this.thumbnailUrl != null) {
      json[r'thumbnailUrl'] = this.thumbnailUrl;
    } else {
      json[r'thumbnailUrl'] = null;
    }
    return json;
  }

  /// Returns a new [HomeShareMetadataInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeShareMetadataInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'title'), 'Required key "HomeShareMetadataInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "HomeShareMetadataInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'text'), 'Required key "HomeShareMetadataInput[text]" is missing from JSON.');
        assert(json[r'text'] != null, 'Required key "HomeShareMetadataInput[text]" has a null value in JSON.');
        assert(json.containsKey(r'deepLink'), 'Required key "HomeShareMetadataInput[deepLink]" is missing from JSON.');
        assert(json[r'deepLink'] != null, 'Required key "HomeShareMetadataInput[deepLink]" has a null value in JSON.');
        assert(json.containsKey(r'thumbnailUrl'), 'Required key "HomeShareMetadataInput[thumbnailUrl]" is missing from JSON.');
        return true;
      }());

      return HomeShareMetadataInput(
        title: mapValueOfType<String>(json, r'title')!,
        text: mapValueOfType<String>(json, r'text')!,
        deepLink: mapValueOfType<String>(json, r'deepLink')!,
        thumbnailUrl: mapValueOfType<String>(json, r'thumbnailUrl'),
      );
    }
    return null;
  }

  static List<HomeShareMetadataInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeShareMetadataInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeShareMetadataInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeShareMetadataInput> mapFromJson(dynamic json) {
    final map = <String, HomeShareMetadataInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeShareMetadataInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeShareMetadataInput-objects as value to a dart map
  static Map<String, List<HomeShareMetadataInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeShareMetadataInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeShareMetadataInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'title',
    'text',
    'deepLink',
    'thumbnailUrl',
  };
}

