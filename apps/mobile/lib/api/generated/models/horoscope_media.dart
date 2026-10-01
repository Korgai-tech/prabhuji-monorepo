//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HoroscopeMedia {
  /// Returns a new [HoroscopeMedia] instance.
  HoroscopeMedia({
    required this.backgroundVideoUrl,
    required this.backgroundStaticFallbackUrl,
  });

  String backgroundVideoUrl;

  String backgroundStaticFallbackUrl;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HoroscopeMedia &&
    other.backgroundVideoUrl == backgroundVideoUrl &&
    other.backgroundStaticFallbackUrl == backgroundStaticFallbackUrl;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (backgroundVideoUrl.hashCode) +
    (backgroundStaticFallbackUrl.hashCode);

  @override
  String toString() => 'HoroscopeMedia[backgroundVideoUrl=$backgroundVideoUrl, backgroundStaticFallbackUrl=$backgroundStaticFallbackUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'backgroundVideoUrl'] = this.backgroundVideoUrl;
      json[r'backgroundStaticFallbackUrl'] = this.backgroundStaticFallbackUrl;
    return json;
  }

  /// Returns a new [HoroscopeMedia] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HoroscopeMedia? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'backgroundVideoUrl'), 'Required key "HoroscopeMedia[backgroundVideoUrl]" is missing from JSON.');
        assert(json[r'backgroundVideoUrl'] != null, 'Required key "HoroscopeMedia[backgroundVideoUrl]" has a null value in JSON.');
        assert(json.containsKey(r'backgroundStaticFallbackUrl'), 'Required key "HoroscopeMedia[backgroundStaticFallbackUrl]" is missing from JSON.');
        assert(json[r'backgroundStaticFallbackUrl'] != null, 'Required key "HoroscopeMedia[backgroundStaticFallbackUrl]" has a null value in JSON.');
        return true;
      }());

      return HoroscopeMedia(
        backgroundVideoUrl: mapValueOfType<String>(json, r'backgroundVideoUrl')!,
        backgroundStaticFallbackUrl: mapValueOfType<String>(json, r'backgroundStaticFallbackUrl')!,
      );
    }
    return null;
  }

  static List<HoroscopeMedia> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeMedia>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeMedia.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HoroscopeMedia> mapFromJson(dynamic json) {
    final map = <String, HoroscopeMedia>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HoroscopeMedia.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HoroscopeMedia-objects as value to a dart map
  static Map<String, List<HoroscopeMedia>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HoroscopeMedia>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HoroscopeMedia.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'backgroundVideoUrl',
    'backgroundStaticFallbackUrl',
  };
}

