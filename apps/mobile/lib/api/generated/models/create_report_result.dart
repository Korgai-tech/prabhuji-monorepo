//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreateReportResult {
  /// Returns a new [CreateReportResult] instance.
  CreateReportResult({
    required this.id,
  });

  String id;

  @override
  bool operator ==(Object other) => identical(this, other) || other is CreateReportResult &&
    other.id == id;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode);

  @override
  String toString() => 'CreateReportResult[id=$id]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
    return json;
  }

  /// Returns a new [CreateReportResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreateReportResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "CreateReportResult[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "CreateReportResult[id]" has a null value in JSON.');
        return true;
      }());

      return CreateReportResult(
        id: mapValueOfType<String>(json, r'id')!,
      );
    }
    return null;
  }

  static List<CreateReportResult> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <CreateReportResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CreateReportResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreateReportResult> mapFromJson(dynamic json) {
    final map = <String, CreateReportResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreateReportResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreateReportResult-objects as value to a dart map
  static Map<String, List<CreateReportResult>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<CreateReportResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CreateReportResult.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
  };
}

