/// go_router paths for the Downloads module (TAM-125). The library lives
/// INSIDE the shell as a `StatefulShellBranch` — see `apps/mobile/lib/core/router.dart`.
class DownloadsRoutes {
  DownloadsRoutes._();

  /// Library screen — populated list OR empty state, chosen by the bloc.
  static const String library = '/downloads';
}
