//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ServableModal {
  /// Returns a new [ServableModal] instance.
  ServableModal({
    required this.key,
    required this.triggerSource,
    required this.showNumber,
    required this.lastOutcomeModule,
    required this.localeServed,
    required this.content,
  });

  String key;

  String triggerSource;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int showNumber;

  String? lastOutcomeModule;

  String localeServed;

  ModalContentEntry content;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ServableModal &&
    other.key == key &&
    other.triggerSource == triggerSource &&
    other.showNumber == showNumber &&
    other.lastOutcomeModule == lastOutcomeModule &&
    other.localeServed == localeServed &&
    other.content == content;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (key.hashCode) +
    (triggerSource.hashCode) +
    (showNumber.hashCode) +
    (lastOutcomeModule == null ? 0 : lastOutcomeModule!.hashCode) +
    (localeServed.hashCode) +
    (content.hashCode);

  @override
  String toString() => 'ServableModal[key=$key, triggerSource=$triggerSource, showNumber=$showNumber, lastOutcomeModule=$lastOutcomeModule, localeServed=$localeServed, content=$content]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'key'] = this.key;
      json[r'triggerSource'] = this.triggerSource;
      json[r'showNumber'] = this.showNumber;
    if (this.lastOutcomeModule != null) {
      json[r'lastOutcomeModule'] = this.lastOutcomeModule;
    } else {
      json[r'lastOutcomeModule'] = null;
    }
      json[r'localeServed'] = this.localeServed;
      json[r'content'] = this.content;
    return json;
  }

  /// Returns a new [ServableModal] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ServableModal? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'key'), 'Required key "ServableModal[key]" is missing from JSON.');
        assert(json[r'key'] != null, 'Required key "ServableModal[key]" has a null value in JSON.');
        assert(json.containsKey(r'triggerSource'), 'Required key "ServableModal[triggerSource]" is missing from JSON.');
        assert(json[r'triggerSource'] != null, 'Required key "ServableModal[triggerSource]" has a null value in JSON.');
        assert(json.containsKey(r'showNumber'), 'Required key "ServableModal[showNumber]" is missing from JSON.');
        assert(json[r'showNumber'] != null, 'Required key "ServableModal[showNumber]" has a null value in JSON.');
        assert(json.containsKey(r'lastOutcomeModule'), 'Required key "ServableModal[lastOutcomeModule]" is missing from JSON.');
        assert(json.containsKey(r'localeServed'), 'Required key "ServableModal[localeServed]" is missing from JSON.');
        assert(json[r'localeServed'] != null, 'Required key "ServableModal[localeServed]" has a null value in JSON.');
        assert(json.containsKey(r'content'), 'Required key "ServableModal[content]" is missing from JSON.');
        assert(json[r'content'] != null, 'Required key "ServableModal[content]" has a null value in JSON.');
        return true;
      }());

      return ServableModal(
        key: mapValueOfType<String>(json, r'key')!,
        triggerSource: mapValueOfType<String>(json, r'triggerSource')!,
        showNumber: mapValueOfType<int>(json, r'showNumber')!,
        lastOutcomeModule: mapValueOfType<String>(json, r'lastOutcomeModule'),
        localeServed: mapValueOfType<String>(json, r'localeServed')!,
        content: ModalContentEntry.fromJson(json[r'content'])!,
      );
    }
    return null;
  }

  static List<ServableModal> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ServableModal>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ServableModal.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ServableModal> mapFromJson(dynamic json) {
    final map = <String, ServableModal>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ServableModal.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ServableModal-objects as value to a dart map
  static Map<String, List<ServableModal>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ServableModal>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ServableModal.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'key',
    'triggerSource',
    'showNumber',
    'lastOutcomeModule',
    'localeServed',
    'content',
  };
}

