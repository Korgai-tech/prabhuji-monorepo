//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RingtoneSearchResponseData {
  /// Returns a new [RingtoneSearchResponseData] instance.
  RingtoneSearchResponseData({
    this.items = const [],
    required this.nextCursor,
    required this.resultCount,
  });

  List<RingtoneCard> items;

  String? nextCursor;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int resultCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RingtoneSearchResponseData &&
    _deepEquality.equals(other.items, items) &&
    other.nextCursor == nextCursor &&
    other.resultCount == resultCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (items.hashCode) +
    (nextCursor == null ? 0 : nextCursor!.hashCode) +
    (resultCount.hashCode);

  @override
  String toString() => 'RingtoneSearchResponseData[items=$items, nextCursor=$nextCursor, resultCount=$resultCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'items'] = this.items;
    if (this.nextCursor != null) {
      json[r'nextCursor'] = this.nextCursor;
    } else {
      json[r'nextCursor'] = null;
    }
      json[r'resultCount'] = this.resultCount;
    return json;
  }

  /// Returns a new [RingtoneSearchResponseData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RingtoneSearchResponseData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'items'), 'Required key "RingtoneSearchResponseData[items]" is missing from JSON.');
        assert(json[r'items'] != null, 'Required key "RingtoneSearchResponseData[items]" has a null value in JSON.');
        assert(json.containsKey(r'nextCursor'), 'Required key "RingtoneSearchResponseData[nextCursor]" is missing from JSON.');
        assert(json.containsKey(r'resultCount'), 'Required key "RingtoneSearchResponseData[resultCount]" is missing from JSON.');
        assert(json[r'resultCount'] != null, 'Required key "RingtoneSearchResponseData[resultCount]" has a null value in JSON.');
        return true;
      }());

      return RingtoneSearchResponseData(
        items: RingtoneCard.listFromJson(json[r'items']),
        nextCursor: mapValueOfType<String>(json, r'nextCursor'),
        resultCount: mapValueOfType<int>(json, r'resultCount')!,
      );
    }
    return null;
  }

  static List<RingtoneSearchResponseData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RingtoneSearchResponseData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RingtoneSearchResponseData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RingtoneSearchResponseData> mapFromJson(dynamic json) {
    final map = <String, RingtoneSearchResponseData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RingtoneSearchResponseData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RingtoneSearchResponseData-objects as value to a dart map
  static Map<String, List<RingtoneSearchResponseData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RingtoneSearchResponseData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RingtoneSearchResponseData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'items',
    'nextCursor',
    'resultCount',
  };
}

