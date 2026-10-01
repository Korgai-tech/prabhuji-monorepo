//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PaywallPlanDisplayInput {
  /// Returns a new [PaywallPlanDisplayInput] instance.
  PaywallPlanDisplayInput({
    required this.planId,
    required this.productId,
    required this.period,
    required this.localizedLabel,
    required this.trialLabel,
    required this.trialDays,
    required this.displayPriceText,
    required this.subscriptionDetailText,
    required this.sortOrder,
  });

  String planId;

  String productId;

  String period;

  String localizedLabel;

  String trialLabel;

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  int trialDays;

  String displayPriceText;

  String subscriptionDetailText;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sortOrder;

  @override
  bool operator ==(Object other) => identical(this, other) || other is PaywallPlanDisplayInput &&
    other.planId == planId &&
    other.productId == productId &&
    other.period == period &&
    other.localizedLabel == localizedLabel &&
    other.trialLabel == trialLabel &&
    other.trialDays == trialDays &&
    other.displayPriceText == displayPriceText &&
    other.subscriptionDetailText == subscriptionDetailText &&
    other.sortOrder == sortOrder;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (planId.hashCode) +
    (productId.hashCode) +
    (period.hashCode) +
    (localizedLabel.hashCode) +
    (trialLabel.hashCode) +
    (trialDays.hashCode) +
    (displayPriceText.hashCode) +
    (subscriptionDetailText.hashCode) +
    (sortOrder.hashCode);

  @override
  String toString() => 'PaywallPlanDisplayInput[planId=$planId, productId=$productId, period=$period, localizedLabel=$localizedLabel, trialLabel=$trialLabel, trialDays=$trialDays, displayPriceText=$displayPriceText, subscriptionDetailText=$subscriptionDetailText, sortOrder=$sortOrder]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'planId'] = this.planId;
      json[r'productId'] = this.productId;
      json[r'period'] = this.period;
      json[r'localizedLabel'] = this.localizedLabel;
      json[r'trialLabel'] = this.trialLabel;
      json[r'trialDays'] = this.trialDays;
      json[r'displayPriceText'] = this.displayPriceText;
      json[r'subscriptionDetailText'] = this.subscriptionDetailText;
      json[r'sortOrder'] = this.sortOrder;
    return json;
  }

  /// Returns a new [PaywallPlanDisplayInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PaywallPlanDisplayInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'planId'), 'Required key "PaywallPlanDisplayInput[planId]" is missing from JSON.');
        assert(json[r'planId'] != null, 'Required key "PaywallPlanDisplayInput[planId]" has a null value in JSON.');
        assert(json.containsKey(r'productId'), 'Required key "PaywallPlanDisplayInput[productId]" is missing from JSON.');
        assert(json[r'productId'] != null, 'Required key "PaywallPlanDisplayInput[productId]" has a null value in JSON.');
        assert(json.containsKey(r'period'), 'Required key "PaywallPlanDisplayInput[period]" is missing from JSON.');
        assert(json[r'period'] != null, 'Required key "PaywallPlanDisplayInput[period]" has a null value in JSON.');
        assert(json.containsKey(r'localizedLabel'), 'Required key "PaywallPlanDisplayInput[localizedLabel]" is missing from JSON.');
        assert(json[r'localizedLabel'] != null, 'Required key "PaywallPlanDisplayInput[localizedLabel]" has a null value in JSON.');
        assert(json.containsKey(r'trialLabel'), 'Required key "PaywallPlanDisplayInput[trialLabel]" is missing from JSON.');
        assert(json[r'trialLabel'] != null, 'Required key "PaywallPlanDisplayInput[trialLabel]" has a null value in JSON.');
        assert(json.containsKey(r'trialDays'), 'Required key "PaywallPlanDisplayInput[trialDays]" is missing from JSON.');
        assert(json[r'trialDays'] != null, 'Required key "PaywallPlanDisplayInput[trialDays]" has a null value in JSON.');
        assert(json.containsKey(r'displayPriceText'), 'Required key "PaywallPlanDisplayInput[displayPriceText]" is missing from JSON.');
        assert(json[r'displayPriceText'] != null, 'Required key "PaywallPlanDisplayInput[displayPriceText]" has a null value in JSON.');
        assert(json.containsKey(r'subscriptionDetailText'), 'Required key "PaywallPlanDisplayInput[subscriptionDetailText]" is missing from JSON.');
        assert(json[r'subscriptionDetailText'] != null, 'Required key "PaywallPlanDisplayInput[subscriptionDetailText]" has a null value in JSON.');
        assert(json.containsKey(r'sortOrder'), 'Required key "PaywallPlanDisplayInput[sortOrder]" is missing from JSON.');
        assert(json[r'sortOrder'] != null, 'Required key "PaywallPlanDisplayInput[sortOrder]" has a null value in JSON.');
        return true;
      }());

      return PaywallPlanDisplayInput(
        planId: mapValueOfType<String>(json, r'planId')!,
        productId: mapValueOfType<String>(json, r'productId')!,
        period: mapValueOfType<String>(json, r'period')!,
        localizedLabel: mapValueOfType<String>(json, r'localizedLabel')!,
        trialLabel: mapValueOfType<String>(json, r'trialLabel')!,
        trialDays: mapValueOfType<int>(json, r'trialDays')!,
        displayPriceText: mapValueOfType<String>(json, r'displayPriceText')!,
        subscriptionDetailText: mapValueOfType<String>(json, r'subscriptionDetailText')!,
        sortOrder: mapValueOfType<int>(json, r'sortOrder')!,
      );
    }
    return null;
  }

  static List<PaywallPlanDisplayInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <PaywallPlanDisplayInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PaywallPlanDisplayInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PaywallPlanDisplayInput> mapFromJson(dynamic json) {
    final map = <String, PaywallPlanDisplayInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PaywallPlanDisplayInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PaywallPlanDisplayInput-objects as value to a dart map
  static Map<String, List<PaywallPlanDisplayInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<PaywallPlanDisplayInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PaywallPlanDisplayInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'planId',
    'productId',
    'period',
    'localizedLabel',
    'trialLabel',
    'trialDays',
    'displayPriceText',
    'subscriptionDetailText',
    'sortOrder',
  };
}

