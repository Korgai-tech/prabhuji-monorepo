import 'dart:convert';

/// Decodes a JWT's payload claims WITHOUT verifying the signature — the token
/// came from our own api over TLS and is only used to attach analytics
/// identity client-side (the api's payload is `{sub: user.id, email}`).
/// Returns null for anything malformed; never throws (analytics must never
/// break the app).
Map<String, dynamic>? decodeJwtClaims(String token) {
  final parts = token.split('.');
  if (parts.length != 3) return null;
  try {
    final normalized = base64Url.normalize(parts[1]);
    final decoded = jsonDecode(utf8.decode(base64Url.decode(normalized)));
    return decoded is Map<String, dynamic> ? decoded : null;
  } on FormatException {
    return null;
  }
}
