import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/paywall_gate.dart';
import '../../../../core/theme.dart';
import '../../../../core/user_properties.dart';
import '../../../../state/providers.dart';
import '../../../paywall/paywall_analytics.dart';
import '../../../paywall/presentation/paywall_screen.dart';
import '../../application/horoscope_tap_handler.dart';
import '../../data/horoscope_models.dart';
import '../../horoscope_providers.dart';
import '../../horoscope_routes.dart';
import '../../presentation/horoscope_widgets.dart';
import '../bloc/horoscope_main_bloc.dart';
import '../bloc/horoscope_main_event.dart';
import '../bloc/horoscope_main_state.dart';

/// Horoscope Main — the FREE zodiac grid (Figma `371:3796`).
///
/// Lives INSIDE the TAM-58 shell (the frame renders the five-item bottom nav
/// with Horoscope active), so this widget draws NO bottom nav of its own.
///
/// PRD §5: the tab and the grid are free — no paywall on entry or load, and no
/// lock badges / Pro labels on any card. The gate fires on TAP, via
/// [HoroscopeTapHandler] → the shared [PaywallGate].
class HoroscopeMainScreen extends ConsumerWidget {
  const HoroscopeMainScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      // The frame's own fill is a gradient (cream → white by ~17.6%), not the
      // flat scaffoldWarm other screens use (node 371:3796 root fill).
      decoration: const BoxDecoration(gradient: AppGradient.horoscopeScaffold),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: BlocBuilder<HoroscopeMainBloc, HoroscopeMainState>(
            builder: (context, state) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Header(state: state),
                  Expanded(child: _Body(state: state)),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Title + IST date. The Figma nav's avatar and all three trailing icons are
/// `visible:false` — this header is title-only (no back arrow, no actions).
class _Header extends StatelessWidget {
  const _Header({required this.state});
  final HoroscopeMainState state;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppHoroscope.navPaddingLeft),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: AppHoroscope.navHeight,
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                // Localized copy isn't shipped in Phase 1 — the server owns
                // content localization; this chrome string is English-only.
                "Today's Horoscope",
                key: const ValueKey('horoscope-title'),
                style: AppText.headingSm(color: AppColors.horoscopeTitle),
              ),
            ),
          ),
          const SizedBox(height: AppHoroscope.dateBlockTop),
          SizedBox(
            height: AppHoroscope.dateBlockHeight,
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                state.formattedDate,
                key: const ValueKey('horoscope-date'),
                style: AppText.headingXs(color: AppColors.horoscopeDate),
              ),
            ),
          ),
          const SizedBox(height: AppHoroscope.dateToGridGap),
        ],
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.state});
  final HoroscopeMainState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    switch (state.status) {
      case HoroscopeMainStatus.loading:
        return const Center(
          key: ValueKey('horoscope-loading'),
          child: CircularProgressIndicator(color: AppColors.brand300),
        );
      case HoroscopeMainStatus.failure:
        return HoroscopeErrorView(
          message: state.errorMessage ?? 'Could not load horoscope.',
          onRetry: () =>
              context.read<HoroscopeMainBloc>().add(const HoroscopeMainRetried()),
        );
      case HoroscopeMainStatus.ready:
        if (state.signs.isEmpty) {
          return const _ComingSoon();
        }
        return _Grid(signs: state.signs, dateIst: state.dateIst);
    }
  }
}

/// Rendered when the server returns zero zodiac signs — keeps the header + IST
/// date but replaces the empty grid area with a calm "Coming soon" message so
/// the user isn't looking at a blank page.
class _ComingSoon extends StatelessWidget {
  const _ComingSoon();

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: const ValueKey('horoscope-coming-soon'),
      padding: const EdgeInsets.symmetric(
        horizontal: AppHoroscope.screenPadding,
      ),
      child: Center(
        child: Text(
          'Coming soon',
          textAlign: TextAlign.center,
          style: AppText.headingXs(color: AppColors.horoscopeDate),
        ),
      ),
    );
  }
}

class _Grid extends ConsumerWidget {
  const _Grid({required this.signs, required this.dateIst});
  final List<HoroscopeZodiacSign> signs;
  final String dateIst;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GridView.builder(
      key: const ValueKey('horoscope-zodiac-grid'),
      padding: const EdgeInsets.fromLTRB(
        AppHoroscope.screenPadding,
        AppHoroscope.gridPaddingTop,
        AppHoroscope.screenPadding,
        AppHoroscope.screenPadding,
      ),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        // node 375:2270: GRID, gridColumnCount 3, gridColumnGap/gridRowGap 10.
        crossAxisCount: AppHoroscope.gridColumns,
        crossAxisSpacing: AppHoroscope.gridColumnGap,
        mainAxisSpacing: AppHoroscope.gridRowGap,
        childAspectRatio: AppHoroscope.cardAspectRatio,
      ),
      itemCount: signs.length,
      itemBuilder: (context, i) {
        final sign = signs[i];
        return ZodiacCard(
          sign: sign,
          onTap: () => unawaited(_handleTap(context, ref, sign, i)),
        );
      },
    );
  }

  /// Free → paywall → (on purchase) straight into the tapped sign's result.
  /// Pro → the result, directly.
  Future<void> _handleTap(
    BuildContext context,
    WidgetRef ref,
    HoroscopeZodiacSign sign,
    int positionIndex,
  ) async {
    final handler = HoroscopeTapHandler(
      gate: ref.read(paywallGateProvider),
      locale: ref.read(horoscopeLocaleProvider),
      analytics: ref.read(analyticsProvider),
      openPaywall: () => context.push(
        '/paywall',
        extra: const PaywallArgs(
          triggerModule: UserPropertyModule.horoscope,
          triggerAction: PaywallTriggerAction.openHoroscope,
          entrySource: PaywallEntrySource.feature,
        ),
      ),
      openResult: (zodiacId) => context.push(HoroscopeRoutes.result(zodiacId)),
    );
    await handler.handleTap(
      sign,
      positionIndex: positionIndex,
      horoscopeDate: dateIst.isEmpty ? null : dateIst,
    );
  }
}
