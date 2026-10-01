//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class CancellationRequestStatusEnum {
  /// Instantiate a new enum with the provided [value].
  const CancellationRequestStatusEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const pending = CancellationRequestStatusEnum._(r'pending');
  static const processing = CancellationRequestStatusEnum._(r'processing');
  static const completed = CancellationRequestStatusEnum._(r'completed');
  static const rejected = CancellationRequestStatusEnum._(r'rejected');

  /// List of all possible values in this [enum][CancellationRequestStatusEnum].
  static const values = <CancellationRequestStatusEnum>[
    pending,
    processing,
    completed,
    rejected,
  ];

  static CancellationRequestStatusEnum? fromJson(dynamic value) => CancellationRequestStatusEnumTypeTransformer().decode(value);

  static List<CancellationRequestStatusEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <CancellationRequestStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CancellationRequestStatusEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [CancellationRequestStatusEnum] to String,
/// and [decode] dynamic data back to [CancellationRequestStatusEnum].
class CancellationRequestStatusEnumTypeTransformer {
  factory CancellationRequestStatusEnumTypeTransformer() => _instance ??= const CancellationRequestStatusEnumTypeTransformer._();

  const CancellationRequestStatusEnumTypeTransformer._();

  String encode(CancellationRequestStatusEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a CancellationRequestStatusEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  CancellationRequestStatusEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'pending': return CancellationRequestStatusEnum.pending;
        case r'processing': return CancellationRequestStatusEnum.processing;
        case r'completed': return CancellationRequestStatusEnum.completed;
        case r'rejected': return CancellationRequestStatusEnum.rejected;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [CancellationRequestStatusEnumTypeTransformer] instance.
  static CancellationRequestStatusEnumTypeTransformer? _instance;
}

