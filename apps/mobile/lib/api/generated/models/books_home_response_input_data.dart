//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BooksHomeResponseInputData {
  /// Returns a new [BooksHomeResponseInputData] instance.
  BooksHomeResponseInputData({
    this.sections = const [],
  });

  List<BooksHomeSectionInput> sections;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BooksHomeResponseInputData &&
    _deepEquality.equals(other.sections, sections);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (sections.hashCode);

  @override
  String toString() => 'BooksHomeResponseInputData[sections=$sections]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'sections'] = this.sections;
    return json;
  }

  /// Returns a new [BooksHomeResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BooksHomeResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'sections'), 'Required key "BooksHomeResponseInputData[sections]" is missing from JSON.');
        assert(json[r'sections'] != null, 'Required key "BooksHomeResponseInputData[sections]" has a null value in JSON.');
        return true;
      }());

      return BooksHomeResponseInputData(
        sections: BooksHomeSectionInput.listFromJson(json[r'sections']),
      );
    }
    return null;
  }

  static List<BooksHomeResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BooksHomeResponseInputData> mapFromJson(dynamic json) {
    final map = <String, BooksHomeResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BooksHomeResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BooksHomeResponseInputData-objects as value to a dart map
  static Map<String, List<BooksHomeResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BooksHomeResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BooksHomeResponseInputData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'sections',
  };
}

