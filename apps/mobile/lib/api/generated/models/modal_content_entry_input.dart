//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ModalContentEntryInput {
  /// Returns a new [ModalContentEntryInput] instance.
  ModalContentEntryInput({
    required this.title,
    this.body,
    this.imageUrl,
    required this.ctaText,
    required this.ctaDeeplink,
  });

  String title;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? body;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? imageUrl;

  String ctaText;

  String ctaDeeplink;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ModalContentEntryInput &&
    other.title == title &&
    other.body == body &&
    other.imageUrl == imageUrl &&
    other.ctaText == ctaText &&
    other.ctaDeeplink == ctaDeeplink;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (title.hashCode) +
    (body == null ? 0 : body!.hashCode) +
    (imageUrl == null ? 0 : imageUrl!.hashCode) +
    (ctaText.hashCode) +
    (ctaDeeplink.hashCode);

  @override
  String toString() => 'ModalContentEntryInput[title=$title, body=$body, imageUrl=$imageUrl, ctaText=$ctaText, ctaDeeplink=$ctaDeeplink]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'title'] = this.title;
    if (this.body != null) {
      json[r'body'] = this.body;
    } else {
      json[r'body'] = null;
    }
    if (this.imageUrl != null) {
      json[r'imageUrl'] = this.imageUrl;
    } else {
      json[r'imageUrl'] = null;
    }
      json[r'ctaText'] = this.ctaText;
      json[r'ctaDeeplink'] = this.ctaDeeplink;
    return json;
  }

  /// Returns a new [ModalContentEntryInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ModalContentEntryInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'title'), 'Required key "ModalContentEntryInput[title]" is missing from JSON.');
        assert(json[r'title'] != null, 'Required key "ModalContentEntryInput[title]" has a null value in JSON.');
        assert(json.containsKey(r'ctaText'), 'Required key "ModalContentEntryInput[ctaText]" is missing from JSON.');
        assert(json[r'ctaText'] != null, 'Required key "ModalContentEntryInput[ctaText]" has a null value in JSON.');
        assert(json.containsKey(r'ctaDeeplink'), 'Required key "ModalContentEntryInput[ctaDeeplink]" is missing from JSON.');
        assert(json[r'ctaDeeplink'] != null, 'Required key "ModalContentEntryInput[ctaDeeplink]" has a null value in JSON.');
        return true;
      }());

      return ModalContentEntryInput(
        title: mapValueOfType<String>(json, r'title')!,
        body: mapValueOfType<String>(json, r'body'),
        imageUrl: mapValueOfType<String>(json, r'imageUrl'),
        ctaText: mapValueOfType<String>(json, r'ctaText')!,
        ctaDeeplink: mapValueOfType<String>(json, r'ctaDeeplink')!,
      );
    }
    return null;
  }

  static List<ModalContentEntryInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ModalContentEntryInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ModalContentEntryInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ModalContentEntryInput> mapFromJson(dynamic json) {
    final map = <String, ModalContentEntryInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ModalContentEntryInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ModalContentEntryInput-objects as value to a dart map
  static Map<String, List<ModalContentEntryInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ModalContentEntryInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ModalContentEntryInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'title',
    'ctaText',
    'ctaDeeplink',
  };
}

