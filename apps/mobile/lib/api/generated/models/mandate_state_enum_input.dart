//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class MandateStateEnumInput {
  /// Instantiate a new enum with the provided [value].
  const MandateStateEnumInput._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const initiated = MandateStateEnumInput._(r'initiated');
  static const pending = MandateStateEnumInput._(r'pending');
  static const active = MandateStateEnumInput._(r'active');
  static const paused = MandateStateEnumInput._(r'paused');
  static const revoked = MandateStateEnumInput._(r'revoked');
  static const rejected = MandateStateEnumInput._(r'rejected');
  static const expired = MandateStateEnumInput._(r'expired');
  static const failed = MandateStateEnumInput._(r'failed');
  static const completed = MandateStateEnumInput._(r'completed');

  /// List of all possible values in this [enum][MandateStateEnumInput].
  static const values = <MandateStateEnumInput>[
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

  static MandateStateEnumInput? fromJson(dynamic value) => MandateStateEnumInputTypeTransformer().decode(value);

  static List<MandateStateEnumInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MandateStateEnumInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MandateStateEnumInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MandateStateEnumInput] to String,
/// and [decode] dynamic data back to [MandateStateEnumInput].
class MandateStateEnumInputTypeTransformer {
  factory MandateStateEnumInputTypeTransformer() => _instance ??= const MandateStateEnumInputTypeTransformer._();

  const MandateStateEnumInputTypeTransformer._();

  String encode(MandateStateEnumInput data) => data.value;

  /// Decodes a [dynamic value][data] to a MandateStateEnumInput.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MandateStateEnumInput? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'initiated': return MandateStateEnumInput.initiated;
        case r'pending': return MandateStateEnumInput.pending;
        case r'active': return MandateStateEnumInput.active;
        case r'paused': return MandateStateEnumInput.paused;
        case r'revoked': return MandateStateEnumInput.revoked;
        case r'rejected': return MandateStateEnumInput.rejected;
        case r'expired': return MandateStateEnumInput.expired;
        case r'failed': return MandateStateEnumInput.failed;
        case r'completed': return MandateStateEnumInput.completed;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MandateStateEnumInputTypeTransformer] instance.
  static MandateStateEnumInputTypeTransformer? _instance;
}

