//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class EngagementContentType {
  /// Instantiate a new enum with the provided [value].
  const EngagementContentType._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const aarti = EngagementContentType._(r'aarti');
  static const mantra = EngagementContentType._(r'mantra');
  static const ringtone = EngagementContentType._(r'ringtone');
  static const wallpaper = EngagementContentType._(r'wallpaper');
  static const status = EngagementContentType._(r'status');
  static const homeItem = EngagementContentType._(r'home_item');

  /// List of all possible values in this [enum][EngagementContentType].
  static const values = <EngagementContentType>[
    aarti,
    mantra,
    ringtone,
    wallpaper,
    status,
    homeItem,
  ];

  static EngagementContentType? fromJson(dynamic value) => EngagementContentTypeTypeTransformer().decode(value);

  static List<EngagementContentType> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <EngagementContentType>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = EngagementContentType.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [EngagementContentType] to String,
/// and [decode] dynamic data back to [EngagementContentType].
class EngagementContentTypeTypeTransformer {
  factory EngagementContentTypeTypeTransformer() => _instance ??= const EngagementContentTypeTypeTransformer._();

  const EngagementContentTypeTypeTransformer._();

  String encode(EngagementContentType data) => data.value;

  /// Decodes a [dynamic value][data] to a EngagementContentType.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  EngagementContentType? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'aarti': return EngagementContentType.aarti;
        case r'mantra': return EngagementContentType.mantra;
        case r'ringtone': return EngagementContentType.ringtone;
        case r'wallpaper': return EngagementContentType.wallpaper;
        case r'status': return EngagementContentType.status;
        case r'home_item': return EngagementContentType.homeItem;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [EngagementContentTypeTypeTransformer] instance.
  static EngagementContentTypeTypeTransformer? _instance;
}

