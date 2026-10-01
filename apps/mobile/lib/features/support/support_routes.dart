/// go_router paths for the Support surface (TAM-N-support-screen).
///
/// Registered as a **flat top-level route** — NOT nested under `/profile` —
/// so both entry points (home header + profile menu) push straight to it
/// without a synthetic profile step in the back stack. See the spec's
/// #PATH_DECISION for the reasoning.
class SupportRoutes {
  SupportRoutes._();

  /// Support screen — pushed OVER the shell (bottom nav hidden while active,
  /// same convention as `/paywall` and `/profile`).
  static const String support = '/support';
}
