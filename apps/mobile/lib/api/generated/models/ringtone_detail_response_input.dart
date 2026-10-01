//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RingtoneDetailResponseInput {
  /// Returns a new [RingtoneDetailResponseInput] instance.
  RingtoneDetailResponseInput({
    required this.success,
    required this.message,
    required this.data,
  });

  bool success;

  String message;

  RingtoneDetailInput data;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RingtoneDetailResponseInput &&
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
  String toString() => 'RingtoneDetailResponseInput[success=$success, message=$message, data=$data]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'success'] = this.success;
      json[r'message'] = this.message;
      json[r'data'] = this.data;
    return json;
  }

  /// Returns a new [RingtoneDetailResponseInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RingtoneDetailResponseInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'success'), 'Required key "RingtoneDetailResponseInput[success]" is missing from JSON.');
        assert(json[r'success'] != null, 'Required key "RingtoneDetailResponseInput[success]" has a null value in JSON.');
        assert(json.containsKey(r'message'), 'Required key "RingtoneDetailResponseInput[message]" is missing from JSON.');
        assert(json[r'message'] != null, 'Required key "RingtoneDetailResponseInput[message]" has a null value in JSON.');
        assert(json.containsKey(r'data'), 'Required key "RingtoneDetailResponseInput[data]" is missing from JSON.');
        assert(json[r'data'] != null, 'Required key "RingtoneDetailResponseInput[data]" has a null value in JSON.');
        return true;
      }());

      return RingtoneDetailResponseInput(
        success: mapValueOfType<bool>(json, r'success')!,
        message: mapValueOfType<String>(json, r'message')!,
        data: RingtoneDetailInput.fromJson(json[r'data'])!,
      );
    }
    return null;
  }

  static List<RingtoneDetailResponseInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RingtoneDetailResponseInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RingtoneDetailResponseInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RingtoneDetailResponseInput> mapFromJson(dynamic json) {
    final map = <String, RingtoneDetailResponseInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RingtoneDetailResponseInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RingtoneDetailResponseInput-objects as value to a dart map
  static Map<String, List<RingtoneDetailResponseInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RingtoneDetailResponseInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RingtoneDetailResponseInput.listFromJson(entry.value, growable: growable,);
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

