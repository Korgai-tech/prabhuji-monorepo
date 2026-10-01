//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StatusErrorEnvelope {
  /// Returns a new [StatusErrorEnvelope] instance.
  StatusErrorEnvelope({
    required this.success,
    required this.message,
    required this.data,
    this.errorCode,
  });

  bool success;

  String message;

  StatusErrorEnvelopeDataEnum? data;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? errorCode;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StatusErrorEnvelope &&
    other.success == success &&
    other.message == message &&
    other.data == data &&
    other.errorCode == errorCode;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (success.hashCode) +
    (message.hashCode) +
    (data == null ? 0 : data!.hashCode) +
    (errorCode == null ? 0 : errorCode!.hashCode);

  @override
  String toString() => 'StatusErrorEnvelope[success=$success, message=$message, data=$data, errorCode=$errorCode]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'success'] = this.success;
      json[r'message'] = this.message;
    if (this.data != null) {
      json[r'data'] = this.data;
    } else {
      json[r'data'] = null;
    }
    if (this.errorCode != null) {
      json[r'errorCode'] = this.errorCode;
    } else {
      json[r'errorCode'] = null;
    }
    return json;
  }

  /// Returns a new [StatusErrorEnvelope] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StatusErrorEnvelope? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'success'), 'Required key "StatusErrorEnvelope[success]" is missing from JSON.');
        assert(json[r'success'] != null, 'Required key "StatusErrorEnvelope[success]" has a null value in JSON.');
        assert(json.containsKey(r'message'), 'Required key "StatusErrorEnvelope[message]" is missing from JSON.');
        assert(json[r'message'] != null, 'Required key "StatusErrorEnvelope[message]" has a null value in JSON.');
        assert(json.containsKey(r'data'), 'Required key "StatusErrorEnvelope[data]" is missing from JSON.');
        return true;
      }());

      return StatusErrorEnvelope(
        success: mapValueOfType<bool>(json, r'success')!,
        message: mapValueOfType<String>(json, r'message')!,
        data: StatusErrorEnvelopeDataEnum.fromJson(json[r'data']),
        errorCode: mapValueOfType<String>(json, r'errorCode'),
      );
    }
    return null;
  }

  static List<StatusErrorEnvelope> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusErrorEnvelope>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusErrorEnvelope.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StatusErrorEnvelope> mapFromJson(dynamic json) {
    final map = <String, StatusErrorEnvelope>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StatusErrorEnvelope.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StatusErrorEnvelope-objects as value to a dart map
  static Map<String, List<StatusErrorEnvelope>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StatusErrorEnvelope>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StatusErrorEnvelope.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'success',
    'message',
    'data',
  };
}


class StatusErrorEnvelopeDataEnum {
  /// Instantiate a new enum with the provided [value].
  const StatusErrorEnvelopeDataEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;


  /// List of all possible values in this [enum][StatusErrorEnvelopeDataEnum].
  static const values = <StatusErrorEnvelopeDataEnum>[
  ];

  static StatusErrorEnvelopeDataEnum? fromJson(dynamic value) => StatusErrorEnvelopeDataEnumTypeTransformer().decode(value);

  static List<StatusErrorEnvelopeDataEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StatusErrorEnvelopeDataEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StatusErrorEnvelopeDataEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [StatusErrorEnvelopeDataEnum] to String,
/// and [decode] dynamic data back to [StatusErrorEnvelopeDataEnum].
class StatusErrorEnvelopeDataEnumTypeTransformer {
  factory StatusErrorEnvelopeDataEnumTypeTransformer() => _instance ??= const StatusErrorEnvelopeDataEnumTypeTransformer._();

  const StatusErrorEnvelopeDataEnumTypeTransformer._();

  String encode(StatusErrorEnvelopeDataEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a StatusErrorEnvelopeDataEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  StatusErrorEnvelopeDataEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [StatusErrorEnvelopeDataEnumTypeTransformer] instance.
  static StatusErrorEnvelopeDataEnumTypeTransformer? _instance;
}


