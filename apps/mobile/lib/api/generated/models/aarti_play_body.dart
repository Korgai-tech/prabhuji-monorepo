//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AartiPlayBody {
  /// Returns a new [AartiPlayBody] instance.
  AartiPlayBody({
    this.lastPositionSeconds,
  });

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? lastPositionSeconds;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AartiPlayBody &&
    other.lastPositionSeconds == lastPositionSeconds;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (lastPositionSeconds == null ? 0 : lastPositionSeconds!.hashCode);

  @override
  String toString() => 'AartiPlayBody[lastPositionSeconds=$lastPositionSeconds]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.lastPositionSeconds != null) {
      json[r'lastPositionSeconds'] = this.lastPositionSeconds;
    } else {
      json[r'lastPositionSeconds'] = null;
    }
    return json;
  }

  /// Returns a new [AartiPlayBody] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AartiPlayBody? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        return true;
      }());

      return AartiPlayBody(
        lastPositionSeconds: mapValueOfType<int>(json, r'lastPositionSeconds'),
      );
    }
    return null;
  }

  static List<AartiPlayBody> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AartiPlayBody>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AartiPlayBody.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AartiPlayBody> mapFromJson(dynamic json) {
    final map = <String, AartiPlayBody>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AartiPlayBody.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AartiPlayBody-objects as value to a dart map
  static Map<String, List<AartiPlayBody>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AartiPlayBody>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AartiPlayBody.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

