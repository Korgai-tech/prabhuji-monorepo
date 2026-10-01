//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class HomeShortcutThemeInput {
  /// Returns a new [HomeShortcutThemeInput] instance.
  HomeShortcutThemeInput({
    required this.backgroundFrom,
    required this.backgroundFromStop,
    required this.backgroundTo,
    required this.backgroundToStop,
    required this.labelColor,
  });

  /// Gradient top colour, `#RRGGBB`.
  String backgroundFrom;

  /// Fraction down the card where `backgroundFrom` sits. May be negative.
  ///
  /// Minimum value: -1
  /// Maximum value: 3
  num backgroundFromStop;

  /// Gradient bottom colour, `#RRGGBB`.
  String backgroundTo;

  /// Fraction down the card where `backgroundTo` sits. MAY EXCEED 1 (e.g. 1.4734) — map to `Alignment`, never to Flutter `stops`.
  ///
  /// Minimum value: -1
  /// Maximum value: 3
  num backgroundToStop;

  /// Tile label colour, `#RRGGBB`.
  String labelColor;

  @override
  bool operator ==(Object other) => identical(this, other) || other is HomeShortcutThemeInput &&
    other.backgroundFrom == backgroundFrom &&
    other.backgroundFromStop == backgroundFromStop &&
    other.backgroundTo == backgroundTo &&
    other.backgroundToStop == backgroundToStop &&
    other.labelColor == labelColor;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (backgroundFrom.hashCode) +
    (backgroundFromStop.hashCode) +
    (backgroundTo.hashCode) +
    (backgroundToStop.hashCode) +
    (labelColor.hashCode);

  @override
  String toString() => 'HomeShortcutThemeInput[backgroundFrom=$backgroundFrom, backgroundFromStop=$backgroundFromStop, backgroundTo=$backgroundTo, backgroundToStop=$backgroundToStop, labelColor=$labelColor]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'backgroundFrom'] = this.backgroundFrom;
      json[r'backgroundFromStop'] = this.backgroundFromStop;
      json[r'backgroundTo'] = this.backgroundTo;
      json[r'backgroundToStop'] = this.backgroundToStop;
      json[r'labelColor'] = this.labelColor;
    return json;
  }

  /// Returns a new [HomeShortcutThemeInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static HomeShortcutThemeInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'backgroundFrom'), 'Required key "HomeShortcutThemeInput[backgroundFrom]" is missing from JSON.');
        assert(json[r'backgroundFrom'] != null, 'Required key "HomeShortcutThemeInput[backgroundFrom]" has a null value in JSON.');
        assert(json.containsKey(r'backgroundFromStop'), 'Required key "HomeShortcutThemeInput[backgroundFromStop]" is missing from JSON.');
        assert(json[r'backgroundFromStop'] != null, 'Required key "HomeShortcutThemeInput[backgroundFromStop]" has a null value in JSON.');
        assert(json.containsKey(r'backgroundTo'), 'Required key "HomeShortcutThemeInput[backgroundTo]" is missing from JSON.');
        assert(json[r'backgroundTo'] != null, 'Required key "HomeShortcutThemeInput[backgroundTo]" has a null value in JSON.');
        assert(json.containsKey(r'backgroundToStop'), 'Required key "HomeShortcutThemeInput[backgroundToStop]" is missing from JSON.');
        assert(json[r'backgroundToStop'] != null, 'Required key "HomeShortcutThemeInput[backgroundToStop]" has a null value in JSON.');
        assert(json.containsKey(r'labelColor'), 'Required key "HomeShortcutThemeInput[labelColor]" is missing from JSON.');
        assert(json[r'labelColor'] != null, 'Required key "HomeShortcutThemeInput[labelColor]" has a null value in JSON.');
        return true;
      }());

      return HomeShortcutThemeInput(
        backgroundFrom: mapValueOfType<String>(json, r'backgroundFrom')!,
        backgroundFromStop: num.parse('${json[r'backgroundFromStop']}'),
        backgroundTo: mapValueOfType<String>(json, r'backgroundTo')!,
        backgroundToStop: num.parse('${json[r'backgroundToStop']}'),
        labelColor: mapValueOfType<String>(json, r'labelColor')!,
      );
    }
    return null;
  }

  static List<HomeShortcutThemeInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <HomeShortcutThemeInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = HomeShortcutThemeInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, HomeShortcutThemeInput> mapFromJson(dynamic json) {
    final map = <String, HomeShortcutThemeInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = HomeShortcutThemeInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of HomeShortcutThemeInput-objects as value to a dart map
  static Map<String, List<HomeShortcutThemeInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<HomeShortcutThemeInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = HomeShortcutThemeInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'backgroundFrom',
    'backgroundFromStop',
    'backgroundTo',
    'backgroundToStop',
    'labelColor',
  };
}

