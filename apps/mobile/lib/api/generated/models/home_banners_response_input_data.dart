//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeBannersResponseInputData {
  /// Returns a new [HomeBannersResponseInputData] instance.
  HomeBannersResponseInputData({
    this.banners = const [],
  });

  List<HomeBannerInput> banners;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeBannersResponseInputData &&
    _deepEquality.equals(other.banners, banners);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (banners.hashCode);

  @override
  String toString() => 'HomeBannersResponseInputData[banners=$banners]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'banners'] = this.banners;
    return json;
  }

  /// Returns a new [HomeBannersResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeBannersResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'banners'), 'Required key "HomeBannersResponseInputData[banners]" is missing from JSON.');
        assert(json[r'banners'] != null, 'Required key "HomeBannersResponseInputData[banners]" has a null value in JSON.');
        return true;
      }());

      return HomeBannersResponseInputData(
        banners: HomeBannerInput.listFromJson(json[r'banners']),
      );
    }
    return null;
  }

  static List<HomeBannersResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeBannersResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeBannersResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeBannersResponseInputData> mapFromJson(dynamic json) {
    final map = <String, HomeBannersResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeBannersResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeBannersResponseInputData-objects as value to a dart map
  static Map<String, List<HomeBannersResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeBannersResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeBannersResponseInputData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'banners',
  };
}

