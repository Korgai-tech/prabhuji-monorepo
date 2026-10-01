/// go_router paths for the Chat module (TAM-164).
///
/// Chat lives INSIDE the shell as a `StatefulShellBranch` at index 1 (Home /
/// **Chat** / Status / Downloads / Rashifal — see `apps/mobile/lib/core/router.dart`).
/// The chat screen deliberately renders WITHOUT the bottom nav even though it
/// is a shell branch; the shell scaffold hides `_BottomNav` while the active
/// branch index is chat.
class ChatRoutes {
  ChatRoutes._();

  /// Module entry — the shell's Chat branch (bottom-nav tab).
  static const String chat = '/chat';
}
