//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeShareBody {
  /// Returns a new [HomeShareBody] instance.
  HomeShareBody({
    required this.contentType,
    required this.contentId,
    this.channel,
  });

  EngagementContentType contentType;

  String contentId;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? channel;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeShareBody &&
    other.contentType == contentType &&
    other.contentId == contentId &&
    other.channel == channel;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (contentType.hashCode) +
    (contentId.hashCode) +
    (channel == null ? 0 : channel!.hashCode);

  @override
  String toString() => 'HomeShareBody[contentType=$contentType, contentId=$contentId, channel=$channel]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'contentType'] = this.contentType;
      json[r'contentId'] = this.contentId;
    if (this.channel != null) {
      json[r'channel'] = this.channel;
    } else {
      json[r'channel'] = null;
    }
    return json;
  }

  /// Returns a new [HomeShareBody] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeShareBody? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'contentType'), 'Required key "HomeShareBody[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "HomeShareBody[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'contentId'), 'Required key "HomeShareBody[contentId]" is missing from JSON.');
        assert(json[r'contentId'] != null, 'Required key "HomeShareBody[contentId]" has a null value in JSON.');
        return true;
      }());

      return HomeShareBody(
        contentType: EngagementContentType.fromJson(json[r'contentType'])!,
        contentId: mapValueOfType<String>(json, r'contentId')!,
        channel: mapValueOfType<String>(json, r'channel'),
      );
    }
    return null;
  }

  static List<HomeShareBody> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeShareBody>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeShareBody.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeShareBody> mapFromJson(dynamic json) {
    final map = <String, HomeShareBody>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeShareBody.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeShareBody-objects as value to a dart map
  static Map<String, List<HomeShareBody>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeShareBody>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeShareBody.listFromJson(entry.value, growable: growable,);
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

