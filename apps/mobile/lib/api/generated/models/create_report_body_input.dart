//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreateReportBodyInput {
  /// Returns a new [CreateReportBodyInput] instance.
  CreateReportBodyInput({
    required this.type,
    required this.statusId,
    required this.reporterEmail,
    required this.reason,
  });

  ReportTypeInput type;

  String statusId;

  String reporterEmail;

  String reason;

  @override
  bool operator ==(Object other) => identical(this, other) || other is CreateReportBodyInput &&
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
  String toString() => 'CreateReportBodyInput[type=$type, statusId=$statusId, reporterEmail=$reporterEmail, reason=$reason]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'type'] = this.type;
      json[r'statusId'] = this.statusId;
      json[r'reporterEmail'] = this.reporterEmail;
      json[r'reason'] = this.reason;
    return json;
  }

  /// Returns a new [CreateReportBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreateReportBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'type'), 'Required key "CreateReportBodyInput[type]" is missing from JSON.');
        assert(json[r'type'] != null, 'Required key "CreateReportBodyInput[type]" has a null value in JSON.');
        assert(json.containsKey(r'statusId'), 'Required key "CreateReportBodyInput[statusId]" is missing from JSON.');
        assert(json[r'statusId'] != null, 'Required key "CreateReportBodyInput[statusId]" has a null value in JSON.');
        assert(json.containsKey(r'reporterEmail'), 'Required key "CreateReportBodyInput[reporterEmail]" is missing from JSON.');
        assert(json[r'reporterEmail'] != null, 'Required key "CreateReportBodyInput[reporterEmail]" has a null value in JSON.');
        assert(json.containsKey(r'reason'), 'Required key "CreateReportBodyInput[reason]" is missing from JSON.');
        assert(json[r'reason'] != null, 'Required key "CreateReportBodyInput[reason]" has a null value in JSON.');
        return true;
      }());

      return CreateReportBodyInput(
        type: ReportTypeInput.fromJson(json[r'type'])!,
        statusId: mapValueOfType<String>(json, r'statusId')!,
        reporterEmail: mapValueOfType<String>(json, r'reporterEmail')!,
        reason: mapValueOfType<String>(json, r'reason')!,
      );
    }
    return null;
  }

  static List<CreateReportBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <CreateReportBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CreateReportBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreateReportBodyInput> mapFromJson(dynamic json) {
    final map = <String, CreateReportBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreateReportBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreateReportBodyInput-objects as value to a dart map
  static Map<String, List<CreateReportBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<CreateReportBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CreateReportBodyInput.listFromJson(entry.value, growable: growable,);
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

