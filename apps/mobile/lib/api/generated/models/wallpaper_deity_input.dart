//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class WallpaperDeityInput {
  /// Returns a new [WallpaperDeityInput] instance.
  WallpaperDeityInput({
    required this.slug,
    required this.displayName,
    required this.iconUrl,
  });

  String slug;

  String displayName;

  String iconUrl;

  @override
  bool operator ==(Object other) => identical(this, other) || other is WallpaperDeityInput &&
    other.slug == slug &&
    other.displayName == displayName &&
    other.iconUrl == iconUrl;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (slug.hashCode) +
    (displayName.hashCode) +
    (iconUrl.hashCode);

  @override
  String toString() => 'WallpaperDeityInput[slug=$slug, displayName=$displayName, iconUrl=$iconUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'slug'] = this.slug;
      json[r'displayName'] = this.displayName;
      json[r'iconUrl'] = this.iconUrl;
    return json;
  }

  /// Returns a new [WallpaperDeityInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static WallpaperDeityInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'slug'), 'Required key "WallpaperDeityInput[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "WallpaperDeityInput[slug]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'), 'Required key "WallpaperDeityInput[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null, 'Required key "WallpaperDeityInput[displayName]" has a null value in JSON.');
        assert(json.containsKey(r'iconUrl'), 'Required key "WallpaperDeityInput[iconUrl]" is missing from JSON.');
        assert(json[r'iconUrl'] != null, 'Required key "WallpaperDeityInput[iconUrl]" has a null value in JSON.');
        return true;
      }());

      return WallpaperDeityInput(
        slug: mapValueOfType<String>(json, r'slug')!,
        displayName: mapValueOfType<String>(json, r'displayName')!,
        iconUrl: mapValueOfType<String>(json, r'iconUrl')!,
      );
    }
    return null;
  }

  static List<WallpaperDeityInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <WallpaperDeityInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = WallpaperDeityInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, WallpaperDeityInput> mapFromJson(dynamic json) {
    final map = <String, WallpaperDeityInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = WallpaperDeityInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of WallpaperDeityInput-objects as value to a dart map
  static Map<String, List<WallpaperDeityInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<WallpaperDeityInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = WallpaperDeityInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'slug',
    'displayName',
    'iconUrl',
  };
}

