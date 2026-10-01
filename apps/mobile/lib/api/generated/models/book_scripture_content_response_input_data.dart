//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class BookScriptureContentResponseInputData {
  /// Returns a new [BookScriptureContentResponseInputData] instance.
  BookScriptureContentResponseInputData({
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

  BookScriptureContentResponseInputDataCategoryEnum? category;

  String title;

  String coverImageUrl;

  String? author;

  List<String> languages;

  String contentBody;

  bool offlineCacheEligible;

  @override
  bool operator ==(Object other) => identical(this, other) || other is BookScriptureContentResponseInputData &&
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
  String toString() => 'BookScriptureContentResponseInputData[contentId=$contentId, category=$category, title=$title, coverImageUrl=$coverImageUrl, author=$author, languages=$languages, contentBody=$contentBody, offlineCacheEligible=$offlineCacheEligible]';

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

  /// Returns a new [BookScriptureContentResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static BookScriptureContentResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'contentId'), 'Required key "BookScriptureContentResponseInputData[contentId]" is missing from JSON.');
        assert(json[r'contentId'] != null, 'Required key "BookScriptureContentResponseInputData[contentId]" has a null value in JSON.');
        assert(json.containsKey(r'category'), 'Required key "BookScriptureContentResponseInputData[category]" is missing from JSON.');
        assert(json.containsKey(r'title'), 'Required key "BookScriptureContentResponseInputData[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "BookScriptureContentResponseInputData[title]" has a null value in JSON.');
        assert(json.containsKey(r'coverImageUrl'), 'Required key "BookScriptureContentResponseInputData[coverImageUrl]" is missing from JSON.');
        assert(json[r'coverImageUrl'] != null, 'Required key "BookScriptureContentResponseInputData[coverImageUrl]" has a null value in JSON.');
        assert(json.containsKey(r'author'), 'Required key "BookScriptureContentResponseInputData[author]" is missing from JSON.');
        assert(json.containsKey(r'languages'), 'Required key "BookScriptureContentResponseInputData[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "BookScriptureContentResponseInputData[languages]" has a null value in JSON.');
        assert(json.containsKey(r'contentBody'), 'Required key "BookScriptureContentResponseInputData[contentBody]" is missing from JSON.');
        assert(json[r'contentBody'] != null, 'Required key "BookScriptureContentResponseInputData[contentBody]" has a null value in JSON.');
        assert(json.containsKey(r'offlineCacheEligible'), 'Required key "BookScriptureContentResponseInputData[offlineCacheEligible]" is missing from JSON.');
        assert(json[r'offlineCacheEligible'] != null, 'Required key "BookScriptureContentResponseInputData[offlineCacheEligible]" has a null value in JSON.');
        return true;
      }());

      return BookScriptureContentResponseInputData(
        contentId: mapValueOfType<String>(json, r'contentId')!,
        category: BookScriptureContentResponseInputDataCategoryEnum.fromJson(json[r'category']),
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

  static List<BookScriptureContentResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookScriptureContentResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookScriptureContentResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, BookScriptureContentResponseInputData> mapFromJson(dynamic json) {
    final map = <String, BookScriptureContentResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = BookScriptureContentResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of BookScriptureContentResponseInputData-objects as value to a dart map
  static Map<String, List<BookScriptureContentResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<BookScriptureContentResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = BookScriptureContentResponseInputData.listFromJson(entry.value, growable: growable,);
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


class BookScriptureContentResponseInputDataCategoryEnum {
  /// Instantiate a new enum with the provided [value].
  const BookScriptureContentResponseInputDataCategoryEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const chalisa = BookScriptureContentResponseInputDataCategoryEnum._(r'Chalisa');
  static const aarti = BookScriptureContentResponseInputDataCategoryEnum._(r'Aarti');
  static const kavach = BookScriptureContentResponseInputDataCategoryEnum._(r'Kavach');
  static const stotram = BookScriptureContentResponseInputDataCategoryEnum._(r'Stotram');

  /// List of all possible values in this [enum][BookScriptureContentResponseInputDataCategoryEnum].
  static const values = <BookScriptureContentResponseInputDataCategoryEnum>[
    chalisa,
    aarti,
    kavach,
    stotram,
  ];

  static BookScriptureContentResponseInputDataCategoryEnum? fromJson(dynamic value) => BookScriptureContentResponseInputDataCategoryEnumTypeTransformer().decode(value);

  static List<BookScriptureContentResponseInputDataCategoryEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <BookScriptureContentResponseInputDataCategoryEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = BookScriptureContentResponseInputDataCategoryEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [BookScriptureContentResponseInputDataCategoryEnum] to String,
/// and [decode] dynamic data back to [BookScriptureContentResponseInputDataCategoryEnum].
class BookScriptureContentResponseInputDataCategoryEnumTypeTransformer {
  factory BookScriptureContentResponseInputDataCategoryEnumTypeTransformer() => _instance ??= const BookScriptureContentResponseInputDataCategoryEnumTypeTransformer._();

  const BookScriptureContentResponseInputDataCategoryEnumTypeTransformer._();

  String encode(BookScriptureContentResponseInputDataCategoryEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a BookScriptureContentResponseInputDataCategoryEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  BookScriptureContentResponseInputDataCategoryEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'Chalisa': return BookScriptureContentResponseInputDataCategoryEnum.chalisa;
        case r'Aarti': return BookScriptureContentResponseInputDataCategoryEnum.aarti;
        case r'Kavach': return BookScriptureContentResponseInputDataCategoryEnum.kavach;
        case r'Stotram': return BookScriptureContentResponseInputDataCategoryEnum.stotram;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [BookScriptureContentResponseInputDataCategoryEnumTypeTransformer] instance.
  static BookScriptureContentResponseInputDataCategoryEnumTypeTransformer? _instance;
}


