//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class EngagementContentTypeInput {
  /// Instantiate a new enum with the provided [value].
  const EngagementContentTypeInput._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const aarti = EngagementContentTypeInput._(r'aarti');
  static const mantra = EngagementContentTypeInput._(r'mantra');
  static const ringtone = EngagementContentTypeInput._(r'ringtone');
  static const wallpaper = EngagementContentTypeInput._(r'wallpaper');
  static const status = EngagementContentTypeInput._(r'status');
  static const homeItem = EngagementContentTypeInput._(r'home_item');

  /// List of all possible values in this [enum][EngagementContentTypeInput].
  static const values = <EngagementContentTypeInput>[
    aarti,
    mantra,
    ringtone,
    wallpaper,
    status,
    homeItem,
  ];

  static EngagementContentTypeInput? fromJson(dynamic value) => EngagementContentTypeInputTypeTransformer().decode(value);

  static List<EngagementContentTypeInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <EngagementContentTypeInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = EngagementContentTypeInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [EngagementContentTypeInput] to String,
/// and [decode] dynamic data back to [EngagementContentTypeInput].
class EngagementContentTypeInputTypeTransformer {
  factory EngagementContentTypeInputTypeTransformer() => _instance ??= const EngagementContentTypeInputTypeTransformer._();

  const EngagementContentTypeInputTypeTransformer._();

  String encode(EngagementContentTypeInput data) => data.value;

  /// Decodes a [dynamic value][data] to a EngagementContentTypeInput.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  EngagementContentTypeInput? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'aarti': return EngagementContentTypeInput.aarti;
        case r'mantra': return EngagementContentTypeInput.mantra;
        case r'ringtone': return EngagementContentTypeInput.ringtone;
        case r'wallpaper': return EngagementContentTypeInput.wallpaper;
        case r'status': return EngagementContentTypeInput.status;
        case r'home_item': return EngagementContentTypeInput.homeItem;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [EngagementContentTypeInputTypeTransformer] instance.
  static EngagementContentTypeInputTypeTransformer? _instance;
}

