//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RazorpayCheckoutDataInput {
  /// Returns a new [RazorpayCheckoutDataInput] instance.
  RazorpayCheckoutDataInput({
    required this.keyId,
    required this.orderId,
    required this.customerId,
    required this.recurring,
  });

  String keyId;

  String orderId;

  String customerId;

  String recurring;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RazorpayCheckoutDataInput &&
    other.keyId == keyId &&
    other.orderId == orderId &&
    other.customerId == customerId &&
    other.recurring == recurring;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (keyId.hashCode) +
    (orderId.hashCode) +
    (customerId.hashCode) +
    (recurring.hashCode);

  @override
  String toString() => 'RazorpayCheckoutDataInput[keyId=$keyId, orderId=$orderId, customerId=$customerId, recurring=$recurring]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'keyId'] = this.keyId;
      json[r'orderId'] = this.orderId;
      json[r'customerId'] = this.customerId;
      json[r'recurring'] = this.recurring;
    return json;
  }

  /// Returns a new [RazorpayCheckoutDataInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RazorpayCheckoutDataInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'keyId'), 'Required key "RazorpayCheckoutDataInput[keyId]" is missing from JSON.');
        assert(json[r'keyId'] != null, 'Required key "RazorpayCheckoutDataInput[keyId]" has a null value in JSON.');
        assert(json.containsKey(r'orderId'), 'Required key "RazorpayCheckoutDataInput[orderId]" is missing from JSON.');
        assert(json[r'orderId'] != null, 'Required key "RazorpayCheckoutDataInput[orderId]" has a null value in JSON.');
        assert(json.containsKey(r'customerId'), 'Required key "RazorpayCheckoutDataInput[customerId]" is missing from JSON.');
        assert(json[r'customerId'] != null, 'Required key "RazorpayCheckoutDataInput[customerId]" has a null value in JSON.');
        assert(json.containsKey(r'recurring'), 'Required key "RazorpayCheckoutDataInput[recurring]" is missing from JSON.');
        assert(json[r'recurring'] != null, 'Required key "RazorpayCheckoutDataInput[recurring]" has a null value in JSON.');
        return true;
      }());

      return RazorpayCheckoutDataInput(
        keyId: mapValueOfType<String>(json, r'keyId')!,
        orderId: mapValueOfType<String>(json, r'orderId')!,
        customerId: mapValueOfType<String>(json, r'customerId')!,
        recurring: mapValueOfType<String>(json, r'recurring')!,
      );
    }
    return null;
  }

  static List<RazorpayCheckoutDataInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RazorpayCheckoutDataInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RazorpayCheckoutDataInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RazorpayCheckoutDataInput> mapFromJson(dynamic json) {
    final map = <String, RazorpayCheckoutDataInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RazorpayCheckoutDataInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RazorpayCheckoutDataInput-objects as value to a dart map
  static Map<String, List<RazorpayCheckoutDataInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RazorpayCheckoutDataInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RazorpayCheckoutDataInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'keyId',
    'orderId',
    'customerId',
    'recurring',
  };
}

