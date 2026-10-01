//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class DecentroCheckoutDataInput {
  /// Returns a new [DecentroCheckoutDataInput] instance.
  DecentroCheckoutDataInput({
    required this.intentUrl,
    required this.decentroMandateId,
    required this.decentroTxnId,
    required this.referenceId,
  });

  String intentUrl;

  String? decentroMandateId;

  String? decentroTxnId;

  String referenceId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is DecentroCheckoutDataInput &&
    other.intentUrl == intentUrl &&
    other.decentroMandateId == decentroMandateId &&
    other.decentroTxnId == decentroTxnId &&
    other.referenceId == referenceId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (intentUrl.hashCode) +
    (decentroMandateId == null ? 0 : decentroMandateId!.hashCode) +
    (decentroTxnId == null ? 0 : decentroTxnId!.hashCode) +
    (referenceId.hashCode);

  @override
  String toString() => 'DecentroCheckoutDataInput[intentUrl=$intentUrl, decentroMandateId=$decentroMandateId, decentroTxnId=$decentroTxnId, referenceId=$referenceId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'intentUrl'] = this.intentUrl;
    if (this.decentroMandateId != null) {
      json[r'decentroMandateId'] = this.decentroMandateId;
    } else {
      json[r'decentroMandateId'] = null;
    }
    if (this.decentroTxnId != null) {
      json[r'decentroTxnId'] = this.decentroTxnId;
    } else {
      json[r'decentroTxnId'] = null;
    }
      json[r'referenceId'] = this.referenceId;
    return json;
  }

  /// Returns a new [DecentroCheckoutDataInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static DecentroCheckoutDataInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'intentUrl'), 'Required key "DecentroCheckoutDataInput[intentUrl]" is missing from JSON.');
        assert(json[r'intentUrl'] != null, 'Required key "DecentroCheckoutDataInput[intentUrl]" has a null value in JSON.');
        assert(json.containsKey(r'decentroMandateId'), 'Required key "DecentroCheckoutDataInput[decentroMandateId]" is missing from JSON.');
        assert(json.containsKey(r'decentroTxnId'), 'Required key "DecentroCheckoutDataInput[decentroTxnId]" is missing from JSON.');
        assert(json.containsKey(r'referenceId'), 'Required key "DecentroCheckoutDataInput[referenceId]" is missing from JSON.');
        assert(json[r'referenceId'] != null, 'Required key "DecentroCheckoutDataInput[referenceId]" has a null value in JSON.');
        return true;
      }());

      return DecentroCheckoutDataInput(
        intentUrl: mapValueOfType<String>(json, r'intentUrl')!,
        decentroMandateId: mapValueOfType<String>(json, r'decentroMandateId'),
        decentroTxnId: mapValueOfType<String>(json, r'decentroTxnId'),
        referenceId: mapValueOfType<String>(json, r'referenceId')!,
      );
    }
    return null;
  }

  static List<DecentroCheckoutDataInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <DecentroCheckoutDataInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = DecentroCheckoutDataInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, DecentroCheckoutDataInput> mapFromJson(dynamic json) {
    final map = <String, DecentroCheckoutDataInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = DecentroCheckoutDataInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of DecentroCheckoutDataInput-objects as value to a dart map
  static Map<String, List<DecentroCheckoutDataInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<DecentroCheckoutDataInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = DecentroCheckoutDataInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'intentUrl',
    'decentroMandateId',
    'decentroTxnId',
    'referenceId',
  };
}

