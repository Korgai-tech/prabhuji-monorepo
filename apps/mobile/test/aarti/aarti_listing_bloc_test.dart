import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/aarti/data/aarti_models.dart';
import 'package:mobile/features/aarti/listing/bloc/aarti_listing_bloc.dart';
import 'package:mobile/features/aarti/listing/bloc/aarti_listing_event.dart';
import 'package:mobile/features/aarti/listing/bloc/aarti_listing_state.dart';

import '../support/fake_repositories.dart';

const _query = AartiListQuery(title: 'Aarti', sourceListType: 'category', categoryId: 'c1');

void main() {
  group('AartiListingBloc', () {
    test('loads the first page and exposes the next cursor', () async {
      final bloc = AartiListingBloc(
        repository: FakeAartiRepository(pageSize: 2),
        query: _query,
      )..add(const AartiListingLoadRequested());

      await bloc.stream.firstWhere((s) => s.status == AartiListingStatus.loaded);
      expect(bloc.state.items.length, 2);
      expect(bloc.state.hasMore, isTrue);
      await bloc.close();
    });

    test('cursor pagination appends the next page', () async {
      final bloc = AartiListingBloc(
        repository: FakeAartiRepository(pageSize: 2),
        query: _query,
      )..add(const AartiListingLoadRequested());
      await bloc.stream.firstWhere((s) => s.status == AartiListingStatus.loaded);

      bloc.add(const AartiListingNextPageRequested());
      await bloc.stream.firstWhere((s) => s.items.length == 4);
      expect(bloc.state.items.length, 4);
      await bloc.close();
    });

    test('empty first page → calm empty state', () async {
      final bloc = AartiListingBloc(
        repository: FakeAartiRepository(listing: const []),
        query: _query,
      )..add(const AartiListingLoadRequested());

      await bloc.stream.firstWhere((s) => s.status == AartiListingStatus.empty);
      expect(bloc.state.status, AartiListingStatus.empty);
      await bloc.close();
    });

    test('first-page failure → error state', () async {
      final bloc = AartiListingBloc(
        repository: FakeAartiRepository(failListing: true),
        query: _query,
      )..add(const AartiListingLoadRequested());

      await bloc.stream.firstWhere((s) => s.status == AartiListingStatus.error);
      expect(bloc.state.status, AartiListingStatus.error);
      await bloc.close();
    });

    test('pagination stops at the end (no endless paging)', () async {
      final bloc = AartiListingBloc(
        repository: FakeAartiRepository(pageSize: 10),
        query: _query,
      )..add(const AartiListingLoadRequested());
      await bloc.stream.firstWhere((s) => s.status == AartiListingStatus.loaded);
      expect(bloc.state.hasMore, isFalse);

      // A next-page request while there is no more is a no-op.
      bloc.add(const AartiListingNextPageRequested());
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(bloc.state.items.length, 10);
      await bloc.close();
    });
  });
}
