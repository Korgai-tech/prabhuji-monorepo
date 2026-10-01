//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookSubBookSummary {
  /// Returns a new [BookSubBookSummary] instance.
  BookSubBookSummary({
    required this.subBookId,
    required this.title,
    required this.order,
    required this.chapterCount,
    this.chapters = const [],
  });

  String subBookId;

  String title;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int order;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int chapterCount;

  List<BookChapterSummary> chapters;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookSubBookSummary &&
    other.subBookId == subBookId &&
    other.title == title &&
    other.order == order &&
    other.chapterCount == chapterCount &&
    _deepEquality.equals(other.chapters, chapters);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (subBookId.hashCode) +
    (title.hashCode) +
    (order.hashCode) +
    (chapterCount.hashCode) +
    (chapters.hashCode);

  @override
  String toString() => 'BookSubBookSummary[subBookId=$subBookId, title=$title, order=$order, chapterCount=$chapterCount, chapters=$chapters]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'subBookId'] = this.subBookId;
      json[r'title'] = this.title;
      json[r'order'] = this.order;
      json[r'chapterCount'] = this.chapterCount;
      json[r'chapters'] = this.chapters;
    return json;
  }

  /// Returns a new [BookSubBookSummary] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookSubBookSummary? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'subBookId'), 'Required key "BookSubBookSummary[subBookId]" is missing from JSON.');
        assert(json[r'subBookId'] != null, 'Required key "BookSubBookSummary[subBookId]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookSubBookSummary[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookSubBookSummary[title]" has a null value in JSON.');
        assert(json.containsKey(r'order'), 'Required key "BookSubBookSummary[order]" is missing from JSON.');
        assert(json[r'order'] != null, 'Required key "BookSubBookSummary[order]" has a null value in JSON.');
        assert(json.containsKey(r'chapterCount'), 'Required key "BookSubBookSummary[chapterCount]" is missing from JSON.');
        assert(json[r'chapterCount'] != null, 'Required key "BookSubBookSummary[chapterCount]" has a null value in JSON.');
        assert(json.containsKey(r'chapters'), 'Required key "BookSubBookSummary[chapters]" is missing from JSON.');
        assert(json[r'chapters'] != null, 'Required key "BookSubBookSummary[chapters]" has a null value in JSON.');
        return true;
      }());

      return BookSubBookSummary(
        subBookId: mapValueOfType<String>(json, r'subBookId')!,
        title: mapValueOfType<String>(json, r'title')!,
        order: mapValueOfType<int>(json, r'order')!,
        chapterCount: mapValueOfType<int>(json, r'chapterCount')!,
        chapters: BookChapterSummary.listFromJson(json[r'chapters']),
      );
    }
    return null;
  }

  static List<BookSubBookSummary> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookSubBookSummary>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookSubBookSummary.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookSubBookSummary> mapFromJson(dynamic json) {
    final map = <String, BookSubBookSummary>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookSubBookSummary.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookSubBookSummary-objects as value to a dart map
  static Map<String, List<BookSubBookSummary>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookSubBookSummary>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookSubBookSummary.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'subBookId',
    'title',
    'order',
    'chapterCount',
    'chapters',
  };
}

