//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BooksHomeResponseData {
  /// Returns a new [BooksHomeResponseData] instance.
  BooksHomeResponseData({
    this.sections = const [],
  });

  List<BooksHomeSection> sections;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BooksHomeResponseData &&
    _deepEquality.equals(other.sections, sections);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (sections.hashCode);

  @override
  String toString() => 'BooksHomeResponseData[sections=$sections]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'sections'] = this.sections;
    return json;
  }

  /// Returns a new [BooksHomeResponseData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BooksHomeResponseData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'sections'), 'Required key "BooksHomeResponseData[sections]" is missing from JSON.');
        assert(json[r'sections'] != null, 'Required key "BooksHomeResponseData[sections]" has a null value in JSON.');
        return true;
      }());

      return BooksHomeResponseData(
        sections: BooksHomeSection.listFromJson(json[r'sections']),
      );
    }
    return null;
  }

  static List<BooksHomeResponseData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BooksHomeResponseData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BooksHomeResponseData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BooksHomeResponseData> mapFromJson(dynamic json) {
    final map = <String, BooksHomeResponseData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BooksHomeResponseData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BooksHomeResponseData-objects as value to a dart map
  static Map<String, List<BooksHomeResponseData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BooksHomeResponseData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BooksHomeResponseData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'sections',
  };
}

