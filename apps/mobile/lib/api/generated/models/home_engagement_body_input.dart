//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeEngagementBodyInput {
  /// Returns a new [HomeEngagementBodyInput] instance.
  HomeEngagementBodyInput({
    required this.contentType,
    required this.contentId,
  });

  EngagementContentTypeInput contentType;

  String contentId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeEngagementBodyInput &&
    other.contentType == contentType &&
    other.contentId == contentId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (contentType.hashCode) +
    (contentId.hashCode);

  @override
  String toString() => 'HomeEngagementBodyInput[contentType=$contentType, contentId=$contentId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'contentType'] = this.contentType;
      json[r'contentId'] = this.contentId;
    return json;
  }

  /// Returns a new [HomeEngagementBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeEngagementBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'contentType'), 'Required key "HomeEngagementBodyInput[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "HomeEngagementBodyInput[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'contentId'), 'Required key "HomeEngagementBodyInput[contentId]" is missing from JSON.');
        assert(json[r'contentId'] != null, 'Required key "HomeEngagementBodyInput[contentId]" has a null value in JSON.');
        return true;
      }());

      return HomeEngagementBodyInput(
        contentType: EngagementContentTypeInput.fromJson(json[r'contentType'])!,
        contentId: mapValueOfType<String>(json, r'contentId')!,
      );
    }
    return null;
  }

  static List<HomeEngagementBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeEngagementBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeEngagementBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeEngagementBodyInput> mapFromJson(dynamic json) {
    final map = <String, HomeEngagementBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeEngagementBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeEngagementBodyInput-objects as value to a dart map
  static Map<String, List<HomeEngagementBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeEngagementBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeEngagementBodyInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'contentType',
    'contentId',
  };
}

