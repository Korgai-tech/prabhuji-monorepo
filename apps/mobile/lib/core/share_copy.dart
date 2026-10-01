/// Share-sheet copy constants (TAM-124).
///
/// Everything a user sees BESIDES the deep-link URL when they share something
/// from the app: the OS-share-sheet message text (per target type) and the
/// generic app tagline that seeds the Open Graph preview card on the landing
/// page.
///
/// This file exists so product can edit share/OG copy without touching feature
/// code. All values are dummy placeholders for v1 — replace with real copy
/// before public release; no code changes required.
///
/// Never put user names, IDs, or per-share dynamic values here — those belong
/// in the share URL itself (`?ref=…`) or in the caller's own message override.
class ShareCopy {
  const ShareCopy._();

  /// Fallback message when a caller doesn't supply a target-specific one.
  static const String defaultMessage =
      'Check this out on Krutyug — download the app to see more.';

  /// Tagline used as the OG preview card's title/description on
  /// krutyug.ai/app/* landing pages. Ships with the app icon as the OG image
  /// (asset: `apps/mobile/assets/onboarding/login-background.png`).
  static const String appTagline =
      'Krutyug — daily aartis, mantras, bhajans and more.';

  /// Per-target-type share messages. Keys mirror the `type` slug used in the
  /// deep-link URL (`prabhuji://<type>/…`, `krutyug.ai/app/<type>/…`).
  ///
  /// Missing entries fall back to [defaultMessage].
  static const Map<String, String> messageByType = {
    'aarti': 'Listen to this aarti on Krutyug 🕉️',
    'mantra': 'Listen to this mantra on Krutyug 🕉️',
    'book': 'Read this on Krutyug 📖',
    'horoscope': 'Read your horoscope on Krutyug ✨',
    'ringtone': 'Set this ringtone from Krutyug 🔔',
    'wallpaper': 'Get this wallpaper from Krutyug 🖼️',
    'status': 'Watch this on Krutyug 📿',
    'pro': 'Unlock everything on Krutyug ✨',
  };

  /// Resolves the message for a given target type, with [defaultMessage] as the
  /// safe fallback. Callers may override with their own message string.
  static String messageFor(String targetType) =>
      messageByType[targetType] ?? defaultMessage;
}
