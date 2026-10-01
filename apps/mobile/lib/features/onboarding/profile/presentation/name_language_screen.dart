import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme.dart';
import '../../../../core/user_properties.dart';
import '../../../../state/providers.dart';
import '../../../paywall/paywall_analytics.dart';
import '../../../paywall/presentation/paywall_screen.dart';
import '../bloc/name_language_bloc.dart';
import '../bloc/name_language_event.dart';
import '../bloc/name_language_state.dart';

/// PRD §6.5 — Name + Language screen.
///
/// Design source: Figma node `406:2953` ("Language") on a 360×800 canvas.
///
/// Layout (no brand cluster on this screen — the user has already authenticated):
///  - Cream `Colors/Brand/100` scaffold.
///  - Pill "Name" field at (16, 116) — 328×56, 1.5px `Colors/Brand/300` border,
///    `rounded-[50px]`, floating "Name" label chip on the top border.
///  - "Choose your language" heading at (~74, 196) — `Headings/heading-xs`
///    Inter SemiBold 20/28 in `Neutral/Black`.
///  - 4×2 language grid at (16, 239) — 159×103.25 cards, 10.75 gap between
///    rows (`117.5 - 107.5`), 10 gap between columns. Each card:
///      * 1px border — `Colors/Grey/300` unselected, `Colors/Brand/300` selected.
///      * `rounded-[8px]`, `py-[21]`, transparent bg (cream shows through).
///      * Native script (`Inter Medium 18/24`) + english label (`Inter SemiBold
///        18/24`), both `Colors/Grey/500` (`#3F3F3F`), centered vertically
///        with space-between (Figma uses `justify-between`).
///      * When selected: 24×24 orange-gradient check circle at top-right
///        (Figma coords `left-[129px] top-[6px]`).
///  - "Continue" CTA at (16, 723) — 328×44, CTA gradient LR, radius 8,
///    white `Label/label-lg` label.
class NameLanguageScreen extends ConsumerStatefulWidget {
  const NameLanguageScreen({
    super.key,
    this.showNameField = true,
    this.showLanguageField = true,
    this.ctaLabel = 'Continue',
    this.popOnSaved = false,
  });

  /// Onboarding mounts the screen with the name field visible; the language-only
  /// entry from the home profile avatar hides it.
  final bool showNameField;

  /// Onboarding no longer asks the user to pick a language — the picker is
  /// hidden and a default is silently applied by the bloc. The profile-menu
  /// language-only flow still shows it.
  final bool showLanguageField;

  /// CTA label. Onboarding uses "Continue"; the language-only entry uses "Save".
  final String ctaLabel;

  /// When true, a successful save pops the current route (language-only flow).
  /// When false (onboarding), the screen navigates forward to `/paywall` as a
  /// safety-net redirect if the orchestrator's step-completed dispatch is slow.
  final bool popOnSaved;

  @override
  ConsumerState<NameLanguageScreen> createState() => _NameLanguageScreenState();
}

class _NameLanguageScreenState extends ConsumerState<NameLanguageScreen> {
  late final TextEditingController _nameController;
  late final FocusNode _nameFocus;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(
      text: context.read<NameLanguageBloc>().state.name,
    );
    _nameFocus = FocusNode();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<NameLanguageBloc>().add(const ScreenViewed());
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _nameFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.brand100,
      // Same reasoning as OTP — let the soft keyboard overlay the CTA without
      // reshuffling the whole grid.
      resizeToAvoidBottomInset: false,
      body: SafeArea(
        child: BlocConsumer<NameLanguageBloc, NameLanguageState>(
          listener: (context, state) {
            if (state is NameLanguageSaved) {
              if (widget.popOnSaved) {
                // Invalidate the cached Riverpod locale so paywall/deity/
                // horoscope reads pick up the new language on their next
                // `ref.read`/`ref.watch`. Content feeds read `SessionContext`
                // fresh on each call and need no invalidation.
                ref.invalidate(selectedLocaleProvider);
                unawaited(Future<void>.microtask(() {
                  if (!context.mounted) return;
                  if (context.canPop()) {
                    context.pop();
                  }
                }));
              } else {
                unawaited(Future<void>.microtask(() {
                  if (!context.mounted) return;
                  context.go(
                    '/paywall',
                    extra: const PaywallArgs(
                      triggerModule: UserPropertyModule.login,
                      triggerAction: PaywallTriggerAction.landToHome,
                      entrySource: PaywallEntrySource.login,
                    ),
                  );
                }));
              }
            }
            if (state is NameLanguageError) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(state.message),
                  duration: const Duration(seconds: 3),
                ),
              );
            }
          },
          builder: (context, state) {
            final bloc = context.read<NameLanguageBloc>();
            final saving = state is NameLanguageSaving;
            final nameOk = widget.showNameField
                ? state.name.trim().isNotEmpty
                : true;
            final canSubmit =
                nameOk && state.selectedLanguage.isNotEmpty && !saving;

            return Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.medium,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  SizedBox(height: widget.showNameField ? 32 : 24),
                  if (widget.showNameField) ...<Widget>[
                    _NameField(
                      controller: _nameController,
                      focusNode: _nameFocus,
                      enabled: !saving,
                      onChanged: (v) => bloc.add(NameChanged(v)),
                    ),
                    const SizedBox(height: 24),
                  ],
                  if (widget.showLanguageField) ...<Widget>[
                    Text(
                      'Choose your language',
                      key: const Key('name-language-language-heading'),
                      style: AppText.headingXs(color: AppColors.black),
                    ),
                    const SizedBox(height: AppSpacing.medium),
                    Expanded(
                      // The list comes from `GET /languages` — the app ships no
                      // copy — so there are three render modes: in-flight, failed
                      // (unusable, offer Retry), and loaded.
                      child: state is NameLanguageLoading
                          ? const Center(
                              key: Key('name-language-loading'),
                              child: CircularProgressIndicator(),
                            )
                          : (state is NameLanguageError &&
                                  state.isLanguagesFailure)
                              ? _LanguagesUnavailable(
                                  message: state.message,
                                  onRetry: () =>
                                      bloc.add(const LanguagesRequested()),
                                )
                              : _LanguageGrid(
                                  languages: state.languages,
                                  selectedCode: state.selectedLanguage,
                                  disabled: saving,
                                  onSelect: (code) =>
                                      bloc.add(LanguageSelected(code)),
                                ),
                    ),
                  ] else
                    // No language picker on this variant — the bloc has already
                    // seeded the default language. Push the CTA to the bottom.
                    const Spacer(),
                  _ContinueCta(
                    label: widget.ctaLabel,
                    enabled: canSubmit,
                    loading: saving,
                    onPressed: () => bloc.add(const ContinueTapped()),
                  ),
                  SizedBox(
                    height:
                        AppSpacing.large + MediaQuery.of(context).padding.bottom,
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

/// Pill "Name" field — same pattern as the phone-input floating-label field,
/// but the field's bg is `Colors/Brand/100` cream so the floating label chip
/// blends with the scaffold rather than a white card.
class _NameField extends StatelessWidget {
  const _NameField({
    required this.controller,
    required this.focusNode,
    required this.enabled,
    required this.onChanged,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool enabled;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: <Widget>[
        Container(
          height: 56,
          decoration: BoxDecoration(
            color: AppColors.brand100,
            borderRadius: BorderRadius.circular(AppRadius.pill),
            border: Border.all(color: AppColors.brand300, width: 1.5),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 22.5),
          alignment: Alignment.centerLeft,
          child: TextField(
            key: const Key('name-language-name-field'),
            controller: controller,
            focusNode: focusNode,
            enabled: enabled,
            maxLength: 64,
            textInputAction: TextInputAction.done,
            onChanged: onChanged,
            style: AppText.bodyMd(color: AppColors.black),
            cursorColor: AppColors.brand300,
            decoration: InputDecoration(
              isCollapsed: true,
              border: InputBorder.none,
              counterText: '',
              hintText: 'John doe',
              hintStyle: AppText.bodyMd(color: AppColors.grey300),
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ),
        Positioned(
          left: 18.5,
          top: -8.5,
          child: Container(
            color: AppColors.brand100,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              'Name',
              key: const Key('name-language-name-floating-label'),
              style: AppText.labelSm(color: AppColors.brand300),
            ),
          ),
        ),
      ],
    );
  }
}

/// Shown when `GET /languages` fails. The screen cannot function without the
/// list and there is deliberately no bundled fallback — this route is only
/// reachable post-OTP and cannot be completed without `PATCH /users/me`, so a
/// baked-in list would only let someone pick a language and then fail to save.
class _LanguagesUnavailable extends StatelessWidget {
  const _LanguagesUnavailable({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('name-language-unavailable'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            message,
            textAlign: TextAlign.center,
            style: AppText.bodyMd(color: AppColors.grey500),
          ),
          const SizedBox(height: AppSpacing.medium),
          TextButton(
            key: const Key('name-language-retry'),
            onPressed: onRetry,
            child: Text(
              'Retry',
              style: AppText.labelLg(color: AppColors.brand300),
            ),
          ),
        ],
      ),
    );
  }
}

class _LanguageGrid extends StatelessWidget {
  const _LanguageGrid({
    required this.languages,
    required this.selectedCode,
    required this.disabled,
    required this.onSelect,
  });

  /// Server-supplied (`GET /languages`) — never a bundled constant.
  final List<LanguageOption> languages;
  final String selectedCode;
  final bool disabled;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    // Manual 4×2 grid — GridView.builder is lazy and would leave off-screen
    // cells unbuilt in shorter viewports (e.g. widget tests), whereas the
    // Figma design always shows all 8 cards. A Column of Rows with fixed
    // row heights guarantees every cell renders eagerly, and the whole grid
    // is scrollable inside its parent Expanded when the viewport is short.
    const int columns = 2;
    const double gap = 10; // Figma: 117.5 - 107.5 = 10 between rows / cols.
    const double rowHeight = 103.25; // Figma card height verbatim.
    final int rowCount = (languages.length + columns - 1) ~/ columns;

    return SingleChildScrollView(
      key: const Key('name-language-grid'),
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (int row = 0; row < rowCount; row++) ...<Widget>[
            if (row > 0) const SizedBox(height: gap),
            SizedBox(
              height: rowHeight,
              child: Row(
                children: <Widget>[
                  for (int col = 0; col < columns; col++) ...<Widget>[
                    if (col > 0) const SizedBox(width: gap),
                    Expanded(child: _cardAt(row * columns + col)),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _cardAt(int index) {
    if (index >= languages.length) {
      return const SizedBox.shrink();
    }
    final option = languages[index];
    final bool isSelected = option.code == selectedCode;
    return _LanguageCard(
      option: option,
      isSelected: isSelected,
      disabled: disabled,
      onTap: () => onSelect(option.code),
    );
  }
}

class _LanguageCard extends StatelessWidget {
  const _LanguageCard({
    required this.option,
    required this.isSelected,
    required this.disabled,
    required this.onTap,
  });

  final LanguageOption option;
  final bool isSelected;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final Color borderColor =
        isSelected ? AppColors.brand300 : AppColors.grey300;
    return InkWell(
      key: Key('name-language-card-${option.code}'),
      onTap: disabled ? null : onTap,
      borderRadius: BorderRadius.circular(AppRadius.button),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(AppRadius.button),
          border: Border.all(color: borderColor, width: 1),
        ),
        padding: const EdgeInsets.symmetric(vertical: 21),
        child: Stack(
          clipBehavior: Clip.none,
          children: <Widget>[
            // Native + english labels, centered with space-between per Figma.
            Positioned.fill(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: <Widget>[
                  Text(
                    option.nativeLabel,
                    key: Key('name-language-native-${option.code}'),
                    // Figma: Inter Medium 18/24 in Colors/Grey/500.
                    style: AppText.bodyMd(color: AppColors.grey500).copyWith(
                      fontSize: 18,
                      fontWeight: FontWeight.w500,
                      height: 24 / 18,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  Text(
                    option.englishLabel,
                    key: Key('name-language-english-${option.code}'),
                    // Figma: Inter SemiBold 18/24 in Colors/Grey/500.
                    style: AppText.bodyMd(color: AppColors.grey500).copyWith(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      height: 24 / 18,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
            if (isSelected)
              Positioned(
                // Figma: left-[129px] top-[6px] with size 24 — inside the 159px card
                // that puts the check ~30px from the top edge, near the top-right.
                right: 6,
                top: 6,
                child: SvgPicture.asset(
                  'assets/onboarding/language-check.svg',
                  key: Key('name-language-check-${option.code}'),
                  width: 24,
                  height: 24,
                  colorFilter: const ColorFilter.mode(
                    AppColors.brand300,
                    BlendMode.srcIn,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Orange-gradient "Continue" CTA — same widget family as `Get OTP` / `Submit`.
class _ContinueCta extends StatelessWidget {
  const _ContinueCta({
    required this.enabled,
    required this.loading,
    required this.onPressed,
    this.label = 'Continue',
  });

  final bool enabled;
  final bool loading;
  final VoidCallback onPressed;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: SizedBox(
        height: 44,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: AppGradient.ctaLR,
            borderRadius: BorderRadius.circular(AppRadius.button),
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              key: const Key('name-language-continue-cta'),
              onTap: enabled ? onPressed : null,
              borderRadius: BorderRadius.circular(AppRadius.button),
              splashColor: Colors.white.withValues(alpha: 0.15),
              child: Center(
                child: loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.4,
                          valueColor:
                              AlwaysStoppedAnimation<Color>(AppColors.white),
                        ),
                      )
                    : Text(
                        label,
                        style: AppText.labelLg(color: AppColors.white),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
