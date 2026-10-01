import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/deep_link_parser.dart';
import 'package:mobile/core/deep_link_service.dart';
import 'package:mobile/core/navigation_stack.dart';

/// The stack an EXTERNAL arrival (share link, notification, install-referrer
/// replay) opens as.
///
/// Regression: module routes are registered FLAT in `router.dart`
/// (`/mantras/audio/:itemId` is top-level, not a child of `/mantras`), so a
/// bare `go(target)` left a one-entry stack — `canPop` false, system back
/// exits the app. In-app feed taps never had this because they push over the
/// live shell (`openHomeDestinationPath`).
void main() {
  group('navigationStackFor', () {
    test('a full-screen route gets Home underneath it', () {
      expect(navigationStackFor('/mantras/audio/m-7'),
          ['/home', '/mantras/audio/m-7']);
      expect(navigationStackFor('/books/geeta/contents'),
          ['/home', '/books/geeta/contents']);
      expect(navigationStackFor('/paywall'), ['/home', '/paywall']);
    });

    test('a shell branch is SELECTED, never pushed', () {
      // Pushing a branch route stacks a second shell over the first — the
      // bug `openHomeDestinationPath` already guards against in-app.
      for (final branch in kShellBranchRoutes) {
        expect(navigationStackFor(branch), [branch],
            reason: '$branch is a bottom-nav branch');
      }
    });

    test('a branch keeps its query string and stays single-entry', () {
      // `/status?highlight=<id>` — the query must not defeat the branch match.
      expect(navigationStackFor('/status?highlight=abc'),
          ['/status?highlight=abc']);
    });

    test('a non-branch route keeps its query string too', () {
      expect(navigationStackFor('/wallpaper?highlight=wp1'),
          ['/home', '/wallpaper?highlight=wp1']);
    });

    test("bare '/' (the notification payload's home) normalises to /home", () {
      expect(navigationStackFor('/'), ['/home']);
    });

    test('every stack is non-empty and starts at a branch', () {
      // The first entry is `go`-ne, so it must be a branch or the shell
      // would be replaced by a bare full-screen route with nothing under it.
      for (final path in [
        '/mantras/audio/x',
        '/aarti-bhajans/audio/x',
        '/ringtones/preview/x',
        '/books/x/contents',
        '/horoscope/result/leo',
        '/wallpaper?highlight=x',
        '/paywall',
        '/home',
        '/status?highlight=x',
      ]) {
        final stack = navigationStackFor(path);
        expect(stack, isNotEmpty);
        expect(kShellBranchRoutes, contains(stack.first.split('?').first),
            reason: '$path must rest on a shell branch, got ${stack.first}');
        expect(stack.last, path == '/' ? '/home' : path,
            reason: 'the user must still land on $path');
      }
    });
  });

  group('DeepLinkService.stackForTarget', () {
    test('every shareable target lands on its path with Home underneath', () {
      expect(DeepLinkService.stackForTarget(const MantraDeepLink(audioId: 'm7')),
          ['/home', '/mantras/audio/m7']);
      expect(DeepLinkService.stackForTarget(const AartiDeepLink(audioId: 'a1')),
          ['/home', '/aarti-bhajans/audio/a1']);
      expect(DeepLinkService.stackForTarget(const RingtoneDeepLink(id: 'r1')),
          ['/home', '/ringtones/preview/r1']);
      expect(DeepLinkService.stackForTarget(const BookDeepLink(contentId: 'g')),
          ['/home', '/books/g/contents']);
      expect(DeepLinkService.stackForTarget(const PaywallDeepLink()),
          ['/home', '/paywall']);
    });

    test('branch targets stay single-entry', () {
      expect(DeepLinkService.stackForTarget(const HomeDeepLink()), ['/home']);
      expect(DeepLinkService.stackForTarget(const StatusDeepLink(id: 'a')),
          ['/status?highlight=a']);
      // Rashifal is a branch; the RESULT screen pushes over it — and since
      // the base is computed from the path, it rests on /home like any other
      // full-screen route.
      expect(
        DeepLinkService.stackForTarget(const HoroscopeDeepLink(zodiacId: 'leo')),
        ['/home', '/horoscope/result/leo'],
      );
    });

    test('the destination always matches pathForTarget', () {
      // One target→path mapping, two shapes of it. A drift here means the
      // router redirect (pathForTarget) and the service (stackForTarget)
      // disagree about where a link goes.
      for (final target in <DeepLinkTarget>[
        const HomeDeepLink(),
        const StatusDeepLink(id: 'a'),
        const AartiDeepLink(audioId: 'a'),
        const MantraDeepLink(audioId: 'a'),
        const BookDeepLink(contentId: 'a'),
        const HoroscopeDeepLink(zodiacId: 'leo'),
        const RingtoneDeepLink(id: 'a'),
        const WallpaperDeepLink(id: 'a'),
        const PaywallDeepLink(),
        const UnknownDeepLink(),
      ]) {
        expect(DeepLinkService.stackForTarget(target).last,
            DeepLinkService.pathForTarget(target));
      }
    });
  });
}
