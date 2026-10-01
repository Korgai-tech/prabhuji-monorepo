//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class DownloadManifestInput {
  /// Returns a new [DownloadManifestInput] instance.
  DownloadManifestInput({
    required this.signedUrl,
    required this.sizeBytes,
    required this.durationMs,
    required this.checksum,
    required this.expiresAt,
  });

  String signedUrl;

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  int sizeBytes;

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  int? durationMs;

  String? checksum;

  DateTime expiresAt;

  @override
  bool operator ==(Object other) => identical(this, other) || other is DownloadManifestInput &&
    other.signedUrl == signedUrl &&
    other.sizeBytes == sizeBytes &&
    other.durationMs == durationMs &&
    other.checksum == checksum &&
    other.expiresAt == expiresAt;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (signedUrl.hashCode) +
    (sizeBytes.hashCode) +
    (durationMs == null ? 0 : durationMs!.hashCode) +
    (checksum == null ? 0 : checksum!.hashCode) +
    (expiresAt.hashCode);

  @override
  String toString() => 'DownloadManifestInput[signedUrl=$signedUrl, sizeBytes=$sizeBytes, durationMs=$durationMs, checksum=$checksum, expiresAt=$expiresAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'signedUrl'] = this.signedUrl;
      json[r'sizeBytes'] = this.sizeBytes;
    if (this.durationMs != null) {
      json[r'durationMs'] = this.durationMs;
    } else {
      json[r'durationMs'] = null;
    }
    if (this.checksum != null) {
      json[r'checksum'] = this.checksum;
    } else {
      json[r'checksum'] = null;
    }
      json[r'expiresAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.expiresAt.millisecondsSinceEpoch
        : this.expiresAt.toUtc().toIso8601String();
    return json;
  }

  /// Returns a new [DownloadManifestInput] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static DownloadManifestInput? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'signedUrl'), 'Required key "DownloadManifestInput[signedUrl]" is missing from JSON.');
        assert(json[r'signedUrl'] != null, 'Required key "DownloadManifestInput[signedUrl]" has a null value in JSON.');
        assert(json.containsKey(r'sizeBytes'), 'Required key "DownloadManifestInput[sizeBytes]" is missing from JSON.');
        assert(json[r'sizeBytes'] != null, 'Required key "DownloadManifestInput[sizeBytes]" has a null value in JSON.');
        assert(json.containsKey(r'durationMs'), 'Required key "DownloadManifestInput[durationMs]" is missing from JSON.');
        assert(json.containsKey(r'checksum'), 'Required key "DownloadManifestInput[checksum]" is missing from JSON.');
        assert(json.containsKey(r'expiresAt'), 'Required key "DownloadManifestInput[expiresAt]" is missing from JSON.');
        assert(json[r'expiresAt'] != null, 'Required key "DownloadManifestInput[expiresAt]" has a null value in JSON.');
        return true;
      }());

      return DownloadManifestInput(
        signedUrl: mapValueOfType<String>(json, r'signedUrl')!,
        sizeBytes: mapValueOfType<int>(json, r'sizeBytes')!,
        durationMs: mapValueOfType<int>(json, r'durationMs'),
        checksum: mapValueOfType<String>(json, r'checksum'),
        expiresAt: mapDateTime(json, r'expiresAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')!,
      );
    }
    return null;
  }

  static List<DownloadManifestInput> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <DownloadManifestInput>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = DownloadManifestInput.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, DownloadManifestInput> mapFromJson(dynamic json) {
    final map = <String, DownloadManifestInput>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = DownloadManifestInput.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of DownloadManifestInput-objects as value to a dart map
  static Map<String, List<DownloadManifestInput>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<DownloadManifestInput>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = DownloadManifestInput.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'signedUrl',
    'sizeBytes',
    'durationMs',
    'checksum',
    'expiresAt',
  };
}

