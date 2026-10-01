//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LanguageCatalogResponseData {
  /// Returns a new [LanguageCatalogResponseData] instance.
  LanguageCatalogResponseData({
    this.languages = const [],
    required this.defaultCode,
  });

  List<LanguageOptionView> languages;

  LanguageCode defaultCode;

  @override
  bool operator ==(Object other) => identical(this, other) || other is LanguageCatalogResponseData &&
    _deepEquality.equals(other.languages, languages) &&
    other.defaultCode == defaultCode;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (languages.hashCode) +
    (defaultCode.hashCode);

  @override
  String toString() => 'LanguageCatalogResponseData[languages=$languages, defaultCode=$defaultCode]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'languages'] = this.languages;
      json[r'defaultCode'] = this.defaultCode;
    return json;
  }

  /// Returns a new [LanguageCatalogResponseData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LanguageCatalogResponseData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'languages'), 'Required key "LanguageCatalogResponseData[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "LanguageCatalogResponseData[languages]" has a null value in JSON.');
        assert(json.containsKey(r'defaultCode'), 'Required key "LanguageCatalogResponseData[defaultCode]" is missing from JSON.');
        assert(json[r'defaultCode'] != null, 'Required key "LanguageCatalogResponseData[defaultCode]" has a null value in JSON.');
        return true;
      }());

      return LanguageCatalogResponseData(
        languages: LanguageOptionView.listFromJson(json[r'languages']),
        defaultCode: LanguageCode.fromJson(json[r'defaultCode'])!,
      );
    }
    return null;
  }

  static List<LanguageCatalogResponseData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <LanguageCatalogResponseData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LanguageCatalogResponseData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LanguageCatalogResponseData> mapFromJson(dynamic json) {
    final map = <String, LanguageCatalogResponseData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = LanguageCatalogResponseData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LanguageCatalogResponseData-objects as value to a dart map
  static Map<String, List<LanguageCatalogResponseData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<LanguageCatalogResponseData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LanguageCatalogResponseData.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'languages',
    'defaultCode',
  };
}

