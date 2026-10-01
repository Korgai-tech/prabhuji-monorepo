//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LanguageCatalogResponseInputData {
  /// Returns a new [LanguageCatalogResponseInputData] instance.
  LanguageCatalogResponseInputData({
    this.languages = const [],
    required this.defaultCode,
  });

  List<LanguageOptionViewInput> languages;

  LanguageCodeInput defaultCode;

  @override
  bool operator ==(Object other) => identical(this, other) || other is LanguageCatalogResponseInputData &&
    _deepEquality.equals(other.languages, languages) &&
    other.defaultCode == defaultCode;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (languages.hashCode) +
    (defaultCode.hashCode);

  @override
  String toString() => 'LanguageCatalogResponseInputData[languages=$languages, defaultCode=$defaultCode]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'languages'] = this.languages;
      json[r'defaultCode'] = this.defaultCode;
    return json;
  }

  /// Returns a new [LanguageCatalogResponseInputData] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LanguageCatalogResponseInputData? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'languages'), 'Required key "LanguageCatalogResponseInputData[languages]" is missing from JSON.');
        assert(json[r'languages'] != null, 'Required key "LanguageCatalogResponseInputData[languages]" has a null value in JSON.');
        assert(json.containsKey(r'defaultCode'), 'Required key "LanguageCatalogResponseInputData[defaultCode]" is missing from JSON.');
        assert(json[r'defaultCode'] != null, 'Required key "LanguageCatalogResponseInputData[defaultCode]" has a null value in JSON.');
        return true;
      }());

      return LanguageCatalogResponseInputData(
        languages: LanguageOptionViewInput.listFromJson(json[r'languages']),
        defaultCode: LanguageCodeInput.fromJson(json[r'defaultCode'])!,
      );
    }
    return null;
  }

  static List<LanguageCatalogResponseInputData> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <LanguageCatalogResponseInputData>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LanguageCatalogResponseInputData.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LanguageCatalogResponseInputData> mapFromJson(dynamic json) {
    final map = <String, LanguageCatalogResponseInputData>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = LanguageCatalogResponseInputData.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LanguageCatalogResponseInputData-objects as value to a dart map
  static Map<String, List<LanguageCatalogResponseInputData>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<LanguageCatalogResponseInputData>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LanguageCatalogResponseInputData.listFromJson(entry.value, growable: growable,);
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

