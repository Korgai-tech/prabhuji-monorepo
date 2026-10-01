//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class SubscriptionStatusEnum {
  /// Instantiate a new enum with the provided [value].
  const SubscriptionStatusEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const free = SubscriptionStatusEnum._(r'free');
  static const pending = SubscriptionStatusEnum._(r'pending');
  static const trialing = SubscriptionStatusEnum._(r'trialing');
  static const active = SubscriptionStatusEnum._(r'active');
  static const pastDue = SubscriptionStatusEnum._(r'past_due');
  static const cancelled = SubscriptionStatusEnum._(r'cancelled');
  static const expired = SubscriptionStatusEnum._(r'expired');

  /// List of all possible values in this [enum][SubscriptionStatusEnum].
  static const values = <SubscriptionStatusEnum>[
    free,
    pending,
    trialing,
    active,
    pastDue,
    cancelled,
    expired,
  ];

  static SubscriptionStatusEnum? fromJson(dynamic value) => SubscriptionStatusEnumTypeTransformer().decode(value);

  static List<SubscriptionStatusEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <SubscriptionStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SubscriptionStatusEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [SubscriptionStatusEnum] to String,
/// and [decode] dynamic data back to [SubscriptionStatusEnum].
class SubscriptionStatusEnumTypeTransformer {
  factory SubscriptionStatusEnumTypeTransformer() => _instance ??= const SubscriptionStatusEnumTypeTransformer._();

  const SubscriptionStatusEnumTypeTransformer._();

  String encode(SubscriptionStatusEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a SubscriptionStatusEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  SubscriptionStatusEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'free': return SubscriptionStatusEnum.free;
        case r'pending': return SubscriptionStatusEnum.pending;
        case r'trialing': return SubscriptionStatusEnum.trialing;
        case r'active': return SubscriptionStatusEnum.active;
        case r'past_due': return SubscriptionStatusEnum.pastDue;
        case r'cancelled': return SubscriptionStatusEnum.cancelled;
        case r'expired': return SubscriptionStatusEnum.expired;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [SubscriptionStatusEnumTypeTransformer] instance.
  static SubscriptionStatusEnumTypeTransformer? _instance;
}

