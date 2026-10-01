//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PaywallLegalLinks {
  /// Returns a new [PaywallLegalLinks] instance.
  PaywallLegalLinks({
    required this.privacyPolicyUrl,
    required this.termsServiceUrl,
    required this.refundPolicyUrl,
  });

  String privacyPolicyUrl;

  String termsServiceUrl;

  String refundPolicyUrl;

  @override
  bool operator ==(Object other) => identical(this, other) || other is PaywallLegalLinks &&
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
  String toString() => 'PaywallLegalLinks[privacyPolicyUrl=$privacyPolicyUrl, termsServiceUrl=$termsServiceUrl, refundPolicyUrl=$refundPolicyUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'privacyPolicyUrl'] = this.privacyPolicyUrl;
      json[r'termsServiceUrl'] = this.termsServiceUrl;
      json[r'refundPolicyUrl'] = this.refundPolicyUrl;
    return json;
  }

  /// Returns a new [PaywallLegalLinks] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PaywallLegalLinks? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'privacyPolicyUrl'), 'Required key "PaywallLegalLinks[privacyPolicyUrl]" is missing from JSON.');
        assert(json[r'privacyPolicyUrl'] != null, 'Required key "PaywallLegalLinks[privacyPolicyUrl]" has a null value in JSON.');
        assert(json.containsKey(r'termsServiceUrl'), 'Required key "PaywallLegalLinks[termsServiceUrl]" is missing from JSON.');
        assert(json[r'termsServiceUrl'] != null, 'Required key "PaywallLegalLinks[termsServiceUrl]" has a null value in JSON.');
        assert(json.containsKey(r'refundPolicyUrl'), 'Required key "PaywallLegalLinks[refundPolicyUrl]" is missing from JSON.');
        assert(json[r'refundPolicyUrl'] != null, 'Required key "PaywallLegalLinks[refundPolicyUrl]" has a null value in JSON.');
        return true;
      }());

      return PaywallLegalLinks(
        privacyPolicyUrl: mapValueOfType<String>(json, r'privacyPolicyUrl')!,
        termsServiceUrl: mapValueOfType<String>(json, r'termsServiceUrl')!,
        refundPolicyUrl: mapValueOfType<String>(json, r'refundPolicyUrl')!,
      );
    }
    return null;
  }

  static List<PaywallLegalLinks> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <PaywallLegalLinks>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PaywallLegalLinks.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PaywallLegalLinks> mapFromJson(dynamic json) {
    final map = <String, PaywallLegalLinks>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PaywallLegalLinks.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PaywallLegalLinks-objects as value to a dart map
  static Map<String, List<PaywallLegalLinks>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<PaywallLegalLinks>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PaywallLegalLinks.listFromJson(entry.value, growable: growable,);
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

