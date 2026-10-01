//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class UsersLanding {
  /// Returns a new [UsersLanding] instance.
  UsersLanding({
    required this.deeplink,
    required this.module,
    required this.source_,
    required this.utmCode,
  });

  String deeplink;

  String module;

  String source_;

  String utmCode;

  @override
  bool operator ==(Object other) => identical(this, other) || other is UsersLanding &&
    other.deeplink == deeplink &&
    other.module == module &&
    other.source_ == source_ &&
    other.utmCode == utmCode;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (deeplink.hashCode) +
    (module.hashCode) +
    (source_.hashCode) +
    (utmCode.hashCode);

  @override
  String toString() => 'UsersLanding[deeplink=$deeplink, module=$module, source_=$source_, utmCode=$utmCode]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'deeplink'] = this.deeplink;
      json[r'module'] = this.module;
      json[r'source'] = this.source_;
      json[r'utmCode'] = this.utmCode;
    return json;
  }

  /// Returns a new [UsersLanding] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static UsersLanding? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'deeplink'), 'Required key "UsersLanding[deeplink]" is missing from JSON.');
        assert(json[r'deeplink'] != null, 'Required key "UsersLanding[deeplink]" has a null value in JSON.');
        assert(json.containsKey(r'module'), 'Required key "UsersLanding[module]" is missing from JSON.');
        assert(json[r'module'] != null, 'Required key "UsersLanding[module]" has a null value in JSON.');
        assert(json.containsKey(r'source'), 'Required key "UsersLanding[source]" is missing from JSON.');
        assert(json[r'source'] != null, 'Required key "UsersLanding[source]" has a null value in JSON.');
        assert(json.containsKey(r'utmCode'), 'Required key "UsersLanding[utmCode]" is missing from JSON.');
        assert(json[r'utmCode'] != null, 'Required key "UsersLanding[utmCode]" has a null value in JSON.');
        return true;
      }());

      return UsersLanding(
        deeplink: mapValueOfType<String>(json, r'deeplink')!,
        module: mapValueOfType<String>(json, r'module')!,
        source_: mapValueOfType<String>(json, r'source')!,
        utmCode: mapValueOfType<String>(json, r'utmCode')!,
      );
    }
    return null;
  }

  static List<UsersLanding> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <UsersLanding>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = UsersLanding.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, UsersLanding> mapFromJson(dynamic json) {
    final map = <String, UsersLanding>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = UsersLanding.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of UsersLanding-objects as value to a dart map
  static Map<String, List<UsersLanding>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<UsersLanding>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = UsersLanding.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'deeplink',
    'module',
    'source',
    'utmCode',
  };
}

