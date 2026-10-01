//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookCardPageResponseInputData {
  /// Returns a new [BookCardPageResponseInputData] instance.
  BookCardPageResponseInputData({
    required this.title,
    this.items = const [],
    required this.nextCursor,
  });

  /// CMS/server-owned heading for this listing screen — the all-books title on `GET /books` (the client used to hardcode \"All Books\"), the category's own title on `GET /books/categories/:category`.
  String title;

  List<BookCardInput> items;

  String? nextCursor;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookCardPageResponseInputData &&
    other.title == title &&
    _deepEquality.equals(other.items, items) &&
    other.nextCursor == nextCursor;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (title.hashCode) +
    (items.hashCode) +
    (nextCursor == null ? 0 : nextCursor!.hashCode);

  @override
  String toString() => 'BookCardPageResponseInputData[title=$title, items=$items, nextCursor=$nextCursor]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'title'] = this.title;
      json[r'items'] = this.items;
    if (this.nextCursor != null) {
      json[r'nextCursor'] = this.nextCursor;
    } else {
      json[r'nextCursor'] = null;
    }
    return json;
  }

  /// Returns a new [BookCardPageResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookCardPageResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'title'), 'Required key "BookCardPageResponseInputData[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookCardPageResponseInputData[title]" has a null value in JSON.');
        assert(json.containsKey(r'items'), 'Required key "BookCardPageResponseInputData[items]" is missing from JSON.');
        assert(json[r'items'] != null, 'Required key "BookCardPageResponseInputData[items]" has a null value in JSON.');
        assert(json.containsKey(r'nextCursor'), 'Required key "BookCardPageResponseInputData[nextCursor]" is missing from JSON.');
        return true;
      }());

      return BookCardPageResponseInputData(
        title: mapValueOfType<String>(json, r'title')!,
        items: BookCardInput.listFromJson(json[r'items']),
        nextCursor: mapValueOfType<String>(json, r'nextCursor'),
      );
    }
    return null;
  }

  static List<BookCardPageResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookCardPageResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookCardPageResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookCardPageResponseInputData> mapFromJson(dynamic json) {
    final map = <String, BookCardPageResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookCardPageResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookCardPageResponseInputData-objects as value to a dart map
  static Map<String, List<BookCardPageResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookCardPageResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookCardPageResponseInputData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'title',
    'items',
    'nextCursor',
  };
}

