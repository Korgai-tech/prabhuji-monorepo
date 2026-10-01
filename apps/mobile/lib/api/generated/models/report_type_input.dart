//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class ReportTypeInput {
  /// Instantiate a new enum with the provided [value].
  const ReportTypeInput._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const user = ReportTypeInput._(r'user');
  static const content = ReportTypeInput._(r'content');

  /// List of all possible values in this [enum][ReportTypeInput].
  static const values = <ReportTypeInput>[
    user,
    content,
  ];

  static ReportTypeInput? fromJson(dynamic value) => ReportTypeInputTypeTransformer().decode(value);

  static List<ReportTypeInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ReportTypeInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ReportTypeInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ReportTypeInput] to String,
/// and [decode] dynamic data back to [ReportTypeInput].
class ReportTypeInputTypeTransformer {
  factory ReportTypeInputTypeTransformer() => _instance ??= const ReportTypeInputTypeTransformer._();

  const ReportTypeInputTypeTransformer._();

  String encode(ReportTypeInput data) => data.value;

  /// Decodes a [dynamic value][data] to a ReportTypeInput.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ReportTypeInput? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'user': return ReportTypeInput.user;
        case r'content': return ReportTypeInput.content;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [ReportTypeInputTypeTransformer] instance.
  static ReportTypeInputTypeTransformer? _instance;
}

