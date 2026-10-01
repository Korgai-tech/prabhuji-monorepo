//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookChapterContentResponseInputData {
  /// Returns a new [BookChapterContentResponseInputData] instance.
  BookChapterContentResponseInputData({
    required this.contentId,
    required this.chapterId,
    required this.title,
    required this.order,
    required this.bodyText,
    required this.audioUrl,
    required this.hasAudio,
    required this.offlineCacheEligible,
  });

  String contentId;

  String chapterId;

  String title;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int order;

  String bodyText;

  String? audioUrl;

  bool hasAudio;

  bool offlineCacheEligible;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookChapterContentResponseInputData &&
    other.contentId == contentId &&
    other.chapterId == chapterId &&
    other.title == title &&
    other.order == order &&
    other.bodyText == bodyText &&
    other.audioUrl == audioUrl &&
    other.hasAudio == hasAudio &&
    other.offlineCacheEligible == offlineCacheEligible;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (contentId.hashCode) +
    (chapterId.hashCode) +
    (title.hashCode) +
    (order.hashCode) +
    (bodyText.hashCode) +
    (audioUrl == null ? 0 : audioUrl!.hashCode) +
    (hasAudio.hashCode) +
    (offlineCacheEligible.hashCode);

  @override
  String toString() => 'BookChapterContentResponseInputData[contentId=$contentId, chapterId=$chapterId, title=$title, order=$order, bodyText=$bodyText, audioUrl=$audioUrl, hasAudio=$hasAudio, offlineCacheEligible=$offlineCacheEligible]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'contentId'] = this.contentId;
      json[r'chapterId'] = this.chapterId;
      json[r'title'] = this.title;
      json[r'order'] = this.order;
      json[r'bodyText'] = this.bodyText;
    if (this.audioUrl != null) {
      json[r'audioUrl'] = this.audioUrl;
    } else {
      json[r'audioUrl'] = null;
    }
      json[r'hasAudio'] = this.hasAudio;
      json[r'offlineCacheEligible'] = this.offlineCacheEligible;
    return json;
  }

  /// Returns a new [BookChapterContentResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookChapterContentResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'contentId'), 'Required key "BookChapterContentResponseInputData[contentId]" is missing from JSON.');
        assert(json[r'contentId'] != null, 'Required key "BookChapterContentResponseInputData[contentId]" has a null value in JSON.');
        assert(json.containsKey(r'chapterId'), 'Required key "BookChapterContentResponseInputData[chapterId]" is missing from JSON.');
        assert(json[r'chapterId'] != null, 'Required key "BookChapterContentResponseInputData[chapterId]" has a null value in JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookChapterContentResponseInputData[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookChapterContentResponseInputData[title]" has a null value in JSON.');
        assert(json.containsKey(r'order'), 'Required key "BookChapterContentResponseInputData[order]" is missing from JSON.');
        assert(json[r'order'] != null, 'Required key "BookChapterContentResponseInputData[order]" has a null value in JSON.');
        assert(json.containsKey(r'bodyText'), 'Required key "BookChapterContentResponseInputData[bodyText]" is missing from JSON.');
        assert(json[r'bodyText'] != null, 'Required key "BookChapterContentResponseInputData[bodyText]" has a null value in JSON.');
        assert(json.containsKey(r'audioUrl'), 'Required key "BookChapterContentResponseInputData[audioUrl]" is missing from JSON.');
        assert(json.containsKey(r'hasAudio'), 'Required key "BookChapterContentResponseInputData[hasAudio]" is missing from JSON.');
        assert(json[r'hasAudio'] != null, 'Required key "BookChapterContentResponseInputData[hasAudio]" has a null value in JSON.');
        assert(json.containsKey(r'offlineCacheEligible'), 'Required key "BookChapterContentResponseInputData[offlineCacheEligible]" is missing from JSON.');
        assert(json[r'offlineCacheEligible'] != null, 'Required key "BookChapterContentResponseInputData[offlineCacheEligible]" has a null value in JSON.');
        return true;
      }());

      return BookChapterContentResponseInputData(
        contentId: mapValueOfType<String>(json, r'contentId')!,
        chapterId: mapValueOfType<String>(json, r'chapterId')!,
        title: mapValueOfType<String>(json, r'title')!,
        order: mapValueOfType<int>(json, r'order')!,
        bodyText: mapValueOfType<String>(json, r'bodyText')!,
        audioUrl: mapValueOfType<String>(json, r'audioUrl'),
        hasAudio: mapValueOfType<bool>(json, r'hasAudio')!,
        offlineCacheEligible: mapValueOfType<bool>(json, r'offlineCacheEligible')!,
      );
    }
    return null;
  }

  static List<BookChapterContentResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookChapterContentResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookChapterContentResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookChapterContentResponseInputData> mapFromJson(dynamic json) {
    final map = <String, BookChapterContentResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookChapterContentResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookChapterContentResponseInputData-objects as value to a dart map
  static Map<String, List<BookChapterContentResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookChapterContentResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookChapterContentResponseInputData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'contentId',
    'chapterId',
    'title',
    'order',
    'bodyText',
    'audioUrl',
    'hasAudio',
    'offlineCacheEligible',
  };
}

