//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreateReportBody {
  /// Returns a new [CreateReportBody] instance.
  CreateReportBody({
    required this.type,
    required this.statusId,
    required this.reporterEmail,
    required this.reason,
  });

  ReportType type;

  String statusId;

  String reporterEmail;

  String reason;

  @override
  bool operator ==(Object other) => identical(this, other) || other is CreateReportBody &&
    other.type == type &&
    other.statusId == statusId &&
    other.reporterEmail == reporterEmail &&
    other.reason == reason;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (type.hashCode) +
    (statusId.hashCode) +
    (reporterEmail.hashCode) +
    (reason.hashCode);

  @override
  String toString() => 'CreateReportBody[type=$type, statusId=$statusId, reporterEmail=$reporterEmail, reason=$reason]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'type'] = this.type;
      json[r'statusId'] = this.statusId;
      json[r'reporterEmail'] = this.reporterEmail;
      json[r'reason'] = this.reason;
    return json;
  }

  /// Returns a new [CreateReportBody] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreateReportBody? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'type'), 'Required key "CreateReportBody[type]" is missing from JSON.');
        assert(json[r'type'] != null, 'Required key "CreateReportBody[type]" has a null value in JSON.');
        assert(json.containsKey(r'statusId'), 'Required key "CreateReportBody[statusId]" is missing from JSON.');
        assert(json[r'statusId'] != null, 'Required key "CreateReportBody[statusId]" has a null value in JSON.');
        assert(json.containsKey(r'reporterEmail'), 'Required key "CreateReportBody[reporterEmail]" is missing from JSON.');
        assert(json[r'reporterEmail'] != null, 'Required key "CreateReportBody[reporterEmail]" has a null value in JSON.');
        assert(json.containsKey(r'reason'), 'Required key "CreateReportBody[reason]" is missing from JSON.');
        assert(json[r'reason'] != null, 'Required key "CreateReportBody[reason]" has a null value in JSON.');
        return true;
      }());

      return CreateReportBody(
        type: ReportType.fromJson(json[r'type'])!,
        statusId: mapValueOfType<String>(json, r'statusId')!,
        reporterEmail: mapValueOfType<String>(json, r'reporterEmail')!,
        reason: mapValueOfType<String>(json, r'reason')!,
      );
    }
    return null;
  }

  static List<CreateReportBody> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <CreateReportBody>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CreateReportBody.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreateReportBody> mapFromJson(dynamic json) {
    final map = <String, CreateReportBody>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreateReportBody.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreateReportBody-objects as value to a dart map
  static Map<String, List<CreateReportBody>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<CreateReportBody>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CreateReportBody.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'type',
    'statusId',
    'reporterEmail',
    'reason',
  };
}

