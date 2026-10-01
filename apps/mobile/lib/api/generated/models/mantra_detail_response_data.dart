//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraDetailResponseData {
  /// Returns a new [MantraDetailResponseData] instance.
  MantraDetailResponseData({
    required this.item,
    this.playlist = const [],
    required this.playlistSource,
  });

  MantraDetail item;

  List<MantraListItem> playlist;

  MantraDetailResponseDataPlaylistSourceEnum playlistSource;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraDetailResponseData &&
    other.item == item &&
    _deepEquality.equals(other.playlist, playlist) &&
    other.playlistSource == playlistSource;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (item.hashCode) +
    (playlist.hashCode) +
    (playlistSource.hashCode);

  @override
  String toString() => 'MantraDetailResponseData[item=$item, playlist=$playlist, playlistSource=$playlistSource]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'item'] = this.item;
      json[r'playlist'] = this.playlist;
      json[r'playlistSource'] = this.playlistSource;
    return json;
  }

  /// Returns a new [MantraDetailResponseData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraDetailResponseData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'item'), 'Required key "MantraDetailResponseData[item]" is missing from JSON.');
        assert(json[r'item'] != null, 'Required key "MantraDetailResponseData[item]" has a null value in JSON.');
        assert(json.containsKey(r'playlist'), 'Required key "MantraDetailResponseData[playlist]" is missing from JSON.');
        assert(json[r'playlist'] != null, 'Required key "MantraDetailResponseData[playlist]" has a null value in JSON.');
        assert(json.containsKey(r'playlistSource'), 'Required key "MantraDetailResponseData[playlistSource]" is missing from JSON.');
        assert(json[r'playlistSource'] != null, 'Required key "MantraDetailResponseData[playlistSource]" has a null value in JSON.');
        return true;
      }());

      return MantraDetailResponseData(
        item: MantraDetail.fromJson(json[r'item'])!,
        playlist: MantraListItem.listFromJson(json[r'playlist']),
        playlistSource: MantraDetailResponseDataPlaylistSourceEnum.fromJson(json[r'playlistSource'])!,
      );
    }
    return null;
  }

  static List<MantraDetailResponseData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraDetailResponseData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraDetailResponseData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraDetailResponseData> mapFromJson(dynamic json) {
    final map = <String, MantraDetailResponseData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraDetailResponseData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraDetailResponseData-objects as value to a dart map
  static Map<String, List<MantraDetailResponseData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraDetailResponseData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraDetailResponseData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'item',
    'playlist',
    'playlistSource',
  };
}


class MantraDetailResponseDataPlaylistSourceEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraDetailResponseDataPlaylistSourceEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const recentlyPlayed = MantraDetailResponseDataPlaylistSourceEnum._(r'recently_played');
  static const deity = MantraDetailResponseDataPlaylistSourceEnum._(r'deity');
  static const category = MantraDetailResponseDataPlaylistSourceEnum._(r'category');
  static const newlyAdded = MantraDetailResponseDataPlaylistSourceEnum._(r'newly_added');
  static const listing = MantraDetailResponseDataPlaylistSourceEnum._(r'listing');

  /// List of all possible values in this [enum][MantraDetailResponseDataPlaylistSourceEnum].
  static const values = <MantraDetailResponseDataPlaylistSourceEnum>[
    recentlyPlayed,
    deity,
    category,
    newlyAdded,
    listing,
  ];

  static MantraDetailResponseDataPlaylistSourceEnum? fromJson(dynamic value) => MantraDetailResponseDataPlaylistSourceEnumTypeTransformer().decode(value);

  static List<MantraDetailResponseDataPlaylistSourceEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraDetailResponseDataPlaylistSourceEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraDetailResponseDataPlaylistSourceEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraDetailResponseDataPlaylistSourceEnum] to String,
/// and [decode] dynamic data back to [MantraDetailResponseDataPlaylistSourceEnum].
class MantraDetailResponseDataPlaylistSourceEnumTypeTransformer {
  factory MantraDetailResponseDataPlaylistSourceEnumTypeTransformer() => _instance ??= const MantraDetailResponseDataPlaylistSourceEnumTypeTransformer._();

  const MantraDetailResponseDataPlaylistSourceEnumTypeTransformer._();

  String encode(MantraDetailResponseDataPlaylistSourceEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraDetailResponseDataPlaylistSourceEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraDetailResponseDataPlaylistSourceEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'recently_played': return MantraDetailResponseDataPlaylistSourceEnum.recentlyPlayed;
        case r'deity': return MantraDetailResponseDataPlaylistSourceEnum.deity;
        case r'category': return MantraDetailResponseDataPlaylistSourceEnum.category;
        case r'newly_added': return MantraDetailResponseDataPlaylistSourceEnum.newlyAdded;
        case r'listing': return MantraDetailResponseDataPlaylistSourceEnum.listing;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraDetailResponseDataPlaylistSourceEnumTypeTransformer] instance.
  static MantraDetailResponseDataPlaylistSourceEnumTypeTransformer? _instance;
}


