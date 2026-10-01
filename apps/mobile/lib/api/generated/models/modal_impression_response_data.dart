//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ModalImpressionResponseData {
  /// Returns a new [ModalImpressionResponseData] instance.
  ModalImpressionResponseData({
    required this.counted,
  });

  bool counted;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ModalImpressionResponseData &&
    other.counted == counted;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (counted.hashCode);

  @override
  String toString() => 'ModalImpressionResponseData[counted=$counted]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'counted'] = this.counted;
    return json;
  }

  /// Returns a new [ModalImpressionResponseData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ModalImpressionResponseData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'counted'), 'Required key "ModalImpressionResponseData[counted]" is missing from JSON.');
        assert(json[r'counted'] != null, 'Required key "ModalImpressionResponseData[counted]" has a null value in JSON.');
        return true;
      }());

      return ModalImpressionResponseData(
        counted: mapValueOfType<bool>(json, r'counted')!,
      );
    }
    return null;
  }

  static List<ModalImpressionResponseData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ModalImpressionResponseData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ModalImpressionResponseData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ModalImpressionResponseData> mapFromJson(dynamic json) {
    final map = <String, ModalImpressionResponseData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ModalImpressionResponseData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ModalImpressionResponseData-objects as value to a dart map
  static Map<String, List<ModalImpressionResponseData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ModalImpressionResponseData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ModalImpressionResponseData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'counted',
  };
}

