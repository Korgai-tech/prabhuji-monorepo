//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraPlaylistResponseData {
  /// Returns a new [MantraPlaylistResponseData] instance.
  MantraPlaylistResponseData({
    required this.firstItem,
    this.playlist = const [],
    required this.playlistSource,
  });

  MantraListItem? firstItem;

  List<MantraListItem> playlist;

  MantraPlaylistResponseDataPlaylistSourceEnum playlistSource;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraPlaylistResponseData &&
    other.firstItem == firstItem &&
    _deepEquality.equals(other.playlist, playlist) &&
    other.playlistSource == playlistSource;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (firstItem == null ? 0 : firstItem!.hashCode) +
    (playlist.hashCode) +
    (playlistSource.hashCode);

  @override
  String toString() => 'MantraPlaylistResponseData[firstItem=$firstItem, playlist=$playlist, playlistSource=$playlistSource]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.firstItem != null) {
      json[r'firstItem'] = this.firstItem;
    } else {
      json[r'firstItem'] = null;
    }
      json[r'playlist'] = this.playlist;
      json[r'playlistSource'] = this.playlistSource;
    return json;
  }

  /// Returns a new [MantraPlaylistResponseData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraPlaylistResponseData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'firstItem'), 'Required key "MantraPlaylistResponseData[firstItem]" is missing from JSON.');
        assert(json.containsKey(r'playlist'), 'Required key "MantraPlaylistResponseData[playlist]" is missing from JSON.');
        assert(json[r'playlist'] != null, 'Required key "MantraPlaylistResponseData[playlist]" has a null value in JSON.');
        assert(json.containsKey(r'playlistSource'), 'Required key "MantraPlaylistResponseData[playlistSource]" is missing from JSON.');
        assert(json[r'playlistSource'] != null, 'Required key "MantraPlaylistResponseData[playlistSource]" has a null value in JSON.');
        return true;
      }());

      return MantraPlaylistResponseData(
        firstItem: MantraListItem.fromJson(json[r'firstItem']),
        playlist: MantraListItem.listFromJson(json[r'playlist']),
        playlistSource: MantraPlaylistResponseDataPlaylistSourceEnum.fromJson(json[r'playlistSource'])!,
      );
    }
    return null;
  }

  static List<MantraPlaylistResponseData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraPlaylistResponseData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraPlaylistResponseData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraPlaylistResponseData> mapFromJson(dynamic json) {
    final map = <String, MantraPlaylistResponseData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraPlaylistResponseData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraPlaylistResponseData-objects as value to a dart map
  static Map<String, List<MantraPlaylistResponseData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraPlaylistResponseData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraPlaylistResponseData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'firstItem',
    'playlist',
    'playlistSource',
  };
}


class MantraPlaylistResponseDataPlaylistSourceEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraPlaylistResponseDataPlaylistSourceEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const recentlyPlayed = MantraPlaylistResponseDataPlaylistSourceEnum._(r'recently_played');
  static const deity = MantraPlaylistResponseDataPlaylistSourceEnum._(r'deity');
  static const category = MantraPlaylistResponseDataPlaylistSourceEnum._(r'category');
  static const newlyAdded = MantraPlaylistResponseDataPlaylistSourceEnum._(r'newly_added');
  static const listing = MantraPlaylistResponseDataPlaylistSourceEnum._(r'listing');

  /// List of all possible values in this [enum][MantraPlaylistResponseDataPlaylistSourceEnum].
  static const values = <MantraPlaylistResponseDataPlaylistSourceEnum>[
    recentlyPlayed,
    deity,
    category,
    newlyAdded,
    listing,
  ];

  static MantraPlaylistResponseDataPlaylistSourceEnum? fromJson(dynamic value) => MantraPlaylistResponseDataPlaylistSourceEnumTypeTransformer().decode(value);

  static List<MantraPlaylistResponseDataPlaylistSourceEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraPlaylistResponseDataPlaylistSourceEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraPlaylistResponseDataPlaylistSourceEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraPlaylistResponseDataPlaylistSourceEnum] to String,
/// and [decode] dynamic data back to [MantraPlaylistResponseDataPlaylistSourceEnum].
class MantraPlaylistResponseDataPlaylistSourceEnumTypeTransformer {
  factory MantraPlaylistResponseDataPlaylistSourceEnumTypeTransformer() => _instance ??= const MantraPlaylistResponseDataPlaylistSourceEnumTypeTransformer._();

  const MantraPlaylistResponseDataPlaylistSourceEnumTypeTransformer._();

  String encode(MantraPlaylistResponseDataPlaylistSourceEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraPlaylistResponseDataPlaylistSourceEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraPlaylistResponseDataPlaylistSourceEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'recently_played': return MantraPlaylistResponseDataPlaylistSourceEnum.recentlyPlayed;
        case r'deity': return MantraPlaylistResponseDataPlaylistSourceEnum.deity;
        case r'category': return MantraPlaylistResponseDataPlaylistSourceEnum.category;
        case r'newly_added': return MantraPlaylistResponseDataPlaylistSourceEnum.newlyAdded;
        case r'listing': return MantraPlaylistResponseDataPlaylistSourceEnum.listing;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraPlaylistResponseDataPlaylistSourceEnumTypeTransformer] instance.
  static MantraPlaylistResponseDataPlaylistSourceEnumTypeTransformer? _instance;
}


