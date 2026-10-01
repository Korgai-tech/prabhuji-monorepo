import 'package:flutter/widgets.dart' show BuildContext;
import 'package:go_router/go_router.dart';
import 'package:meta/meta.dart';

import '../aarti/aarti_routes.dart';
import '../books/books_routes.dart';
import '../horoscope/horoscope_routes.dart';
import '../mantras/mantras_routes.dart';
import '../ringtone/ringtone_routes.dart';
import '../status/status_routes.dart';
import '../wallpaper/wallpaper_routes.dart';
import 'data/home_models.dart';
import 'home_routes.dart';

/// A resolved, safe navigation target. Produced ONLY by [HomeDestinations] — a
/// CMS string can never become a route without passing through the allowlist.
@immutable
class HomeDestination {
  const HomeDestination.route(this.path)
      : opensPaywall = false,
        assert(path != null);

  /// The unified paywall (TAM-58 `PaywallGate`), not a go_router path: the gate
  /// owns the round-trip + post-purchase resume.
  const HomeDestination.paywall()
      : path = null,
        opensPaywall = true;

  /// go_router path to push. `null` when [opensPaywall].
  final String? path;
  final bool opensPaywall;
}

/// The hardcoded route ALLOWLIST for every CMS-authored destination on Home
/// (pattern §3, #PATH_DECISION).
///
/// CMS `destinationType`/`destinationValue` is UNTRUSTED input: it is resolved
/// through the maps below and an unknown value is a **no-op**, never a raw deep
/// link. Every path here is a real, registered route of an already-built module
/// (`lib/core/router.dart`).
class HomeDestinations {
  HomeDestinations._();

  /// Module key → that module's entry route. The keys are the wire values TAM-61
  /// serves (`home.seed.ts`: "wallpaper" | "status" | "aarti" | "mantras" |
  /// "ringtone"), plus the two shell modules a banner may link to.
  ///
  /// `aarti` and `mantra`/`mantras` both appear on the wire (the feed item's
  /// `contentType` is singular, its `module` is the module key), so both spell
  /// the same route rather than silently failing on one.
  static const Map<String, String> _moduleRoutes = <String, String>{
    'wallpaper': WallpaperRoutes.home,
    'status': StatusRoutes.home,
    'aarti': AartiRoutes.main,
    'aarti-bhajans': AartiRoutes.main,
    'mantra': MantrasRoutes.main,
    'mantras': MantrasRoutes.main,
    'ringtone': RingtoneRoutes.home,
    'ringtones': RingtoneRoutes.home,
    'horoscope': HoroscopeRoutes.main,
    'books': BooksRoutes.home,
  };

  /// Resolve a module key. Unknown ⇒ `null` (no-op).
  static HomeDestination? module(String? key) {
    final path = _moduleRoutes[key?.trim().toLowerCase()];
    return path == null ? null : HomeDestination.route(path);
  }

  /// A feed card's HEADER tap → the owning module, directly (PRD §11).
  ///
  /// Prefers the server's explicit `headerDestinationModule`, falling back to
  /// the item's own `module`; both go through the same allowlist.
  static HomeDestination? feedHeader(HomeFeedItemView item) =>
      module(item.headerDestinationModule) ?? module(item.module);

  /// A feed card's CTA.
  ///
  /// #PATH_DECISION — the CTA opens a PREVIEW or the MODULE, never a direct
  /// apply (§12, #EXPORT_CRITICAL). Setting a wallpaper/ringtone/status always
  /// happens behind the owning module's own confirmation + Pro gate; nothing on
  /// Home can shortcut that, because no branch below reaches an apply route.
  ///
  /// `content_detail` resolves to the owning module's by-id route where one
  /// exists that can open from a bare id:
  ///  * ringtone → the real Preview (`/ringtones/preview/:id`).
  ///  * aarti    → the real deep-link resolver (`/aarti-bhajans/audio/:id`),
  ///    which refreshes entitlement and lands Pro users in the player, free
  ///    users on the module.
  ///  * mantra   → the mirror deep-link resolver (`/mantras/audio/:itemId`).
  ///
  /// Aarti and mantra deep-link routes look up by **id** (no slug fallback),
  /// so they use [HomeFeedItemView.ctaContentId] — a server-populated UUID
  /// side-car to [HomeFeedItemView.ctaDestinationValue] (which is a
  /// human-readable slug). Ringtone still keys off the slug because its
  /// Preview route accepts either. When `ctaContentId` is absent (e.g. an
  /// admin-authored `content_detail` card the auto-sync never touched), the
  /// CTA falls back to opening the owning module rather than 404-ing on a
  /// slug against `GET /aarti/audios/:id`.
  ///
  /// Wallpaper and status have NO route that accepts a bare content id (the
  /// Wallpaper preview needs its originating feed + a `WallpaperCardItem`;
  /// Status has no per-content route), and the Home feed item is
  /// DENORMALIZED — it carries none of that data. Fabricating it would be
  /// inventing content, so those CTAs open the owning module instead.
  /// Logged in `specs/evidence/TAM-62/fidelity/sweep-table.md`.
  static HomeDestination? feedCta(HomeFeedItemView item) {
    final type = item.ctaDestinationType.trim().toLowerCase();
    final value = item.ctaDestinationValue.trim();
    final contentId = item.ctaContentId?.trim() ?? '';

    switch (type) {
      case 'linked_module':
        // The value IS a module key; fall back to the card's own module.
        return module(value) ?? module(item.module);

      case 'pro_paywall':
        return const HomeDestination.paywall();

      case 'content_detail':
        switch (item.contentType) {
          case HomeContentType.ringtone:
            if (value.isEmpty) return module(item.module);
            return HomeDestination.route(RingtoneRoutes.preview(value));
          case HomeContentType.aarti:
            // Aarti's `GET /aarti/audios/:id` is strict id lookup — passing a
            // slug 404s. Open the play deep-link ONLY when the server sent
            // the id side-car; otherwise fall back to the module home.
            if (contentId.isEmpty) return module(item.module);
            return HomeDestination.route(AartiRoutes.deepLink(contentId));
          case HomeContentType.mantra:
            // Same rule as aarti — mantra's `GET /mantras/items/:id` is also
            // strict id lookup.
            if (contentId.isEmpty) return module(item.module);
            return HomeDestination.route(MantrasRoutes.deepLink(contentId));
          case HomeContentType.wallpaper:
          case HomeContentType.status:
            return module(item.module);
        }

      default:
        // Unknown CTA type — no-op (pattern §3). NOT a raw deep link.
        return null;
    }
  }

  /// A banner tap.
  ///
  /// `informational` is non-navigable by contract → `null` (the carousel renders
  /// it without a tap target). `pro_paywall` → the gate. `linked_module` → the
  /// module. `content_detail` → the module that owns the content: a banner
  /// carries no `contentType`, so there is nothing to key a by-id route on, and
  /// guessing one from a slug would be inventing a destination.
  static HomeDestination? banner(HomeBannerView banner) =>
      _cmsDestination(banner.destinationType, banner.destinationValue);

  /// A feature-shortcut tile tap (TAM-61 `GET /home/shortcuts`).
  ///
  /// #EXPORT_CRITICAL — the tile's `destinationValue` is CMS-authored and
  /// therefore UNTRUSTED, exactly like a banner's. It is a stable module KEY and
  /// is resolved through the SAME [_moduleRoutes] allowlist above; an unknown key
  /// is a no-op, never a raw deep link. The four Phase-1 tiles ship module keys
  /// the allowlist already spelled ("aarti"/"mantras"/"ringtone"/"wallpaper"), so
  /// no entry had to be added for the grid to go server-driven.
  static HomeDestination? shortcut(HomeShortcutView shortcut) =>
      _cmsDestination(shortcut.destinationType, shortcut.destinationValue);

  /// The ONE resolver behind every CMS-authored destination on Home. Banners and
  /// shortcuts share the contract's destination vocabulary, so they share this —
  /// there is a single place where an untrusted string becomes a route, and it
  /// only ever does so via [module].
  static HomeDestination? _cmsDestination(
    HomeDestinationType type,
    String? value,
  ) {
    switch (type) {
      case HomeDestinationType.informational:
        return null;
      case HomeDestinationType.proPaywall:
        return const HomeDestination.paywall();
      case HomeDestinationType.linkedModule:
        return module(value);
      case HomeDestinationType.contentDetail:
        // A banner/shortcut carries no `contentType`, so there is nothing to key
        // a by-id route on — resolve to the module that owns the content rather
        // than guessing a destination from a slug.
        return module(value);
    }
  }
}

/// Paths that are BOTTOM-NAV BRANCHES of the shell (not full-screen routes
/// pushed over it). See `apps/mobile/doc/bottom-nav-routing.md`. A tap on a
/// Home CTA / header / banner / shortcut that resolves to one of these should
/// SWITCH the visible tab (`context.go`), not push a new nested route
/// (`context.push`). Pushing would either create a shell-over-shell instance
/// or replace the home stack with a status stack — depending on the router
/// version — and either way loses the "tab change, home preserved behind"
/// UX the design assumes.
const Set<String> kShellBranchPaths = <String>{
  HomeRoutes.home,
  StatusRoutes.home,
  HoroscopeRoutes.main,
};

/// Navigate to a Home-resolved destination path with the right semantics:
///
///  * Shell-branch path (`/home` / `/status` / `/horoscope`) → `context.go` so
///    the bottom nav switches tabs and the previously-active branch's stack +
///    scroll position stay preserved off-screen (StatefulShellRoute's own
///    behaviour). Same effect as tapping the tab manually.
///  * Anything else (module full-screens like `/aarti-bhajans`, `/mantras`,
///    module preview / player / paywall / webview / etc.) → `context.push` so
///    it opens OVER the shell with its own back button, and popping returns
///    the user to whichever tab they were on.
///
/// One helper for every Home tap surface so the choice is uniform. Missing it
/// on any one caller reintroduces the "opening Status from the feed replaces
/// Home instead of switching tabs" bug.
void openHomeDestinationPath(BuildContext context, String path) {
  if (kShellBranchPaths.contains(path)) {
    context.go(path);
  } else {
    context.push(path);
  }
}
