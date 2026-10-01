//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class KuldevtaIdentifyResponseInputDataTemple {
  /// Returns a new [KuldevtaIdentifyResponseInputDataTemple] instance.
  KuldevtaIdentifyResponseInputDataTemple({
    required this.village,
    required this.district,
    required this.state,
  });

  String? village;

  String? district;

  String? state;

  @override
  bool operator ==(Object other) => identical(this, other) || other is KuldevtaIdentifyResponseInputDataTemple &&
    other.village == village &&
    other.district == district &&
    other.state == state;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (village == null ? 0 : village!.hashCode) +
    (district == null ? 0 : district!.hashCode) +
    (state == null ? 0 : state!.hashCode);

  @override
  String toString() => 'KuldevtaIdentifyResponseInputDataTemple[village=$village, district=$district, state=$state]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.village != null) {
      json[r'village'] = this.village;
    } else {
      json[r'village'] = null;
    }
    if (this.district != null) {
      json[r'district'] = this.district;
    } else {
      json[r'district'] = null;
    }
    if (this.state != null) {
      json[r'state'] = this.state;
    } else {
      json[r'state'] = null;
    }
    return json;
  }

  /// Returns a new [KuldevtaIdentifyResponseInputDataTemple] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static KuldevtaIdentifyResponseInputDataTemple? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'village'), 'Required key "KuldevtaIdentifyResponseInputDataTemple[village]" is missing from JSON.');
        assert(json.containsKey(r'district'), 'Required key "KuldevtaIdentifyResponseInputDataTemple[district]" is missing from JSON.');
        assert(json.containsKey(r'state'), 'Required key "KuldevtaIdentifyResponseInputDataTemple[state]" is missing from JSON.');
        return true;
      }());

      return KuldevtaIdentifyResponseInputDataTemple(
        village: mapValueOfType<String>(json, r'village'),
        district: mapValueOfType<String>(json, r'district'),
        state: mapValueOfType<String>(json, r'state'),
      );
    }
    return null;
  }

  static List<KuldevtaIdentifyResponseInputDataTemple> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <KuldevtaIdentifyResponseInputDataTemple>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = KuldevtaIdentifyResponseInputDataTemple.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, KuldevtaIdentifyResponseInputDataTemple> mapFromJson(dynamic json) {
    final map = <String, KuldevtaIdentifyResponseInputDataTemple>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = KuldevtaIdentifyResponseInputDataTemple.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of KuldevtaIdentifyResponseInputDataTemple-objects as value to a dart map
  static Map<String, List<KuldevtaIdentifyResponseInputDataTemple>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<KuldevtaIdentifyResponseInputDataTemple>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = KuldevtaIdentifyResponseInputDataTemple.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'village',
    'district',
    'state',
  };
}

