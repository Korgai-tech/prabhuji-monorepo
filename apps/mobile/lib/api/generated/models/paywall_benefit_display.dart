//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PaywallBenefitDisplay {
  /// Returns a new [PaywallBenefitDisplay] instance.
  PaywallBenefitDisplay({
    required this.benefitId,
    required this.localizedName,
    required this.icon,
    required this.sortOrder,
  });

  String benefitId;

  String localizedName;

  String icon;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  @override
  bool operator ==(Object other) => identical(this, other) || other is PaywallBenefitDisplay &&
    other.benefitId == benefitId &&
    other.localizedName == localizedName &&
    other.icon == icon &&
    other.sortOrder == sortOrder;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (benefitId.hashCode) +
    (localizedName.hashCode) +
    (icon.hashCode) +
    (sortOrder.hashCode);

  @override
  String toString() => 'PaywallBenefitDisplay[benefitId=$benefitId, localizedName=$localizedName, icon=$icon, sortOrder=$sortOrder]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'benefitId'] = this.benefitId;
      json[r'localizedName'] = this.localizedName;
      json[r'icon'] = this.icon;
      json[r'sortOrder'] = this.sortOrder;
    return json;
  }

  /// Returns a new [PaywallBenefitDisplay] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PaywallBenefitDisplay? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'benefitId'), 'Required key "PaywallBenefitDisplay[benefitId]" is missing from JSON.');
        assert(json[r'benefitId'] != null, 'Required key "PaywallBenefitDisplay[benefitId]" has a null value in JSON.');
        assert(json.containsKey(r'localizedName'), 'Required key "PaywallBenefitDisplay[localizedName]" is missing from JSON.');
        assert(json[r'localizedName'] != null, 'Required key "PaywallBenefitDisplay[localizedName]" has a null value in JSON.');
        assert(json.containsKey(r'icon'), 'Required key "PaywallBenefitDisplay[icon]" is missing from JSON.');
        assert(json[r'icon'] != null, 'Required key "PaywallBenefitDisplay[icon]" has a null value in JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "PaywallBenefitDisplay[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "PaywallBenefitDisplay[sortOrder]" has a null value in JSON.');
        return true;
      }());

      return PaywallBenefitDisplay(
        benefitId: mapValueOfType<String>(json, r'benefitId')!,
        localizedName: mapValueOfType<String>(json, r'localizedName')!,
        icon: mapValueOfType<String>(json, r'icon')!,
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
      );
    }
    return null;
  }

  static List<PaywallBenefitDisplay> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <PaywallBenefitDisplay>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PaywallBenefitDisplay.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PaywallBenefitDisplay> mapFromJson(dynamic json) {
    final map = <String, PaywallBenefitDisplay>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PaywallBenefitDisplay.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PaywallBenefitDisplay-objects as value to a dart map
  static Map<String, List<PaywallBenefitDisplay>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<PaywallBenefitDisplay>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PaywallBenefitDisplay.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'benefitId',
    'localizedName',
    'icon',
    'sortOrder',
  };
}

