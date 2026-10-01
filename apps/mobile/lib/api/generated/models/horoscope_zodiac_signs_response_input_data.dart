//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HoroscopeZodiacSignsResponseInputData {
  /// Returns a new [HoroscopeZodiacSignsResponseInputData] instance.
  HoroscopeZodiacSignsResponseInputData({
    this.signs = const [],
  });

  List<HoroscopeZodiacCardInput> signs;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HoroscopeZodiacSignsResponseInputData &&
    _deepEquality.equals(other.signs, signs);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (signs.hashCode);

  @override
  String toString() => 'HoroscopeZodiacSignsResponseInputData[signs=$signs]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'signs'] = this.signs;
    return json;
  }

  /// Returns a new [HoroscopeZodiacSignsResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HoroscopeZodiacSignsResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'signs'), 'Required key "HoroscopeZodiacSignsResponseInputData[signs]" is missing from JSON.');
        assert(json[r'signs'] != null, 'Required key "HoroscopeZodiacSignsResponseInputData[signs]" has a null value in JSON.');
        return true;
      }());

      return HoroscopeZodiacSignsResponseInputData(
        signs: HoroscopeZodiacCardInput.listFromJson(json[r'signs']),
      );
    }
    return null;
  }

  static List<HoroscopeZodiacSignsResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HoroscopeZodiacSignsResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HoroscopeZodiacSignsResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HoroscopeZodiacSignsResponseInputData> mapFromJson(dynamic json) {
    final map = <String, HoroscopeZodiacSignsResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HoroscopeZodiacSignsResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HoroscopeZodiacSignsResponseInputData-objects as value to a dart map
  static Map<String, List<HoroscopeZodiacSignsResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HoroscopeZodiacSignsResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HoroscopeZodiacSignsResponseInputData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'signs',
  };
}

