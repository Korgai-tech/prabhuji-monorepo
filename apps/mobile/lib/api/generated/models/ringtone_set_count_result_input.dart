//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RingtoneSetCountResultInput {
  /// Returns a new [RingtoneSetCountResultInput] instance.
  RingtoneSetCountResultInput({
    required this.ringtoneId,
    required this.setCount,
  });

  String ringtoneId;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int setCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RingtoneSetCountResultInput &&
    other.ringtoneId == ringtoneId &&
    other.setCount == setCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (ringtoneId.hashCode) +
    (setCount.hashCode);

  @override
  String toString() => 'RingtoneSetCountResultInput[ringtoneId=$ringtoneId, setCount=$setCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'ringtoneId'] = this.ringtoneId;
      json[r'setCount'] = this.setCount;
    return json;
  }

  /// Returns a new [RingtoneSetCountResultInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RingtoneSetCountResultInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'ringtoneId'), 'Required key "RingtoneSetCountResultInput[ringtoneId]" is missing from JSON.');
        assert(json[r'ringtoneId'] != null, 'Required key "RingtoneSetCountResultInput[ringtoneId]" has a null value in JSON.');
        assert(json.containsKey(r'setCount'), 'Required key "RingtoneSetCountResultInput[setCount]" is missing from JSON.');
        assert(json[r'setCount'] != null, 'Required key "RingtoneSetCountResultInput[setCount]" has a null value in JSON.');
        return true;
      }());

      return RingtoneSetCountResultInput(
        ringtoneId: mapValueOfType<String>(json, r'ringtoneId')!,
        setCount: mapValueOfType<int>(json, r'setCount')!,
      );
    }
    return null;
  }

  static List<RingtoneSetCountResultInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RingtoneSetCountResultInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RingtoneSetCountResultInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RingtoneSetCountResultInput> mapFromJson(dynamic json) {
    final map = <String, RingtoneSetCountResultInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RingtoneSetCountResultInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RingtoneSetCountResultInput-objects as value to a dart map
  static Map<String, List<RingtoneSetCountResultInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RingtoneSetCountResultInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RingtoneSetCountResultInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'ringtoneId',
    'setCount',
  };
}

