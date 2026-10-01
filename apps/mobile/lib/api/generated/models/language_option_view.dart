//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LanguageOptionView {
  /// Returns a new [LanguageOptionView] instance.
  LanguageOptionView({
    required this.code,
    required this.nativeLabel,
    required this.englishLabel,
  });

  LanguageCode code;

  String nativeLabel;

  String englishLabel;

  @override
  bool operator ==(Object other) => identical(this, other) || other is LanguageOptionView &&
    other.code == code &&
    other.nativeLabel == nativeLabel &&
    other.englishLabel == englishLabel;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (code.hashCode) +
    (nativeLabel.hashCode) +
    (englishLabel.hashCode);

  @override
  String toString() => 'LanguageOptionView[code=$code, nativeLabel=$nativeLabel, englishLabel=$englishLabel]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'code'] = this.code;
      json[r'nativeLabel'] = this.nativeLabel;
      json[r'englishLabel'] = this.englishLabel;
    return json;
  }

  /// Returns a new [LanguageOptionView] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LanguageOptionView? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'code'), 'Required key "LanguageOptionView[code]" is missing from JSON.');
        assert(json[r'code'] != null, 'Required key "LanguageOptionView[code]" has a null value in JSON.');
        assert(json.containsKey(r'nativeLabel'), 'Required key "LanguageOptionView[nativeLabel]" is missing from JSON.');
        assert(json[r'nativeLabel'] != null, 'Required key "LanguageOptionView[nativeLabel]" has a null value in JSON.');
        assert(json.containsKey(r'englishLabel'), 'Required key "LanguageOptionView[englishLabel]" is missing from JSON.');
        assert(json[r'englishLabel'] != null, 'Required key "LanguageOptionView[englishLabel]" has a null value in JSON.');
        return true;
      }());

      return LanguageOptionView(
        code: LanguageCode.fromJson(json[r'code'])!,
        nativeLabel: mapValueOfType<String>(json, r'nativeLabel')!,
        englishLabel: mapValueOfType<String>(json, r'englishLabel')!,
      );
    }
    return null;
  }

  static List<LanguageOptionView> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <LanguageOptionView>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LanguageOptionView.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LanguageOptionView> mapFromJson(dynamic json) {
    final map = <String, LanguageOptionView>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = LanguageOptionView.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LanguageOptionView-objects as value to a dart map
  static Map<String, List<LanguageOptionView>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<LanguageOptionView>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LanguageOptionView.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'code',
    'nativeLabel',
    'englishLabel',
  };
}

