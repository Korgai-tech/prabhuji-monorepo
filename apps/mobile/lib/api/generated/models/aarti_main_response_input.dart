//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiMainResponseInput {
  /// Returns a new [AartiMainResponseInput] instance.
  AartiMainResponseInput({
    required this.success,
    required this.message,
    required this.data,
  });

  bool success;

  String message;

  AartiMainResponseInputData data;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiMainResponseInput &&
    other.success == success &&
    other.message == message &&
    other.data == data;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (success.hashCode) +
    (message.hashCode) +
    (data.hashCode);

  @override
  String toString() => 'AartiMainResponseInput[success=$success, message=$message, data=$data]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'success'] = this.success;
      json[r'message'] = this.message;
      json[r'data'] = this.data;
    return json;
  }

  /// Returns a new [AartiMainResponseInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiMainResponseInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'success'), 'Required key "AartiMainResponseInput[success]" is missing from JSON.');
        assert(json[r'success'] != null, 'Required key "AartiMainResponseInput[success]" has a null value in JSON.');
        assert(json.containsKey(r'message'), 'Required key "AartiMainResponseInput[message]" is missing from JSON.');
        assert(json[r'message'] != null, 'Required key "AartiMainResponseInput[message]" has a null value in JSON.');
        assert(json.containsKey(r'data'), 'Required key "AartiMainResponseInput[data]" is missing from JSON.');
        assert(json[r'data'] != null, 'Required key "AartiMainResponseInput[data]" has a null value in JSON.');
        return true;
      }());

      return AartiMainResponseInput(
        success: mapValueOfType<bool>(json, r'success')!,
        message: mapValueOfType<String>(json, r'message')!,
        data: AartiMainResponseInputData.fromJson(json[r'data'])!,
      );
    }
    return null;
  }

  static List<AartiMainResponseInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiMainResponseInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiMainResponseInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiMainResponseInput> mapFromJson(dynamic json) {
    final map = <String, AartiMainResponseInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiMainResponseInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiMainResponseInput-objects as value to a dart map
  static Map<String, List<AartiMainResponseInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiMainResponseInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiMainResponseInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'success',
    'message',
    'data',
  };
}

