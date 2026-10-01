//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class SubscriptionStatusEnumInput {
  /// Instantiate a new enum with the provided [value].
  const SubscriptionStatusEnumInput._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const free = SubscriptionStatusEnumInput._(r'free');
  static const pending = SubscriptionStatusEnumInput._(r'pending');
  static const trialing = SubscriptionStatusEnumInput._(r'trialing');
  static const active = SubscriptionStatusEnumInput._(r'active');
  static const pastDue = SubscriptionStatusEnumInput._(r'past_due');
  static const cancelled = SubscriptionStatusEnumInput._(r'cancelled');
  static const expired = SubscriptionStatusEnumInput._(r'expired');

  /// List of all possible values in this [enum][SubscriptionStatusEnumInput].
  static const values = <SubscriptionStatusEnumInput>[
    free,
    pending,
    trialing,
    active,
    pastDue,
    cancelled,
    expired,
  ];

  static SubscriptionStatusEnumInput? fromJson(dynamic value) => SubscriptionStatusEnumInputTypeTransformer().decode(value);

  static List<SubscriptionStatusEnumInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <SubscriptionStatusEnumInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SubscriptionStatusEnumInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [SubscriptionStatusEnumInput] to String,
/// and [decode] dynamic data back to [SubscriptionStatusEnumInput].
class SubscriptionStatusEnumInputTypeTransformer {
  factory SubscriptionStatusEnumInputTypeTransformer() => _instance ??= const SubscriptionStatusEnumInputTypeTransformer._();

  const SubscriptionStatusEnumInputTypeTransformer._();

  String encode(SubscriptionStatusEnumInput data) => data.value;

  /// Decodes a [dynamic value][data] to a SubscriptionStatusEnumInput.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  SubscriptionStatusEnumInput? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'free': return SubscriptionStatusEnumInput.free;
        case r'pending': return SubscriptionStatusEnumInput.pending;
        case r'trialing': return SubscriptionStatusEnumInput.trialing;
        case r'active': return SubscriptionStatusEnumInput.active;
        case r'past_due': return SubscriptionStatusEnumInput.pastDue;
        case r'cancelled': return SubscriptionStatusEnumInput.cancelled;
        case r'expired': return SubscriptionStatusEnumInput.expired;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [SubscriptionStatusEnumInputTypeTransformer] instance.
  static SubscriptionStatusEnumInputTypeTransformer? _instance;
}

