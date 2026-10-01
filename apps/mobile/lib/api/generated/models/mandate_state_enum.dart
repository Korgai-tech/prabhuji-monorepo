//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class MandateStateEnum {
  /// Instantiate a new enum with the provided [value].
  const MandateStateEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const initiated = MandateStateEnum._(r'initiated');
  static const pending = MandateStateEnum._(r'pending');
  static const active = MandateStateEnum._(r'active');
  static const paused = MandateStateEnum._(r'paused');
  static const revoked = MandateStateEnum._(r'revoked');
  static const rejected = MandateStateEnum._(r'rejected');
  static const expired = MandateStateEnum._(r'expired');
  static const failed = MandateStateEnum._(r'failed');
  static const completed = MandateStateEnum._(r'completed');

  /// List of all possible values in this [enum][MandateStateEnum].
  static const values = <MandateStateEnum>[
    initiated,
    pending,
    active,
    paused,
    revoked,
    rejected,
    expired,
    failed,
    completed,
  ];

  static MandateStateEnum? fromJson(dynamic value) => MandateStateEnumTypeTransformer().decode(value);

  static List<MandateStateEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MandateStateEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MandateStateEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MandateStateEnum] to String,
/// and [decode] dynamic data back to [MandateStateEnum].
class MandateStateEnumTypeTransformer {
  factory MandateStateEnumTypeTransformer() => _instance ??= const MandateStateEnumTypeTransformer._();

  const MandateStateEnumTypeTransformer._();

  String encode(MandateStateEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MandateStateEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MandateStateEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'initiated': return MandateStateEnum.initiated;
        case r'pending': return MandateStateEnum.pending;
        case r'active': return MandateStateEnum.active;
        case r'paused': return MandateStateEnum.paused;
        case r'revoked': return MandateStateEnum.revoked;
        case r'rejected': return MandateStateEnum.rejected;
        case r'expired': return MandateStateEnum.expired;
        case r'failed': return MandateStateEnum.failed;
        case r'completed': return MandateStateEnum.completed;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MandateStateEnumTypeTransformer] instance.
  static MandateStateEnumTypeTransformer? _instance;
}

