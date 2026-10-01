/// Pure mapper: FCM `data` payload → in-app route path.
///
/// **Payload contract** (what the server sends in `data`):
///   - `type` (required)  — canonical string, one of the cases below.
///   - `id`   (optional)  — resource id when the target route takes one.
///   - `path` (optional)  — explicit override, bypasses `type` mapping.
///                          Use for one-off links / A/B experiments.
///
/// Returns `null` when the payload doesn't map to a known route — the caller
/// falls back to just opening the app (splash / last screen). This is the
/// documented "no route available" behaviour.
///
/// Kept as a top-level function (not a class) so it stays a pure lookup with
/// no state. When a new route ships, add one case here.
String? resolveNotificationRoute(Map<String, dynamic> data) {
  // `path` override wins.
  final override = _string(data['path']);
  if (override != null && override.startsWith('/')) return override;

  final type = _string(data['type']);
  if (type == null || type.isEmpty) return null;
  final id = _string(data['id']);

  switch (type) {
    // Content deep links (need an id).
    case 'aarti_audio':
      return id == null ? '/aarti-bhajans' : '/aarti-bhajans/audio/$id';
    case 'ringtone':
      return id == null ? '/ringtones' : '/ringtones/preview/$id';
    case 'book_read':
      return id == null ? '/books' : '/books/$id/read';
    case 'book_contents':
      return id == null ? '/books' : '/books/$id/contents';
    case 'book_scripture':
      return id == null ? '/books' : '/books/$id/scripture';
    case 'horoscope_result':
      return id == null ? '/horoscope' : '/horoscope/result/$id';

    // Section-level links.
    case 'aarti':
      return '/aarti-bhajans';
    case 'mantras':
      return '/mantras';
    case 'ringtones':
      return '/ringtones';
    case 'wallpaper':
      return '/wallpaper';
    case 'books':
      return '/books';
    case 'status':
      return '/status';
    case 'horoscope':
      return '/horoscope';
    case 'home':
      return '/';
    case 'paywall':
      return '/paywall';
  }
  return null;
}

String? _string(Object? v) => v is String && v.isNotEmpty ? v : null;
