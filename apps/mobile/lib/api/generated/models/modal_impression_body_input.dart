//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ModalImpressionBodyInput {
  /// Returns a new [ModalImpressionBodyInput] instance.
  ModalImpressionBodyInput({
    required this.modalKey,
    required this.triggerSource,
    required this.action,
    this.dismissMethod,
    required this.showNumber,
  });

  String modalKey;

  String triggerSource;

  ModalImpressionBodyInputActionEnum action;

  ModalImpressionBodyInputDismissMethodEnum? dismissMethod;

  /// Minimum value: 0
  /// Maximum value: 10000
  int showNumber;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ModalImpressionBodyInput &&
    other.modalKey == modalKey &&
    other.triggerSource == triggerSource &&
    other.action == action &&
    other.dismissMethod == dismissMethod &&
    other.showNumber == showNumber;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (modalKey.hashCode) +
    (triggerSource.hashCode) +
    (action.hashCode) +
    (dismissMethod == null ? 0 : dismissMethod!.hashCode) +
    (showNumber.hashCode);

  @override
  String toString() => 'ModalImpressionBodyInput[modalKey=$modalKey, triggerSource=$triggerSource, action=$action, dismissMethod=$dismissMethod, showNumber=$showNumber]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'modalKey'] = this.modalKey;
      json[r'triggerSource'] = this.triggerSource;
      json[r'action'] = this.action;
    if (this.dismissMethod != null) {
      json[r'dismissMethod'] = this.dismissMethod;
    } else {
      json[r'dismissMethod'] = null;
    }
      json[r'showNumber'] = this.showNumber;
    return json;
  }

  /// Returns a new [ModalImpressionBodyInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ModalImpressionBodyInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'modalKey'), 'Required key "ModalImpressionBodyInput[modalKey]" is missing from JSON.');
        assert(json[r'modalKey'] != null, 'Required key "ModalImpressionBodyInput[modalKey]" has a null value in JSON.');
        assert(json.containsKey(r'triggerSource'), 'Required key "ModalImpressionBodyInput[triggerSource]" is missing from JSON.');
        assert(json[r'triggerSource'] != null, 'Required key "ModalImpressionBodyInput[triggerSource]" has a null value in JSON.');
        assert(json.containsKey(r'action'), 'Required key "ModalImpressionBodyInput[action]" is missing from JSON.');
        assert(json[r'action'] != null, 'Required key "ModalImpressionBodyInput[action]" has a null value in JSON.');
        assert(json.containsKey(r'showNumber'), 'Required key "ModalImpressionBodyInput[showNumber]" is missing from JSON.');
        assert(json[r'showNumber'] != null, 'Required key "ModalImpressionBodyInput[showNumber]" has a null value in JSON.');
        return true;
      }());

      return ModalImpressionBodyInput(
        modalKey: mapValueOfType<String>(json, r'modalKey')!,
        triggerSource: mapValueOfType<String>(json, r'triggerSource')!,
        action: ModalImpressionBodyInputActionEnum.fromJson(json[r'action'])!,
        dismissMethod: ModalImpressionBodyInputDismissMethodEnum.fromJson(json[r'dismissMethod']),
        showNumber: mapValueOfType<int>(json, r'showNumber')!,
      );
    }
    return null;
  }

  static List<ModalImpressionBodyInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ModalImpressionBodyInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ModalImpressionBodyInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ModalImpressionBodyInput> mapFromJson(dynamic json) {
    final map = <String, ModalImpressionBodyInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ModalImpressionBodyInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ModalImpressionBodyInput-objects as value to a dart map
  static Map<String, List<ModalImpressionBodyInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ModalImpressionBodyInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ModalImpressionBodyInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'modalKey',
    'triggerSource',
    'action',
    'showNumber',
  };
}


class ModalImpressionBodyInputActionEnum {
  /// Instantiate a new enum with the provided [value].
  const ModalImpressionBodyInputActionEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const viewed = ModalImpressionBodyInputActionEnum._(r'viewed');
  static const ctaClicked = ModalImpressionBodyInputActionEnum._(r'cta_clicked');
  static const dismissed = ModalImpressionBodyInputActionEnum._(r'dismissed');

  /// List of all possible values in this [enum][ModalImpressionBodyInputActionEnum].
  static const values = <ModalImpressionBodyInputActionEnum>[
    viewed,
    ctaClicked,
    dismissed,
  ];

  static ModalImpressionBodyInputActionEnum? fromJson(dynamic value) => ModalImpressionBodyInputActionEnumTypeTransformer().decode(value);

  static List<ModalImpressionBodyInputActionEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ModalImpressionBodyInputActionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ModalImpressionBodyInputActionEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ModalImpressionBodyInputActionEnum] to String,
/// and [decode] dynamic data back to [ModalImpressionBodyInputActionEnum].
class ModalImpressionBodyInputActionEnumTypeTransformer {
  factory ModalImpressionBodyInputActionEnumTypeTransformer() => _instance ??= const ModalImpressionBodyInputActionEnumTypeTransformer._();

  const ModalImpressionBodyInputActionEnumTypeTransformer._();

  String encode(ModalImpressionBodyInputActionEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a ModalImpressionBodyInputActionEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ModalImpressionBodyInputActionEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'viewed': return ModalImpressionBodyInputActionEnum.viewed;
        case r'cta_clicked': return ModalImpressionBodyInputActionEnum.ctaClicked;
        case r'dismissed': return ModalImpressionBodyInputActionEnum.dismissed;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [ModalImpressionBodyInputActionEnumTypeTransformer] instance.
  static ModalImpressionBodyInputActionEnumTypeTransformer? _instance;
}



class ModalImpressionBodyInputDismissMethodEnum {
  /// Instantiate a new enum with the provided [value].
  const ModalImpressionBodyInputDismissMethodEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const cross = ModalImpressionBodyInputDismissMethodEnum._(r'cross');
  static const back = ModalImpressionBodyInputDismissMethodEnum._(r'back');
  static const outsideTap = ModalImpressionBodyInputDismissMethodEnum._(r'outside_tap');

  /// List of all possible values in this [enum][ModalImpressionBodyInputDismissMethodEnum].
  static const values = <ModalImpressionBodyInputDismissMethodEnum>[
    cross,
    back,
    outsideTap,
  ];

  static ModalImpressionBodyInputDismissMethodEnum? fromJson(dynamic value) => ModalImpressionBodyInputDismissMethodEnumTypeTransformer().decode(value);

  static List<ModalImpressionBodyInputDismissMethodEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ModalImpressionBodyInputDismissMethodEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ModalImpressionBodyInputDismissMethodEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ModalImpressionBodyInputDismissMethodEnum] to String,
/// and [decode] dynamic data back to [ModalImpressionBodyInputDismissMethodEnum].
class ModalImpressionBodyInputDismissMethodEnumTypeTransformer {
  factory ModalImpressionBodyInputDismissMethodEnumTypeTransformer() => _instance ??= const ModalImpressionBodyInputDismissMethodEnumTypeTransformer._();

  const ModalImpressionBodyInputDismissMethodEnumTypeTransformer._();

  String encode(ModalImpressionBodyInputDismissMethodEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a ModalImpressionBodyInputDismissMethodEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ModalImpressionBodyInputDismissMethodEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'cross': return ModalImpressionBodyInputDismissMethodEnum.cross;
        case r'back': return ModalImpressionBodyInputDismissMethodEnum.back;
        case r'outside_tap': return ModalImpressionBodyInputDismissMethodEnum.outsideTap;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [ModalImpressionBodyInputDismissMethodEnumTypeTransformer] instance.
  static ModalImpressionBodyInputDismissMethodEnumTypeTransformer? _instance;
}


