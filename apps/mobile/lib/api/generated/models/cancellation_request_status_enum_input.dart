//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class CancellationRequestStatusEnumInput {
  /// Instantiate a new enum with the provided [value].
  const CancellationRequestStatusEnumInput._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const pending = CancellationRequestStatusEnumInput._(r'pending');
  static const processing = CancellationRequestStatusEnumInput._(r'processing');
  static const completed = CancellationRequestStatusEnumInput._(r'completed');
  static const rejected = CancellationRequestStatusEnumInput._(r'rejected');

  /// List of all possible values in this [enum][CancellationRequestStatusEnumInput].
  static const values = <CancellationRequestStatusEnumInput>[
    pending,
    processing,
    completed,
    rejected,
  ];

  static CancellationRequestStatusEnumInput? fromJson(dynamic value) => CancellationRequestStatusEnumInputTypeTransformer().decode(value);

  static List<CancellationRequestStatusEnumInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <CancellationRequestStatusEnumInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CancellationRequestStatusEnumInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [CancellationRequestStatusEnumInput] to String,
/// and [decode] dynamic data back to [CancellationRequestStatusEnumInput].
class CancellationRequestStatusEnumInputTypeTransformer {
  factory CancellationRequestStatusEnumInputTypeTransformer() => _instance ??= const CancellationRequestStatusEnumInputTypeTransformer._();

  const CancellationRequestStatusEnumInputTypeTransformer._();

  String encode(CancellationRequestStatusEnumInput data) => data.value;

  /// Decodes a [dynamic value][data] to a CancellationRequestStatusEnumInput.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  CancellationRequestStatusEnumInput? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'pending': return CancellationRequestStatusEnumInput.pending;
        case r'processing': return CancellationRequestStatusEnumInput.processing;
        case r'completed': return CancellationRequestStatusEnumInput.completed;
        case r'rejected': return CancellationRequestStatusEnumInput.rejected;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [CancellationRequestStatusEnumInputTypeTransformer] instance.
  static CancellationRequestStatusEnumInputTypeTransformer? _instance;
}

