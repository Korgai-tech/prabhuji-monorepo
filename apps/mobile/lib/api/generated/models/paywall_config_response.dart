//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PaywallConfigResponse {
  /// Returns a new [PaywallConfigResponse] instance.
  PaywallConfigResponse({
    required this.success,
    required this.message,
    required this.data,
  });

  bool success;

  String message;

  PaywallConfigData data;

  @override
  bool operator ==(Object other) => identical(this, other) || other is PaywallConfigResponse &&
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
  String toString() => 'PaywallConfigResponse[success=$success, message=$message, data=$data]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'success'] = this.success;
      json[r'message'] = this.message;
      json[r'data'] = this.data;
    return json;
  }

  /// Returns a new [PaywallConfigResponse] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PaywallConfigResponse? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'success'), 'Required key "PaywallConfigResponse[success]" is missing from JSON.');
        assert(json[r'success'] != null, 'Required key "PaywallConfigResponse[success]" has a null value in JSON.');
        assert(json.containsKey(r'message'), 'Required key "PaywallConfigResponse[message]" is missing from JSON.');
        assert(json[r'message'] != null, 'Required key "PaywallConfigResponse[message]" has a null value in JSON.');
        assert(json.containsKey(r'data'), 'Required key "PaywallConfigResponse[data]" is missing from JSON.');
        assert(json[r'data'] != null, 'Required key "PaywallConfigResponse[data]" has a null value in JSON.');
        return true;
      }());

      return PaywallConfigResponse(
        success: mapValueOfType<bool>(json, r'success')!,
        message: mapValueOfType<String>(json, r'message')!,
        data: PaywallConfigData.fromJson(json[r'data'])!,
      );
    }
    return null;
  }

  static List<PaywallConfigResponse> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <PaywallConfigResponse>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PaywallConfigResponse.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PaywallConfigResponse> mapFromJson(dynamic json) {
    final map = <String, PaywallConfigResponse>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PaywallConfigResponse.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PaywallConfigResponse-objects as value to a dart map
  static Map<String, List<PaywallConfigResponse>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<PaywallConfigResponse>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PaywallConfigResponse.listFromJson(entry.value, growable: growable,);
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

