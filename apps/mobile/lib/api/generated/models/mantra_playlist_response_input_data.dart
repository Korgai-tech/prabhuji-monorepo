//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MantraPlaylistResponseInputData {
  /// Returns a new [MantraPlaylistResponseInputData] instance.
  MantraPlaylistResponseInputData({
    required this.firstItem,
    this.playlist = const [],
    required this.playlistSource,
  });

  MantraListItemInput? firstItem;

  List<MantraListItemInput> playlist;

  MantraPlaylistResponseInputDataPlaylistSourceEnum playlistSource;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MantraPlaylistResponseInputData &&
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
  String toString() => 'MantraPlaylistResponseInputData[firstItem=$firstItem, playlist=$playlist, playlistSource=$playlistSource]';

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

  /// Returns a new [MantraPlaylistResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MantraPlaylistResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'firstItem'), 'Required key "MantraPlaylistResponseInputData[firstItem]" is missing from JSON.');
        assert(json.containsKey(r'playlist'), 'Required key "MantraPlaylistResponseInputData[playlist]" is missing from JSON.');
        assert(json[r'playlist'] != null, 'Required key "MantraPlaylistResponseInputData[playlist]" has a null value in JSON.');
        assert(json.containsKey(r'playlistSource'), 'Required key "MantraPlaylistResponseInputData[playlistSource]" is missing from JSON.');
        assert(json[r'playlistSource'] != null, 'Required key "MantraPlaylistResponseInputData[playlistSource]" has a null value in JSON.');
        return true;
      }());

      return MantraPlaylistResponseInputData(
        firstItem: MantraListItemInput.fromJson(json[r'firstItem']),
        playlist: MantraListItemInput.listFromJson(json[r'playlist']),
        playlistSource: MantraPlaylistResponseInputDataPlaylistSourceEnum.fromJson(json[r'playlistSource'])!,
      );
    }
    return null;
  }

  static List<MantraPlaylistResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraPlaylistResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraPlaylistResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MantraPlaylistResponseInputData> mapFromJson(dynamic json) {
    final map = <String, MantraPlaylistResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MantraPlaylistResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MantraPlaylistResponseInputData-objects as value to a dart map
  static Map<String, List<MantraPlaylistResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MantraPlaylistResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MantraPlaylistResponseInputData.listFromJson(entry.value, growable: growable,);
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


class MantraPlaylistResponseInputDataPlaylistSourceEnum {
  /// Instantiate a new enum with the provided [value].
  const MantraPlaylistResponseInputDataPlaylistSourceEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const recentlyPlayed = MantraPlaylistResponseInputDataPlaylistSourceEnum._(r'recently_played');
  static const deity = MantraPlaylistResponseInputDataPlaylistSourceEnum._(r'deity');
  static const category = MantraPlaylistResponseInputDataPlaylistSourceEnum._(r'category');
  static const newlyAdded = MantraPlaylistResponseInputDataPlaylistSourceEnum._(r'newly_added');
  static const listing = MantraPlaylistResponseInputDataPlaylistSourceEnum._(r'listing');

  /// List of all possible values in this [enum][MantraPlaylistResponseInputDataPlaylistSourceEnum].
  static const values = <MantraPlaylistResponseInputDataPlaylistSourceEnum>[
    recentlyPlayed,
    deity,
    category,
    newlyAdded,
    listing,
  ];

  static MantraPlaylistResponseInputDataPlaylistSourceEnum? fromJson(dynamic value) => MantraPlaylistResponseInputDataPlaylistSourceEnumTypeTransformer().decode(value);

  static List<MantraPlaylistResponseInputDataPlaylistSourceEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MantraPlaylistResponseInputDataPlaylistSourceEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MantraPlaylistResponseInputDataPlaylistSourceEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MantraPlaylistResponseInputDataPlaylistSourceEnum] to String,
/// and [decode] dynamic data back to [MantraPlaylistResponseInputDataPlaylistSourceEnum].
class MantraPlaylistResponseInputDataPlaylistSourceEnumTypeTransformer {
  factory MantraPlaylistResponseInputDataPlaylistSourceEnumTypeTransformer() => _instance ??= const MantraPlaylistResponseInputDataPlaylistSourceEnumTypeTransformer._();

  const MantraPlaylistResponseInputDataPlaylistSourceEnumTypeTransformer._();

  String encode(MantraPlaylistResponseInputDataPlaylistSourceEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a MantraPlaylistResponseInputDataPlaylistSourceEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MantraPlaylistResponseInputDataPlaylistSourceEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'recently_played': return MantraPlaylistResponseInputDataPlaylistSourceEnum.recentlyPlayed;
        case r'deity': return MantraPlaylistResponseInputDataPlaylistSourceEnum.deity;
        case r'category': return MantraPlaylistResponseInputDataPlaylistSourceEnum.category;
        case r'newly_added': return MantraPlaylistResponseInputDataPlaylistSourceEnum.newlyAdded;
        case r'listing': return MantraPlaylistResponseInputDataPlaylistSourceEnum.listing;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [MantraPlaylistResponseInputDataPlaylistSourceEnumTypeTransformer] instance.
  static MantraPlaylistResponseInputDataPlaylistSourceEnumTypeTransformer? _instance;
}


