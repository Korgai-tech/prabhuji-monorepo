//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PaywallLegalLinksInput {
  /// Returns a new [PaywallLegalLinksInput] instance.
  PaywallLegalLinksInput({
    required this.privacyPolicyUrl,
    required this.termsServiceUrl,
    required this.refundPolicyUrl,
  });

  String privacyPolicyUrl;

  String termsServiceUrl;

  String refundPolicyUrl;

  @override
  bool operator ==(Object other) => identical(this, other) || other is PaywallLegalLinksInput &&
    other.privacyPolicyUrl == privacyPolicyUrl &&
    other.termsServiceUrl == termsServiceUrl &&
    other.refundPolicyUrl == refundPolicyUrl;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (privacyPolicyUrl.hashCode) +
    (termsServiceUrl.hashCode) +
    (refundPolicyUrl.hashCode);

  @override
  String toString() => 'PaywallLegalLinksInput[privacyPolicyUrl=$privacyPolicyUrl, termsServiceUrl=$termsServiceUrl, refundPolicyUrl=$refundPolicyUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'privacyPolicyUrl'] = this.privacyPolicyUrl;
      json[r'termsServiceUrl'] = this.termsServiceUrl;
      json[r'refundPolicyUrl'] = this.refundPolicyUrl;
    return json;
  }

  /// Returns a new [PaywallLegalLinksInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PaywallLegalLinksInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'privacyPolicyUrl'), 'Required key "PaywallLegalLinksInput[privacyPolicyUrl]" is missing from JSON.');
        assert(json[r'privacyPolicyUrl'] != null, 'Required key "PaywallLegalLinksInput[privacyPolicyUrl]" has a null value in JSON.');
        assert(json.containsKey(r'termsServiceUrl'), 'Required key "PaywallLegalLinksInput[termsServiceUrl]" is missing from JSON.');
        assert(json[r'termsServiceUrl'] != null, 'Required key "PaywallLegalLinksInput[termsServiceUrl]" has a null value in JSON.');
        assert(json.containsKey(r'refundPolicyUrl'), 'Required key "PaywallLegalLinksInput[refundPolicyUrl]" is missing from JSON.');
        assert(json[r'refundPolicyUrl'] != null, 'Required key "PaywallLegalLinksInput[refundPolicyUrl]" has a null value in JSON.');
        return true;
      }());

      return PaywallLegalLinksInput(
        privacyPolicyUrl: mapValueOfType<String>(json, r'privacyPolicyUrl')!,
        termsServiceUrl: mapValueOfType<String>(json, r'termsServiceUrl')!,
        refundPolicyUrl: mapValueOfType<String>(json, r'refundPolicyUrl')!,
      );
    }
    return null;
  }

  static List<PaywallLegalLinksInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <PaywallLegalLinksInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PaywallLegalLinksInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PaywallLegalLinksInput> mapFromJson(dynamic json) {
    final map = <String, PaywallLegalLinksInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PaywallLegalLinksInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PaywallLegalLinksInput-objects as value to a dart map
  static Map<String, List<PaywallLegalLinksInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<PaywallLegalLinksInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PaywallLegalLinksInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'privacyPolicyUrl',
    'termsServiceUrl',
    'refundPolicyUrl',
  };
}

