//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class LanguageCodeInput {
  /// Instantiate a new enum with the provided [value].
  const LanguageCodeInput._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const hi = LanguageCodeInput._(r'hi');
  static const mr = LanguageCodeInput._(r'mr');
  static const gu = LanguageCodeInput._(r'gu');
  static const bn = LanguageCodeInput._(r'bn');
  static const or = LanguageCodeInput._(r'or');
  static const ta = LanguageCodeInput._(r'ta');
  static const te = LanguageCodeInput._(r'te');
  static const kn = LanguageCodeInput._(r'kn');

  /// List of all possible values in this [enum][LanguageCodeInput].
  static const values = <LanguageCodeInput>[
    hi,
    mr,
    gu,
    bn,
    or,
    ta,
    te,
    kn,
  ];

  static LanguageCodeInput? fromJson(dynamic value) => LanguageCodeInputTypeTransformer().decode(value);

  static List<LanguageCodeInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <LanguageCodeInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LanguageCodeInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LanguageCodeInput] to String,
/// and [decode] dynamic data back to [LanguageCodeInput].
class LanguageCodeInputTypeTransformer {
  factory LanguageCodeInputTypeTransformer() => _instance ??= const LanguageCodeInputTypeTransformer._();

  const LanguageCodeInputTypeTransformer._();

  String encode(LanguageCodeInput data) => data.value;

  /// Decodes a [dynamic value][data] to a LanguageCodeInput.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LanguageCodeInput? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'hi': return LanguageCodeInput.hi;
        case r'mr': return LanguageCodeInput.mr;
        case r'gu': return LanguageCodeInput.gu;
        case r'bn': return LanguageCodeInput.bn;
        case r'or': return LanguageCodeInput.or;
        case r'ta': return LanguageCodeInput.ta;
        case r'te': return LanguageCodeInput.te;
        case r'kn': return LanguageCodeInput.kn;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [LanguageCodeInputTypeTransformer] instance.
  static LanguageCodeInputTypeTransformer? _instance;
}

