//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiMainResponseData {
  /// Returns a new [AartiMainResponseData] instance.
  AartiMainResponseData({
    this.sections = const [],
  });

  List<AartiSection> sections;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiMainResponseData &&
    _deepEquality.equals(other.sections, sections);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (sections.hashCode);

  @override
  String toString() => 'AartiMainResponseData[sections=$sections]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'sections'] = this.sections;
    return json;
  }

  /// Returns a new [AartiMainResponseData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiMainResponseData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'sections'), 'Required key "AartiMainResponseData[sections]" is missing from JSON.');
        assert(json[r'sections'] != null, 'Required key "AartiMainResponseData[sections]" has a null value in JSON.');
        return true;
      }());

      return AartiMainResponseData(
        sections: AartiSection.listFromJson(json[r'sections']),
      );
    }
    return null;
  }

  static List<AartiMainResponseData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiMainResponseData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiMainResponseData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiMainResponseData> mapFromJson(dynamic json) {
    final map = <String, AartiMainResponseData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiMainResponseData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiMainResponseData-objects as value to a dart map
  static Map<String, List<AartiMainResponseData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiMainResponseData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiMainResponseData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'sections',
  };
}

