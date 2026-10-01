//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class LanguageCode {
  /// Instantiate a new enum with the provided [value].
  const LanguageCode._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const hi = LanguageCode._(r'hi');
  static const mr = LanguageCode._(r'mr');
  static const gu = LanguageCode._(r'gu');
  static const bn = LanguageCode._(r'bn');
  static const or = LanguageCode._(r'or');
  static const ta = LanguageCode._(r'ta');
  static const te = LanguageCode._(r'te');
  static const kn = LanguageCode._(r'kn');

  /// List of all possible values in this [enum][LanguageCode].
  static const values = <LanguageCode>[
    hi,
    mr,
    gu,
    bn,
    or,
    ta,
    te,
    kn,
  ];

  static LanguageCode? fromJson(dynamic value) => LanguageCodeTypeTransformer().decode(value);

  static List<LanguageCode> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <LanguageCode>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LanguageCode.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LanguageCode] to String,
/// and [decode] dynamic data back to [LanguageCode].
class LanguageCodeTypeTransformer {
  factory LanguageCodeTypeTransformer() => _instance ??= const LanguageCodeTypeTransformer._();

  const LanguageCodeTypeTransformer._();

  String encode(LanguageCode data) => data.value;

  /// Decodes a [dynamic value][data] to a LanguageCode.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LanguageCode? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'hi': return LanguageCode.hi;
        case r'mr': return LanguageCode.mr;
        case r'gu': return LanguageCode.gu;
        case r'bn': return LanguageCode.bn;
        case r'or': return LanguageCode.or;
        case r'ta': return LanguageCode.ta;
        case r'te': return LanguageCode.te;
        case r'kn': return LanguageCode.kn;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [LanguageCodeTypeTransformer] instance.
  static LanguageCodeTypeTransformer? _instance;
}

