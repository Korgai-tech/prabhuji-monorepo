//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiMainResponseInputData {
  /// Returns a new [AartiMainResponseInputData] instance.
  AartiMainResponseInputData({
    this.sections = const [],
  });

  List<AartiSectionInput> sections;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiMainResponseInputData &&
    _deepEquality.equals(other.sections, sections);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (sections.hashCode);

  @override
  String toString() => 'AartiMainResponseInputData[sections=$sections]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'sections'] = this.sections;
    return json;
  }

  /// Returns a new [AartiMainResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiMainResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'sections'), 'Required key "AartiMainResponseInputData[sections]" is missing from JSON.');
        assert(json[r'sections'] != null, 'Required key "AartiMainResponseInputData[sections]" has a null value in JSON.');
        return true;
      }());

      return AartiMainResponseInputData(
        sections: AartiSectionInput.listFromJson(json[r'sections']),
      );
    }
    return null;
  }

  static List<AartiMainResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiMainResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiMainResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiMainResponseInputData> mapFromJson(dynamic json) {
    final map = <String, AartiMainResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiMainResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiMainResponseInputData-objects as value to a dart map
  static Map<String, List<AartiMainResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiMainResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiMainResponseInputData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'sections',
  };
}

