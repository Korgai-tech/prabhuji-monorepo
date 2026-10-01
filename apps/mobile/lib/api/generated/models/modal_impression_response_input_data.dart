//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ModalImpressionResponseInputData {
  /// Returns a new [ModalImpressionResponseInputData] instance.
  ModalImpressionResponseInputData({
    required this.counted,
  });

  bool counted;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ModalImpressionResponseInputData &&
    other.counted == counted;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (counted.hashCode);

  @override
  String toString() => 'ModalImpressionResponseInputData[counted=$counted]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'counted'] = this.counted;
    return json;
  }

  /// Returns a new [ModalImpressionResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ModalImpressionResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'counted'), 'Required key "ModalImpressionResponseInputData[counted]" is missing from JSON.');
        assert(json[r'counted'] != null, 'Required key "ModalImpressionResponseInputData[counted]" has a null value in JSON.');
        return true;
      }());

      return ModalImpressionResponseInputData(
        counted: mapValueOfType<bool>(json, r'counted')!,
      );
    }
    return null;
  }

  static List<ModalImpressionResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ModalImpressionResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ModalImpressionResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ModalImpressionResponseInputData> mapFromJson(dynamic json) {
    final map = <String, ModalImpressionResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ModalImpressionResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ModalImpressionResponseInputData-objects as value to a dart map
  static Map<String, List<ModalImpressionResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ModalImpressionResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ModalImpressionResponseInputData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'counted',
  };
}

