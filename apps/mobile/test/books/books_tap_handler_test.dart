import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/books/application/books_tap_handler.dart';
import 'package:mobile/features/books/data/books_models.dart';

import '../support/fake_books_services.dart';

/// Records the handler's decisions without any navigation.
class _Recorder {
  final List<String> opened = [];
  int paywalls = 0;
  int refreshes = 0;
}

BooksTapHandler _handler(
  _Recorder rec, {
  required bool isPro,
  bool purchaseSucceeds = false,
}) {
  var pro = isPro;
  return BooksTapHandler(
    isPro: () => pro,
    refreshEntitlement: () async {
      rec.refreshes++;
      // The live entitlement flips only if the purchase went through.
      if (purchaseSucceeds) pro = true;
    },
    openPaywall: () async => rec.paywalls++,
    openContents: (book) async => rec.opened.add('contents:${book.contentId}'),
    openScripture: (book) async => rec.opened.add('scripture:${book.contentId}'),
  );
}

void main() {
  final major = fakeBookCard('major-1');
  final direct = fakeBookCard(
    'chalisa-1',
    contentType: BookContentType.directScripture,
    category: BookCategory.chalisa,
  );

  group('BooksTapHandler — Pro (#PATH_DECISION: two flows off one tap)', () {
    test('major book → Contents, no paywall', () async {
      final rec = _Recorder();
      await _handler(rec, isPro: true)
          .handleTap(book: major, sourceListType: 'carousel');

      expect(rec.opened, ['contents:major-1']);
      expect(rec.paywalls, 0);
    });

    test('direct scripture → Reader, no paywall, no Contents', () async {
      final rec = _Recorder();
      await _handler(rec, isPro: true)
          .handleTap(book: direct, sourceListType: 'category');

      expect(rec.opened, ['scripture:chalisa-1']);
      expect(rec.paywalls, 0);
    });
  });

  group('BooksTapHandler — Free (r3/r4: unified paywall DIRECTLY)', () {
    test('major book tap → paywall, and nothing else opens', () async {
      final rec = _Recorder();
      await _handler(rec, isPro: false)
          .handleTap(book: major, sourceListType: 'carousel');

      expect(rec.paywalls, 1);
      expect(rec.opened, isEmpty); // cancelled → no content
    });

    test('direct scripture tap → paywall too', () async {
      final rec = _Recorder();
      await _handler(rec, isPro: false)
          .handleTap(book: direct, sourceListType: 'category');

      expect(rec.paywalls, 1);
      expect(rec.opened, isEmpty);
    });

    test('re-reads LIVE entitlement after the paywall closes', () async {
      final rec = _Recorder();
      await _handler(rec, isPro: false)
          .handleTap(book: major, sourceListType: 'carousel');

      expect(rec.refreshes, 1);
    });
  });

  group('BooksTapHandler — post-purchase resume', () {
    test('purchase → resumes with the ORIGINALLY-tapped major book', () async {
      final rec = _Recorder();
      await _handler(rec, isPro: false, purchaseSucceeds: true)
          .handleTap(book: major, sourceListType: 'carousel');

      expect(rec.paywalls, 1);
      expect(rec.opened, ['contents:major-1']);
    });

    test('purchase → resumes a direct scripture into the reader', () async {
      final rec = _Recorder();
      await _handler(rec, isPro: false, purchaseSucceeds: true)
          .handleTap(book: direct, sourceListType: 'category');

      expect(rec.opened, ['scripture:chalisa-1']);
    });

    test('cancel → opens nothing (prior context preserved)', () async {
      final rec = _Recorder();
      await _handler(rec, isPro: false, purchaseSucceeds: false)
          .handleTap(book: major, sourceListType: 'carousel');

      expect(rec.opened, isEmpty);
    });
  });

  // The `BooksTapHandler — analytics` group (book_card_tapped /
  // book_paywall_triggered / book_paywall_viewed assertions) was dropped
  // when Books tracking left the analytics contract (Sheet 1 has zero
  // Books events). Behaviour tests above cover the Pro/free routing and
  // the post-purchase resume paths.
}
