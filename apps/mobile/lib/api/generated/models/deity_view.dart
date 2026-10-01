//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class DeityView {
  /// Returns a new [DeityView] instance.
  DeityView({
    required this.slug,
    required this.displayName,
    required this.iconUrl,
    required this.sortOrder,
  });

  String slug;

  String displayName;

  String iconUrl;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  @override
  bool operator ==(Object other) => identical(this, other) || other is DeityView &&
    other.slug == slug &&
    other.displayName == displayName &&
    other.iconUrl == iconUrl &&
    other.sortOrder == sortOrder;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (slug.hashCode) +
    (displayName.hashCode) +
    (iconUrl.hashCode) +
    (sortOrder.hashCode);

  @override
  String toString() => 'DeityView[slug=$slug, displayName=$displayName, iconUrl=$iconUrl, sortOrder=$sortOrder]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'slug'] = this.slug;
      json[r'displayName'] = this.displayName;
      json[r'iconUrl'] = this.iconUrl;
      json[r'sortOrder'] = this.sortOrder;
    return json;
  }

  /// Returns a new [DeityView] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static DeityView? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'slug'), 'Required key "DeityView[slug]" is missing from JSON.');
        assert(json[r'slug'] != null, 'Required key "DeityView[slug]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'), 'Required key "DeityView[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null, 'Required key "DeityView[displayName]" has a null value in JSON.');
        assert(json.containsKey(r'iconUrl'), 'Required key "DeityView[iconUrl]" is missing from JSON.');
        assert(json[r'iconUrl'] != null, 'Required key "DeityView[iconUrl]" has a null value in JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "DeityView[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "DeityView[sortOrder]" has a null value in JSON.');
        return true;
      }());

      return DeityView(
        slug: mapValueOfType<String>(json, r'slug')!,
        displayName: mapValueOfType<String>(json, r'displayName')!,
        iconUrl: mapValueOfType<String>(json, r'iconUrl')!,
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
      );
    }
    return null;
  }

  static List<DeityView> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <DeityView>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = DeityView.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, DeityView> mapFromJson(dynamic json) {
    final map = <String, DeityView>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = DeityView.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of DeityView-objects as value to a dart map
  static Map<String, List<DeityView>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<DeityView>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = DeityView.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'slug',
    'displayName',
    'iconUrl',
    'sortOrder',
  };
}

