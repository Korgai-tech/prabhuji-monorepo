//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PaywallHeroMediaDisplayInput {
  /// Returns a new [PaywallHeroMediaDisplayInput] instance.
  PaywallHeroMediaDisplayInput({
    required this.mediaType,
    required this.url,
    required this.thumbnailUrl,
    required this.mediaId,
    required this.sortOrder,
  });

  String mediaType;

  String url;

  String? thumbnailUrl;

  String mediaId;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  @override
  bool operator ==(Object other) => identical(this, other) || other is PaywallHeroMediaDisplayInput &&
    other.mediaType == mediaType &&
    other.url == url &&
    other.thumbnailUrl == thumbnailUrl &&
    other.mediaId == mediaId &&
    other.sortOrder == sortOrder;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (mediaType.hashCode) +
    (url.hashCode) +
    (thumbnailUrl == null ? 0 : thumbnailUrl!.hashCode) +
    (mediaId.hashCode) +
    (sortOrder.hashCode);

  @override
  String toString() => 'PaywallHeroMediaDisplayInput[mediaType=$mediaType, url=$url, thumbnailUrl=$thumbnailUrl, mediaId=$mediaId, sortOrder=$sortOrder]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'mediaType'] = this.mediaType;
      json[r'url'] = this.url;
    if (this.thumbnailUrl != null) {
      json[r'thumbnailUrl'] = this.thumbnailUrl;
    } else {
      json[r'thumbnailUrl'] = null;
    }
      json[r'mediaId'] = this.mediaId;
      json[r'sortOrder'] = this.sortOrder;
    return json;
  }

  /// Returns a new [PaywallHeroMediaDisplayInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PaywallHeroMediaDisplayInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'mediaType'), 'Required key "PaywallHeroMediaDisplayInput[mediaType]" is missing from JSON.');
        assert(json[r'mediaType'] != null, 'Required key "PaywallHeroMediaDisplayInput[mediaType]" has a null value in JSON.');
        assert(json.containsKey(r'url'), 'Required key "PaywallHeroMediaDisplayInput[url]" is missing from JSON.');
        assert(json[r'url'] != null, 'Required key "PaywallHeroMediaDisplayInput[url]" has a null value in JSON.');
        assert(json.containsKey(r'thumbnailUrl'), 'Required key "PaywallHeroMediaDisplayInput[thumbnailUrl]" is missing from JSON.');
        assert(json.containsKey(r'mediaId'), 'Required key "PaywallHeroMediaDisplayInput[mediaId]" is missing from JSON.');
        assert(json[r'mediaId'] != null, 'Required key "PaywallHeroMediaDisplayInput[mediaId]" has a null value in JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "PaywallHeroMediaDisplayInput[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "PaywallHeroMediaDisplayInput[sortOrder]" has a null value in JSON.');
        return true;
      }());

      return PaywallHeroMediaDisplayInput(
        mediaType: mapValueOfType<String>(json, r'mediaType')!,
        url: mapValueOfType<String>(json, r'url')!,
        thumbnailUrl: mapValueOfType<String>(json, r'thumbnailUrl'),
        mediaId: mapValueOfType<String>(json, r'mediaId')!,
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
      );
    }
    return null;
  }

  static List<PaywallHeroMediaDisplayInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <PaywallHeroMediaDisplayInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PaywallHeroMediaDisplayInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PaywallHeroMediaDisplayInput> mapFromJson(dynamic json) {
    final map = <String, PaywallHeroMediaDisplayInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PaywallHeroMediaDisplayInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PaywallHeroMediaDisplayInput-objects as value to a dart map
  static Map<String, List<PaywallHeroMediaDisplayInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<PaywallHeroMediaDisplayInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PaywallHeroMediaDisplayInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'mediaType',
    'url',
    'thumbnailUrl',
    'mediaId',
    'sortOrder',
  };
}

