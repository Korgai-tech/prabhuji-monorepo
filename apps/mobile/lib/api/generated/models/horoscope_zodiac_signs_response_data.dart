//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HoroscopeZodiacSignsResponseData {
  /// Returns a new [HoroscopeZodiacSignsResponseData] instance.
  HoroscopeZodiacSignsResponseData({
    this.signs = const [],
  });

  List<HoroscopeZodiacCard> signs;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HoroscopeZodiacSignsResponseData &&
    _deepEquality.equals(other.signs, signs);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (signs.hashCode);

  @override
  String toString() => 'HoroscopeZodiacSignsResponseData[signs=$signs]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'signs'] = this.signs;
    return json;
  }

  /// Returns a new [HoroscopeZodiacSignsResponseData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HoroscopeZodiacSignsResponseData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'signs'), 'Required key "HoroscopeZodiacSignsResponseData[signs]" is missing from JSON.');
        assert(json[r'signs'] != null, 'Required key "HoroscopeZodiacSignsResponseData[signs]" has a null value in JSON.');
        return true;
      }());

      return HoroscopeZodiacSignsResponseData(
        signs: HoroscopeZodiacCard.listFromJson(json[r'signs']),
      );
    }
    return null;
  }

  static List<HoroscopeZodiacSignsResponseData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeZodiacSignsResponseData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeZodiacSignsResponseData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HoroscopeZodiacSignsResponseData> mapFromJson(dynamic json) {
    final map = <String, HoroscopeZodiacSignsResponseData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HoroscopeZodiacSignsResponseData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HoroscopeZodiacSignsResponseData-objects as value to a dart map
  static Map<String, List<HoroscopeZodiacSignsResponseData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HoroscopeZodiacSignsResponseData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HoroscopeZodiacSignsResponseData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'signs',
  };
}

