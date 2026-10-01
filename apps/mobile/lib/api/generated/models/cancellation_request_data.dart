//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CancellationRequestData {
  /// Returns a new [CancellationRequestData] instance.
  CancellationRequestData({
    required this.id,
    required this.status,
    required this.reason,
    required this.requestedAt,
    required this.processedAt,
  });

  String id;

  CancellationRequestStatusEnum status;

  String? reason;

  DateTime requestedAt;

  DateTime? processedAt;

  @override
  bool operator ==(Object other) => identical(this, other) || other is CancellationRequestData &&
    other.id == id &&
    other.status == status &&
    other.reason == reason &&
    other.requestedAt == requestedAt &&
    other.processedAt == processedAt;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (status.hashCode) +
    (reason == null ? 0 : reason!.hashCode) +
    (requestedAt.hashCode) +
    (processedAt == null ? 0 : processedAt!.hashCode);

  @override
  String toString() => 'CancellationRequestData[id=$id, status=$status, reason=$reason, requestedAt=$requestedAt, processedAt=$processedAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'status'] = this.status;
    if (this.reason != null) {
      json[r'reason'] = this.reason;
    } else {
      json[r'reason'] = null;
    }
      json[r'requestedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.requestedAt.millisecondsSinceEpoch
        : this.requestedAt.toUtc().toIso8601String();
    if (this.processedAt != null) {
      json[r'processedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.processedAt!.millisecondsSinceEpoch
        : this.processedAt!.toUtc().toIso8601String();
    } else {
      json[r'processedAt'] = null;
    }
    return json;
  }

  /// Returns a new [CancellationRequestData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CancellationRequestData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "CancellationRequestData[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "CancellationRequestData[id]" has a null value in JSON.');
        assert(json.containsKey(r'status'), 'Required key "CancellationRequestData[status]" is missing from JSON.');
        assert(json[r'status'] != null, 'Required key "CancellationRequestData[status]" has a null value in JSON.');
        assert(json.containsKey(r'reason'), 'Required key "CancellationRequestData[reason]" is missing from JSON.');
        assert(json.containsKey(r'requestedAt'), 'Required key "CancellationRequestData[requestedAt]" is missing from JSON.');
        assert(json[r'requestedAt'] != null, 'Required key "CancellationRequestData[requestedAt]" has a null value in JSON.');
        assert(json.containsKey(r'processedAt'), 'Required key "CancellationRequestData[processedAt]" is missing from JSON.');
        return true;
      }());

      return CancellationRequestData(
        id: mapValueOfType<String>(json, r'id')!,
        status: CancellationRequestStatusEnum.fromJson(json[r'status'])!,
        reason: mapValueOfType<String>(json, r'reason'),
        requestedAt: mapDateTime(json, r'requestedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')!,
        processedAt: mapDateTime(json, r'processedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
      );
    }
    return null;
  }

  static List<CancellationRequestData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <CancellationRequestData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CancellationRequestData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CancellationRequestData> mapFromJson(dynamic json) {
    final map = <String, CancellationRequestData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CancellationRequestData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CancellationRequestData-objects as value to a dart map
  static Map<String, List<CancellationRequestData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<CancellationRequestData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CancellationRequestData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'status',
    'reason',
    'requestedAt',
    'processedAt',
  };
}

