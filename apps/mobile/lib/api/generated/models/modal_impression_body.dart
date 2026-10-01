//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ModalImpressionBody {
  /// Returns a new [ModalImpressionBody] instance.
  ModalImpressionBody({
    required this.modalKey,
    required this.triggerSource,
    required this.action,
    this.dismissMethod,
    required this.showNumber,
  });

  String modalKey;

  String triggerSource;

  ModalImpressionBodyActionEnum action;

  ModalImpressionBodyDismissMethodEnum? dismissMethod;

  /// Minimum value: 0
  /// Maximum value: 10000
  int showNumber;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ModalImpressionBody &&
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
  String toString() => 'ModalImpressionBody[modalKey=$modalKey, triggerSource=$triggerSource, action=$action, dismissMethod=$dismissMethod, showNumber=$showNumber]';

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

  /// Returns a new [ModalImpressionBody] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ModalImpressionBody? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'modalKey'), 'Required key "ModalImpressionBody[modalKey]" is missing from JSON.');
        assert(json[r'modalKey'] != null, 'Required key "ModalImpressionBody[modalKey]" has a null value in JSON.');
        assert(json.containsKey(r'triggerSource'), 'Required key "ModalImpressionBody[triggerSource]" is missing from JSON.');
        assert(json[r'triggerSource'] != null, 'Required key "ModalImpressionBody[triggerSource]" has a null value in JSON.');
        assert(json.containsKey(r'action'), 'Required key "ModalImpressionBody[action]" is missing from JSON.');
        assert(json[r'action'] != null, 'Required key "ModalImpressionBody[action]" has a null value in JSON.');
        assert(json.containsKey(r'showNumber'), 'Required key "ModalImpressionBody[showNumber]" is missing from JSON.');
        assert(json[r'showNumber'] != null, 'Required key "ModalImpressionBody[showNumber]" has a null value in JSON.');
        return true;
      }());

      return ModalImpressionBody(
        modalKey: mapValueOfType<String>(json, r'modalKey')!,
        triggerSource: mapValueOfType<String>(json, r'triggerSource')!,
        action: ModalImpressionBodyActionEnum.fromJson(json[r'action'])!,
        dismissMethod: ModalImpressionBodyDismissMethodEnum.fromJson(json[r'dismissMethod']),
        showNumber: mapValueOfType<int>(json, r'showNumber')!,
      );
    }
    return null;
  }

  static List<ModalImpressionBody> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ModalImpressionBody>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ModalImpressionBody.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ModalImpressionBody> mapFromJson(dynamic json) {
    final map = <String, ModalImpressionBody>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ModalImpressionBody.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ModalImpressionBody-objects as value to a dart map
  static Map<String, List<ModalImpressionBody>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ModalImpressionBody>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ModalImpressionBody.listFromJson(entry.value, growable: growable,);
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


class ModalImpressionBodyActionEnum {
  /// Instantiate a new enum with the provided [value].
  const ModalImpressionBodyActionEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const viewed = ModalImpressionBodyActionEnum._(r'viewed');
  static const ctaClicked = ModalImpressionBodyActionEnum._(r'cta_clicked');
  static const dismissed = ModalImpressionBodyActionEnum._(r'dismissed');

  /// List of all possible values in this [enum][ModalImpressionBodyActionEnum].
  static const values = <ModalImpressionBodyActionEnum>[
    viewed,
    ctaClicked,
    dismissed,
  ];

  static ModalImpressionBodyActionEnum? fromJson(dynamic value) => ModalImpressionBodyActionEnumTypeTransformer().decode(value);

  static List<ModalImpressionBodyActionEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ModalImpressionBodyActionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ModalImpressionBodyActionEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ModalImpressionBodyActionEnum] to String,
/// and [decode] dynamic data back to [ModalImpressionBodyActionEnum].
class ModalImpressionBodyActionEnumTypeTransformer {
  factory ModalImpressionBodyActionEnumTypeTransformer() => _instance ??= const ModalImpressionBodyActionEnumTypeTransformer._();

  const ModalImpressionBodyActionEnumTypeTransformer._();

  String encode(ModalImpressionBodyActionEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a ModalImpressionBodyActionEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ModalImpressionBodyActionEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'viewed': return ModalImpressionBodyActionEnum.viewed;
        case r'cta_clicked': return ModalImpressionBodyActionEnum.ctaClicked;
        case r'dismissed': return ModalImpressionBodyActionEnum.dismissed;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [ModalImpressionBodyActionEnumTypeTransformer] instance.
  static ModalImpressionBodyActionEnumTypeTransformer? _instance;
}



class ModalImpressionBodyDismissMethodEnum {
  /// Instantiate a new enum with the provided [value].
  const ModalImpressionBodyDismissMethodEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const cross = ModalImpressionBodyDismissMethodEnum._(r'cross');
  static const back = ModalImpressionBodyDismissMethodEnum._(r'back');
  static const outsideTap = ModalImpressionBodyDismissMethodEnum._(r'outside_tap');

  /// List of all possible values in this [enum][ModalImpressionBodyDismissMethodEnum].
  static const values = <ModalImpressionBodyDismissMethodEnum>[
    cross,
    back,
    outsideTap,
  ];

  static ModalImpressionBodyDismissMethodEnum? fromJson(dynamic value) => ModalImpressionBodyDismissMethodEnumTypeTransformer().decode(value);

  static List<ModalImpressionBodyDismissMethodEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ModalImpressionBodyDismissMethodEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ModalImpressionBodyDismissMethodEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ModalImpressionBodyDismissMethodEnum] to String,
/// and [decode] dynamic data back to [ModalImpressionBodyDismissMethodEnum].
class ModalImpressionBodyDismissMethodEnumTypeTransformer {
  factory ModalImpressionBodyDismissMethodEnumTypeTransformer() => _instance ??= const ModalImpressionBodyDismissMethodEnumTypeTransformer._();

  const ModalImpressionBodyDismissMethodEnumTypeTransformer._();

  String encode(ModalImpressionBodyDismissMethodEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a ModalImpressionBodyDismissMethodEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ModalImpressionBodyDismissMethodEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'cross': return ModalImpressionBodyDismissMethodEnum.cross;
        case r'back': return ModalImpressionBodyDismissMethodEnum.back;
        case r'outside_tap': return ModalImpressionBodyDismissMethodEnum.outsideTap;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [ModalImpressionBodyDismissMethodEnumTypeTransformer] instance.
  static ModalImpressionBodyDismissMethodEnumTypeTransformer? _instance;
}


