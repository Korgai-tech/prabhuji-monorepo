//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreateMandateBodyInput {
  /// Returns a new [CreateMandateBodyInput] instance.
  CreateMandateBodyInput({
    required this.planId,
  });

  String planId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is CreateMandateBodyInput &&
    other.planId == planId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (planId.hashCode);

  @override
  String toString() => 'CreateMandateBodyInput[planId=$planId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'planId'] = this.planId;
    return json;
  }

  /// Returns a new [CreateMandateBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreateMandateBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'planId'), 'Required key "CreateMandateBodyInput[planId]" is missing from JSON.');
        assert(json[r'planId'] != null, 'Required key "CreateMandateBodyInput[planId]" has a null value in JSON.');
        return true;
      }());

      return CreateMandateBodyInput(
        planId: mapValueOfType<String>(json, r'planId')!,
      );
    }
    return null;
  }

  static List<CreateMandateBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <CreateMandateBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CreateMandateBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreateMandateBodyInput> mapFromJson(dynamic json) {
    final map = <String, CreateMandateBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreateMandateBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreateMandateBodyInput-objects as value to a dart map
  static Map<String, List<CreateMandateBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<CreateMandateBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CreateMandateBodyInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'planId',
  };
}

