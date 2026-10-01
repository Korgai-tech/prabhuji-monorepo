//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookContentsResponseInputData {
  /// Returns a new [BookContentsResponseInputData] instance.
  BookContentsResponseInputData({
    required this.contentId,
    required this.title,
    required this.coverImageUrl,
    required this.author,
    this.languages = const [],
    required this.offlineCacheEligible,
    this.subBooks = const [],
    this.chapters = const [],
    required this.totalChapterCount,
  });

  String contentId;

  String title;

  String coverImageUrl;

  String? author;

  List<String> languages;

  bool offlineCacheEligible;

  List<BookSubBookSummaryInput> subBooks;

  List<BookChapterSummaryInput> chapters;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int totalChapterCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookContentsResponseInputData &&
    other.contentId == contentId &&
    other.title == title &&
    other.coverImageUrl == coverImageUrl &&
    other.author == author &&
    _deepEquality.equals(other.languages, languages) &&
    other.offlineCacheEligible == offlineCacheEligible &&
    _deepEquality.equals(other.subBooks, subBooks) &&
    _deepEquality.equals(other.chapters, chapters) &&
    other.totalChapterCount == totalChapterCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (contentId.hashCode) +
    (title.hashCode) +
    (coverImageUrl.hashCode) +
    (author == null ? 0 : author!.hashCode) +
    (languages.hashCode) +
    (offlineCacheEligible.hashCode) +
    (subBooks.hashCode) +
    (chapters.hashCode) +
    (totalChapterCount.hashCode);

  @override
  String toString() => 'BookContentsResponseInputData[contentId=$contentId, title=$title, coverImageUrl=$coverImageUrl, author=$author, languages=$languages, offlineCacheEligible=$offlineCacheEligible, subBooks=$subBooks, chapters=$chapters, totalChapterCount=$totalChapterCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'contentId'] = this.contentId;
      json[r'title'] = this.title;
      json[r'coverImageUrl'] = this.coverImageUrl;
    if (this.author != null) {
      json[r'author'] = this.author;
    } else {
      json[r'author'] = null;
    }
      json[r'languages'] = this.languages;
      json[r'offlineCacheEligible'] = this.offlineCacheEligible;
      json[r'subBooks'] = this.subBooks;
      json[r'chapters'] = this.chapters;
      json[r'totalChapterCount'] = this.totalChapterCount;
    return json;
  }

  /// Returns a new [BookContentsResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookContentsResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'contentId'), 'Required key "BookContentsResponseInputData[contentId]" is missing from JSON.');
        assert(json[r'contentId'] != null, 'Required key "BookContentsResponseInputData[contentId]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookContentsResponseInputData[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookContentsResponseInputData[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "BookContentsResponseInputData[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "BookContentsResponseInputData[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'author'), 'Required key "BookContentsResponseInputData[author]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "BookContentsResponseInputData[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "BookContentsResponseInputData[languages]" has a null value in JSON.');
        assert(json.containsKey(r'offlineCacheEligible'), 'Required key "BookContentsResponseInputData[offlineCacheEligible]" is missing from JSON.');
        assert(json[r'offlineCacheEligible'] != null, 'Required key "BookContentsResponseInputData[offlineCacheEligible]" has a null value in JSON.');
        assert(json.containsKey(r'subBooks'), 'Required key "BookContentsResponseInputData[subBooks]" is missing from JSON.');
        assert(json[r'subBooks'] != null, 'Required key "BookContentsResponseInputData[subBooks]" has a null value in JSON.');
        assert(json.containsKey(r'chapters'), 'Required key "BookContentsResponseInputData[chapters]" is missing from JSON.');
        assert(json[r'chapters'] != null, 'Required key "BookContentsResponseInputData[chapters]" has a null value in JSON.');
        assert(json.containsKey(r'totalChapterCount'), 'Required key "BookContentsResponseInputData[totalChapterCount]" is missing from JSON.');
        assert(json[r'totalChapterCount'] != null, 'Required key "BookContentsResponseInputData[totalChapterCount]" has a null value in JSON.');
        return true;
      }());

      return BookContentsResponseInputData(
        contentId: mapValueOfType<String>(json, r'contentId')!,
        title: mapValueOfType<String>(json, r'title')!,
        coverImageUrl: mapValueOfType<String>(json, r'coverImageUrl')!,
        author: mapValueOfType<String>(json, r'author'),
        languages: json[r'languages'] is Iterable
            ? (json[r'languages'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        offlineCacheEligible: mapValueOfType<bool>(json, r'offlineCacheEligible')!,
        subBooks: BookSubBookSummaryInput.listFromJson(json[r'subBooks']),
        chapters: BookChapterSummaryInput.listFromJson(json[r'chapters']),
        totalChapterCount: mapValueOfType<int>(json, r'totalChapterCount')!,
      );
    }
    return null;
  }

  static List<BookContentsResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookContentsResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookContentsResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookContentsResponseInputData> mapFromJson(dynamic json) {
    final map = <String, BookContentsResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookContentsResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookContentsResponseInputData-objects as value to a dart map
  static Map<String, List<BookContentsResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookContentsResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookContentsResponseInputData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'contentId',
    'title',
    'coverImageUrl',
    'author',
    'languages',
    'offlineCacheEligible',
    'subBooks',
    'chapters',
    'totalChapterCount',
  };
}

