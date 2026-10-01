//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreateReportResultInput {
  /// Returns a new [CreateReportResultInput] instance.
  CreateReportResultInput({
    required this.id,
  });

  String id;

  @override
  bool operator ==(Object other) => identical(this, other) || other is CreateReportResultInput &&
    other.id == id;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode);

  @override
  String toString() => 'CreateReportResultInput[id=$id]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
    return json;
  }

  /// Returns a new [CreateReportResultInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreateReportResultInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "CreateReportResultInput[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "CreateReportResultInput[id]" has a null value in JSON.');
        return true;
      }());

      return CreateReportResultInput(
        id: mapValueOfType<String>(json, r'id')!,
      );
    }
    return null;
  }

  static List<CreateReportResultInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <CreateReportResultInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CreateReportResultInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreateReportResultInput> mapFromJson(dynamic json) {
    final map = <String, CreateReportResultInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreateReportResultInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreateReportResultInput-objects as value to a dart map
  static Map<String, List<CreateReportResultInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<CreateReportResultInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CreateReportResultInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
  };
}

