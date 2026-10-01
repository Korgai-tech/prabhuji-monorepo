import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entitlement.dart';
import '../../../core/user_properties.dart';
import '../../../state/providers.dart';
import '../../paywall/paywall_analytics.dart';
import '../../paywall/presentation/paywall_screen.dart';
import '../books_routes.dart';
import '../data/books_models.dart';
import 'books_tap_handler.dart';

/// Builds a [BooksTapHandler] bound to go_router navigation + the live
/// entitlement + the paywall round-trip. Reused by Home and both listings so the
/// intent moment + post-purchase continuation is defined ONCE.
BooksTapHandler buildBooksTapHandler(BuildContext context, WidgetRef ref) {
  return BooksTapHandler(
    isPro: () => ref.read(entitlementProvider),
    refreshEntitlement: () => ref.read(entitlementStateProvider.notifier).refresh(),
    // `push` completes when the paywall route is popped — the handler then
    // re-reads live entitlement to decide purchase-vs-cancel.
    openPaywall: () => context.push(
      '/paywall',
      extra: const PaywallArgs(
        triggerModule: UserPropertyModule.books,
        triggerAction: PaywallTriggerAction.openBook,
        entrySource: PaywallEntrySource.feature,
      ),
    ),
    // #PATH_DECISION — two flows off one tap.
    openContents: (book) =>
        context.push(BooksRoutes.contents(book.contentId), extra: book),
    openScripture: (book) =>
        context.push(BooksRoutes.scripture(book.contentId), extra: book),
    analytics: ref.read(analyticsProvider),
  );
}

/// Handle a card tap from any discovery surface.
void booksHandleCardTap(
  BuildContext context,
  WidgetRef ref, {
  required BookCardView book,
  required String sourceListType,
}) {
  unawaited(buildBooksTapHandler(context, ref)
      .handleTap(book: book, sourceListType: sourceListType));
}

/// Home "Show all" → the all-books listing.
///
/// No title hint: nothing on this side knows the all-books heading, and 'All
/// Books' used to be hardcoded here. `GET /books` serves `data.title`, so the
/// listing titles itself from the response.
///
/// Analytics: Books is out of scope for the current analytics contract
/// (Sheet 1 has zero Books events), so no tracking is emitted.
void booksOpenAllListing(BuildContext context, WidgetRef ref) {
  unawaited(context.push(
    BooksRoutes.all,
    extra: const BookListQuery(),
  ));
}

/// Home category card → that category's listing. FREE — no gate here (the gate
/// is on the CONTENT card inside the listing, r3/r4).
///
/// The tapped card's SERVER title rides along as the hint so the listing's nav
/// bar is right on the first frame; `GET /books/categories/:category` then serves
/// its own `data.title`. The client previously rendered `category.wire` — the
/// enum's PATH SEGMENT — as the page title while throwing the served title away.
void booksOpenCategory(
  BuildContext context,
  WidgetRef ref,
  BookCategoryView category,
) {
  unawaited(context.push(
    BooksRoutes.category(category.category),
    extra: BookListQuery(
      titleHint: category.title,
      category: category.category,
    ),
  ));
}
