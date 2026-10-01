//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookChapterSummaryInput {
  /// Returns a new [BookChapterSummaryInput] instance.
  BookChapterSummaryInput({
    required this.chapterId,
    required this.title,
    required this.order,
    required this.hasAudio,
  });

  String chapterId;

  String title;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int order;

  bool hasAudio;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookChapterSummaryInput &&
    other.chapterId == chapterId &&
    other.title == title &&
    other.order == order &&
    other.hasAudio == hasAudio;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (chapterId.hashCode) +
    (title.hashCode) +
    (order.hashCode) +
    (hasAudio.hashCode);

  @override
  String toString() => 'BookChapterSummaryInput[chapterId=$chapterId, title=$title, order=$order, hasAudio=$hasAudio]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'chapterId'] = this.chapterId;
      json[r'title'] = this.title;
      json[r'order'] = this.order;
      json[r'hasAudio'] = this.hasAudio;
    return json;
  }

  /// Returns a new [BookChapterSummaryInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookChapterSummaryInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'chapterId'), 'Required key "BookChapterSummaryInput[chapterId]" is missing from JSON.');
        assert(json[r'chapterId'] != null, 'Required key "BookChapterSummaryInput[chapterId]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookChapterSummaryInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookChapterSummaryInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'order'), 'Required key "BookChapterSummaryInput[order]" is missing from JSON.');
        assert(json[r'order'] != null, 'Required key "BookChapterSummaryInput[order]" has a null value in JSON.');
        assert(json.containsKey(r'hasAudio'), 'Required key "BookChapterSummaryInput[hasAudio]" is missing from JSON.');
        assert(json[r'hasAudio'] != null, 'Required key "BookChapterSummaryInput[hasAudio]" has a null value in JSON.');
        return true;
      }());

      return BookChapterSummaryInput(
        chapterId: mapValueOfType<String>(json, r'chapterId')!,
        title: mapValueOfType<String>(json, r'title')!,
        order: mapValueOfType<int>(json, r'order')!,
        hasAudio: mapValueOfType<bool>(json, r'hasAudio')!,
      );
    }
    return null;
  }

  static List<BookChapterSummaryInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookChapterSummaryInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookChapterSummaryInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookChapterSummaryInput> mapFromJson(dynamic json) {
    final map = <String, BookChapterSummaryInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookChapterSummaryInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookChapterSummaryInput-objects as value to a dart map
  static Map<String, List<BookChapterSummaryInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookChapterSummaryInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookChapterSummaryInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'chapterId',
    'title',
    'order',
    'hasAudio',
  };
}

