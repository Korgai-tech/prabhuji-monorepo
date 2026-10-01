//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraDetailResponseInputData {
  /// Returns a new [MantraDetailResponseInputData] instance.
  MantraDetailResponseInputData({
    required this.item,
    this.playlist = const [],
    required this.playlistSource,
  });

  MantraDetailInput item;

  List<MantraListItemInput> playlist;

  MantraDetailResponseInputDataPlaylistSourceEnum playlistSource;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraDetailResponseInputData &&
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
  String toString() => 'MantraDetailResponseInputData[item=$item, playlist=$playlist, playlistSource=$playlistSource]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'item'] = this.item;
      json[r'playlist'] = this.playlist;
      json[r'playlistSource'] = this.playlistSource;
    return json;
  }

  /// Returns a new [MantraDetailResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraDetailResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'item'), 'Required key "MantraDetailResponseInputData[item]" is missing from JSON.');
        assert(json[r'item'] != null, 'Required key "MantraDetailResponseInputData[item]" has a null value in JSON.');
        assert(json.containsKey(r'playlist'), 'Required key "MantraDetailResponseInputData[playlist]" is missing from JSON.');
        assert(json[r'playlist'] != null, 'Required key "MantraDetailResponseInputData[playlist]" has a null value in JSON.');
        assert(json.containsKey(r'playlistSource'), 'Required key "MantraDetailResponseInputData[playlistSource]" is missing from JSON.');
        assert(json[r'playlistSource'] != null, 'Required key "MantraDetailResponseInputData[playlistSource]" has a null value in JSON.');
        return true;
      }());

      return MantraDetailResponseInputData(
        item: MantraDetailInput.fromJson(json[r'item'])!,
        playlist: MantraListItemInput.listFromJson(json[r'playlist']),
        playlistSource: MantraDetailResponseInputDataPlaylistSourceEnum.fromJson(json[r'playlistSource'])!,
      );
    }
    return null;
  }

  static List<MantraDetailResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraDetailResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraDetailResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraDetailResponseInputData> mapFromJson(dynamic json) {
    final map = <String, MantraDetailResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraDetailResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraDetailResponseInputData-objects as value to a dart map
  static Map<String, List<MantraDetailResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraDetailResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraDetailResponseInputData.listFromJson(entry.value, growable: growable,);
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


class MantraDetailResponseInputDataPlaylistSourceEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraDetailResponseInputDataPlaylistSourceEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const recentlyPlayed = MantraDetailResponseInputDataPlaylistSourceEnum._(r'recently_played');
  static const deity = MantraDetailResponseInputDataPlaylistSourceEnum._(r'deity');
  static const category = MantraDetailResponseInputDataPlaylistSourceEnum._(r'category');
  static const newlyAdded = MantraDetailResponseInputDataPlaylistSourceEnum._(r'newly_added');
  static const listing = MantraDetailResponseInputDataPlaylistSourceEnum._(r'listing');

  /// List of all possible values in this [enum][MantraDetailResponseInputDataPlaylistSourceEnum].
  static const values = <MantraDetailResponseInputDataPlaylistSourceEnum>[
    recentlyPlayed,
    deity,
    category,
    newlyAdded,
    listing,
  ];

  static MantraDetailResponseInputDataPlaylistSourceEnum? fromJson(dynamic value) => MantraDetailResponseInputDataPlaylistSourceEnumTypeTransformer().decode(value);

  static List<MantraDetailResponseInputDataPlaylistSourceEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraDetailResponseInputDataPlaylistSourceEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraDetailResponseInputDataPlaylistSourceEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraDetailResponseInputDataPlaylistSourceEnum] to String,
/// and [decode] dynamic data back to [MantraDetailResponseInputDataPlaylistSourceEnum].
class MantraDetailResponseInputDataPlaylistSourceEnumTypeTransformer {
  factory MantraDetailResponseInputDataPlaylistSourceEnumTypeTransformer() => _instance ??= const MantraDetailResponseInputDataPlaylistSourceEnumTypeTransformer._();

  const MantraDetailResponseInputDataPlaylistSourceEnumTypeTransformer._();

  String encode(MantraDetailResponseInputDataPlaylistSourceEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraDetailResponseInputDataPlaylistSourceEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraDetailResponseInputDataPlaylistSourceEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'recently_played': return MantraDetailResponseInputDataPlaylistSourceEnum.recentlyPlayed;
        case r'deity': return MantraDetailResponseInputDataPlaylistSourceEnum.deity;
        case r'category': return MantraDetailResponseInputDataPlaylistSourceEnum.category;
        case r'newly_added': return MantraDetailResponseInputDataPlaylistSourceEnum.newlyAdded;
        case r'listing': return MantraDetailResponseInputDataPlaylistSourceEnum.listing;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraDetailResponseInputDataPlaylistSourceEnumTypeTransformer] instance.
  static MantraDetailResponseInputDataPlaylistSourceEnumTypeTransformer? _instance;
}


