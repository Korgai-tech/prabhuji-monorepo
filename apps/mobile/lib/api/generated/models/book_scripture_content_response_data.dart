//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookScriptureContentResponseData {
  /// Returns a new [BookScriptureContentResponseData] instance.
  BookScriptureContentResponseData({
    required this.contentId,
    required this.category,
    required this.title,
    required this.coverImageUrl,
    required this.author,
    this.languages = const [],
    required this.contentBody,
    required this.offlineCacheEligible,
  });

  String contentId;

  BookScriptureContentResponseDataCategoryEnum? category;

  String title;

  String coverImageUrl;

  String? author;

  List<String> languages;

  String contentBody;

  bool offlineCacheEligible;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookScriptureContentResponseData &&
    other.contentId == contentId &&
    other.category == category &&
    other.title == title &&
    other.coverImageUrl == coverImageUrl &&
    other.author == author &&
    _deepEquality.equals(other.languages, languages) &&
    other.contentBody == contentBody &&
    other.offlineCacheEligible == offlineCacheEligible;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (contentId.hashCode) +
    (category == null ? 0 : category!.hashCode) +
    (title.hashCode) +
    (coverImageUrl.hashCode) +
    (author == null ? 0 : author!.hashCode) +
    (languages.hashCode) +
    (contentBody.hashCode) +
    (offlineCacheEligible.hashCode);

  @override
  String toString() => 'BookScriptureContentResponseData[contentId=$contentId, category=$category, title=$title, coverImageUrl=$coverImageUrl, author=$author, languages=$languages, contentBody=$contentBody, offlineCacheEligible=$offlineCacheEligible]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'contentId'] = this.contentId;
    if (this.category != null) {
      json[r'category'] = this.category;
    } else {
      json[r'category'] = null;
    }
      json[r'title'] = this.title;
      json[r'coverImageUrl'] = this.coverImageUrl;
    if (this.author != null) {
      json[r'author'] = this.author;
    } else {
      json[r'author'] = null;
    }
      json[r'languages'] = this.languages;
      json[r'contentBody'] = this.contentBody;
      json[r'offlineCacheEligible'] = this.offlineCacheEligible;
    return json;
  }

  /// Returns a new [BookScriptureContentResponseData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookScriptureContentResponseData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'contentId'), 'Required key "BookScriptureContentResponseData[contentId]" is missing from JSON.');
        assert(json[r'contentId'] != null, 'Required key "BookScriptureContentResponseData[contentId]" has a null value in JSON.');
        assert(json.containsKey(r'category'), 'Required key "BookScriptureContentResponseData[category]" is missing from JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookScriptureContentResponseData[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookScriptureContentResponseData[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "BookScriptureContentResponseData[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "BookScriptureContentResponseData[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'author'), 'Required key "BookScriptureContentResponseData[author]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "BookScriptureContentResponseData[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "BookScriptureContentResponseData[languages]" has a null value in JSON.');
        assert(json.containsKey(r'contentBody'), 'Required key "BookScriptureContentResponseData[contentBody]" is missing from JSON.');
        assert(json[r'contentBody'] != null, 'Required key "BookScriptureContentResponseData[contentBody]" has a null value in JSON.');
        assert(json.containsKey(r'offlineCacheEligible'), 'Required key "BookScriptureContentResponseData[offlineCacheEligible]" is missing from JSON.');
        assert(json[r'offlineCacheEligible'] != null, 'Required key "BookScriptureContentResponseData[offlineCacheEligible]" has a null value in JSON.');
        return true;
      }());

      return BookScriptureContentResponseData(
        contentId: mapValueOfType<String>(json, r'contentId')!,
        category: BookScriptureContentResponseDataCategoryEnum.fromJson(json[r'category']),
        title: mapValueOfType<String>(json, r'title')!,
        coverImageUrl: mapValueOfType<String>(json, r'coverImageUrl')!,
        author: mapValueOfType<String>(json, r'author'),
        languages: json[r'languages'] is Iterable
            ? (json[r'languages'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        contentBody: mapValueOfType<String>(json, r'contentBody')!,
        offlineCacheEligible: mapValueOfType<bool>(json, r'offlineCacheEligible')!,
      );
    }
    return null;
  }

  static List<BookScriptureContentResponseData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookScriptureContentResponseData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookScriptureContentResponseData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookScriptureContentResponseData> mapFromJson(dynamic json) {
    final map = <String, BookScriptureContentResponseData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookScriptureContentResponseData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookScriptureContentResponseData-objects as value to a dart map
  static Map<String, List<BookScriptureContentResponseData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookScriptureContentResponseData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookScriptureContentResponseData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'contentId',
    'category',
    'title',
    'coverImageUrl',
    'author',
    'languages',
    'contentBody',
    'offlineCacheEligible',
  };
}


class BookScriptureContentResponseDataCategoryEnum {
  /// Instantiate a new enum with the provided [value].
  const BookScriptureContentResponseDataCategoryEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const chalisa = BookScriptureContentResponseDataCategoryEnum._(r'Chalisa');
  static const aarti = BookScriptureContentResponseDataCategoryEnum._(r'Aarti');
  static const kavach = BookScriptureContentResponseDataCategoryEnum._(r'Kavach');
  static const stotram = BookScriptureContentResponseDataCategoryEnum._(r'Stotram');

  /// List of all possible values in this [enum][BookScriptureContentResponseDataCategoryEnum].
  static const values = <BookScriptureContentResponseDataCategoryEnum>[
    chalisa,
    aarti,
    kavach,
    stotram,
  ];

  static BookScriptureContentResponseDataCategoryEnum? fromJson(dynamic value) => BookScriptureContentResponseDataCategoryEnumTypeTransformer().decode(value);

  static List<BookScriptureContentResponseDataCategoryEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookScriptureContentResponseDataCategoryEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookScriptureContentResponseDataCategoryEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookScriptureContentResponseDataCategoryEnum] to String,
/// and [decode] dynamic data back to [BookScriptureContentResponseDataCategoryEnum].
class BookScriptureContentResponseDataCategoryEnumTypeTransformer {
  factory BookScriptureContentResponseDataCategoryEnumTypeTransformer() => _instance ??= const BookScriptureContentResponseDataCategoryEnumTypeTransformer._();

  const BookScriptureContentResponseDataCategoryEnumTypeTransformer._();

  String encode(BookScriptureContentResponseDataCategoryEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookScriptureContentResponseDataCategoryEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookScriptureContentResponseDataCategoryEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'Chalisa': return BookScriptureContentResponseDataCategoryEnum.chalisa;
        case r'Aarti': return BookScriptureContentResponseDataCategoryEnum.aarti;
        case r'Kavach': return BookScriptureContentResponseDataCategoryEnum.kavach;
        case r'Stotram': return BookScriptureContentResponseDataCategoryEnum.stotram;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookScriptureContentResponseDataCategoryEnumTypeTransformer] instance.
  static BookScriptureContentResponseDataCategoryEnumTypeTransformer? _instance;
}


