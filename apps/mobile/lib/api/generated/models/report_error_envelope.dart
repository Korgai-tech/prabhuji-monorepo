//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ReportErrorEnvelope {
  /// Returns a new [ReportErrorEnvelope] instance.
  ReportErrorEnvelope({
    required this.success,
    required this.message,
    required this.data,
    this.errorCode,
  });

  bool success;

  String message;

  ReportErrorEnvelopeDataEnum? data;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? errorCode;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ReportErrorEnvelope &&
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
  String toString() => 'ReportErrorEnvelope[success=$success, message=$message, data=$data, errorCode=$errorCode]';

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

  /// Returns a new [ReportErrorEnvelope] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ReportErrorEnvelope? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'success'), 'Required key "ReportErrorEnvelope[success]" is missing from JSON.');
        assert(json[r'success'] != null, 'Required key "ReportErrorEnvelope[success]" has a null value in JSON.');
        assert(json.containsKey(r'message'), 'Required key "ReportErrorEnvelope[message]" is missing from JSON.');
        assert(json[r'message'] != null, 'Required key "ReportErrorEnvelope[message]" has a null value in JSON.');
        assert(json.containsKey(r'data'), 'Required key "ReportErrorEnvelope[data]" is missing from JSON.');
        return true;
      }());

      return ReportErrorEnvelope(
        success: mapValueOfType<bool>(json, r'success')!,
        message: mapValueOfType<String>(json, r'message')!,
        data: ReportErrorEnvelopeDataEnum.fromJson(json[r'data']),
        errorCode: mapValueOfType<String>(json, r'errorCode'),
      );
    }
    return null;
  }

  static List<ReportErrorEnvelope> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ReportErrorEnvelope>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ReportErrorEnvelope.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ReportErrorEnvelope> mapFromJson(dynamic json) {
    final map = <String, ReportErrorEnvelope>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ReportErrorEnvelope.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ReportErrorEnvelope-objects as value to a dart map
  static Map<String, List<ReportErrorEnvelope>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ReportErrorEnvelope>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ReportErrorEnvelope.listFromJson(entry.value, growable: growable,);
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


class ReportErrorEnvelopeDataEnum {
  /// Instantiate a new enum with the provided [value].
  const ReportErrorEnvelopeDataEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;


  /// List of all possible values in this [enum][ReportErrorEnvelopeDataEnum].
  static const values = <ReportErrorEnvelopeDataEnum>[
  ];

  static ReportErrorEnvelopeDataEnum? fromJson(dynamic value) => ReportErrorEnvelopeDataEnumTypeTransformer().decode(value);

  static List<ReportErrorEnvelopeDataEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ReportErrorEnvelopeDataEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ReportErrorEnvelopeDataEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ReportErrorEnvelopeDataEnum] to String,
/// and [decode] dynamic data back to [ReportErrorEnvelopeDataEnum].
class ReportErrorEnvelopeDataEnumTypeTransformer {
  factory ReportErrorEnvelopeDataEnumTypeTransformer() => _instance ??= const ReportErrorEnvelopeDataEnumTypeTransformer._();

  const ReportErrorEnvelopeDataEnumTypeTransformer._();

  String encode(ReportErrorEnvelopeDataEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a ReportErrorEnvelopeDataEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ReportErrorEnvelopeDataEnum? decode(dynamic data, {bool allowNull = true}) {
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

  /// Singleton [ReportErrorEnvelopeDataEnumTypeTransformer] instance.
  static ReportErrorEnvelopeDataEnumTypeTransformer? _instance;
}


