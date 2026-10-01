import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../core/app_config.dart';
import '../../../core/entitlement.dart';
import '../../../core/theme.dart';
import '../../../core/user_properties.dart';
import '../../../shared/widgets/in_app_webview_screen.dart';
import '../../../state/providers.dart';
import '../../home/home_routes.dart';
import '../../paywall/paywall_analytics.dart';
import '../../paywall/presentation/paywall_screen.dart';
import '../../status/status_providers.dart';
import '../profile_analytics.dart';
import 'logout_confirmation_dialog.dart';
import 'widgets/profile_identity_card.dart';
import 'widgets/profile_section.dart';

/// Canonical `screen_name` value for this screen, reused by every event
/// fired from Profile v2 (`source_screen: 'profile_menu'`). Kept identical
/// to v1 so downstream analytics keep receiving the same value — the v2
/// swap must be transparent to the analytics contract.
const String _kProfileMenuScreen = 'profile_menu';

/// Profile & Settings v2 (TAM-N-profile-v2). Rendered against Figma frames
/// `1923:17987` (Free) and `1932:19560` (VIP). The choice is driven by
/// `entitlementProvider`; every downstream row is state-agnostic.
///
/// Layout intent — the screen root is a `Column` (no `SingleChildScrollView`
/// at root). The Account & Legal section lives inside a flex-fill `Expanded`
/// so a tall (1200 dp) or short (600 dp) device scrolls only that region
/// and never mis-places the fixed identity card at the top. See the spec's
/// Layout intent table.
class ProfileScreenV2 extends ConsumerStatefulWidget {
  const ProfileScreenV2({super.key});

  @override
  ConsumerState<ProfileScreenV2> createState() => _ProfileScreenV2State();
}

class _ProfileScreenV2State extends ConsumerState<ProfileScreenV2> {
  @override
  void initState() {
    super.initState();
    // Row 141 — same as v1, kept intact by the analytics contract. Fires
    // once on mount with `previous_screen: 'home'` (the profile screen is
    // only reachable from the home header avatar).
    unawaited(
      ref.read(analyticsProvider)?.trackEvent(
            ProfileEvents.pageViewed,
            properties: <String, Object?>{
              ProfileEventProps.previousScreen: 'home',
            },
          ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isVip = ref.watch(entitlementProvider);
    final meAsync = ref.watch(meProvider);
    final statusProfileAsync = ref.watch(statusProfileProvider);

    // Fallback chain (spec §Backend integration): personalDisplayName →
    // MeUser.name → Figma placeholder. Do NOT invert the order; a first-
    // time user who never touched Status still has a MeUser.name from
    // onboarding, and we want to show that ahead of an "Add your name"
    // placeholder.
    final me = meAsync.value;
    final statusProfile = statusProfileAsync.value;
    final displayName =
        (statusProfile?.personalDisplayName?.trim().isNotEmpty ?? false)
            ? statusProfile!.personalDisplayName
            : me?.name;
    final avatarUrl = statusProfile?.avatarImageUrl;
    final phone = _formatPhone(
      code: me?.phoneCountryCode,
      number: me?.phoneNumber,
    );

    return Scaffold(
      key: const Key('profile-screen-v2'),
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: Column(
          key: const Key('profile-v2-root'),
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            const _TopBar(),
            ProfileIdentityCard(
              avatarImageUrl: avatarUrl,
              displayName: displayName,
              phone: phone,
              isVip: isVip,
              onEditTap: () => context.push(HomeRoutes.editProfile),
            ),
            const SizedBox(height: AppSpacing.large),
            // Account & Legal is the flex-fill zone per the spec's Layout
            // intent table — the sole scrollable in the tree, wrapping the
            // whole card stack so a short viewport (600 dp) can reach the
            // Log out row and a tall viewport (1200 dp) doesn't leave a
            // giant empty band above nothing.
            Expanded(
              key: const Key('profile-v2-scroll-region'),
              child: SingleChildScrollView(
                key: const Key('profile-v2-scroll'),
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.medium,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    const ProfileSectionHeader(label: 'VIP Membership'),
                    ProfileSectionCard(
                      key: const Key('profile-v2-vip-card'),
                      children: <Widget>[
                        ProfileSettingTile(
                          key: Key(isVip
                              ? 'profile-v2-manage-subscription'
                              : 'profile-v2-upgrade-to-vip'),
                          leadingIcon: Icons.star_rounded,
                          leadingColor: const Color(0xFFEEB211),
                          label: isVip
                              ? 'Manage Subscription'
                              : 'Upgrade to VIP',
                          onTap: () {
                            if (isVip) {
                              // TAM-125 — VIPs push into the Manage
                              // Subscription details screen (Figma
                              // `1939:19854` / `1939:20420`). Free-tier
                              // branch below stays intact.
                              context.push(HomeRoutes.subscription);
                              return;
                            }
                            context.push(
                              '/paywall',
                              extra: const PaywallArgs(
                                triggerModule: UserPropertyModule.profile,
                                triggerAction: PaywallTriggerAction.upgradeCta,
                                entrySource: PaywallEntrySource.profile,
                              ),
                            );
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.large),
                    const ProfileSectionHeader(label: 'Help & Support'),
                    ProfileSectionCard(
                      key: const Key('profile-v2-support-card'),
                      children: <Widget>[
                        ProfileSettingTile(
                          key: const Key('profile-v2-support'),
                          leadingIcon: Icons.help_outline_rounded,
                          label: 'Support',
                          onTap: () {
                            // Coordination note (spec): the support screen
                            // ships in a parallel ticket. GoRouter will log
                            // a warning if `/support` isn't registered
                            // yet — that's fine, we do NOT crash and we do
                            // NOT link to a broken route deliberately. Once
                            // the parallel ticket lands, this tap resolves
                            // without any code change here.
                            context.push('/support');
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.large),
                    const ProfileSectionHeader(label: 'Account & Legal'),
                    ProfileSectionCard(
                      key: const Key('profile-v2-legal-card'),
                      children: <Widget>[
                        ProfileSettingTile(
                          key: const Key('profile-v2-terms'),
                          leadingIcon: Icons.description_outlined,
                          label: 'Terms & Conditions',
                          onTap: () => _openLegal(
                            context,
                            title: 'Terms & Conditions',
                            url: AppConfig.instance.termsOfServiceUrl,
                            clickEvent: ProfileEvents.termsClicked,
                            viewedEvent: ProfileEvents.termsViewed,
                          ),
                        ),
                        const ProfileTileDivider(),
                        ProfileSettingTile(
                          key: const Key('profile-v2-privacy'),
                          leadingIcon: Icons.shield_outlined,
                          label: 'Privacy Policy',
                          onTap: () => _openLegal(
                            context,
                            title: 'Privacy Policy',
                            url: AppConfig.instance.privacyPolicyUrl,
                            clickEvent: ProfileEvents.privacyPolicyClicked,
                            viewedEvent: ProfileEvents.privacyPolicyViewed,
                          ),
                        ),
                        const ProfileTileDivider(),
                        ProfileSettingTile(
                          key: const Key('profile-v2-pricing'),
                          leadingIcon: Icons.currency_rupee,
                          label: 'Pricing Policy',
                          onTap: () => _openLegal(
                            context,
                            title: 'Pricing Policy',
                            url: AppConfig.instance.pricingPolicyUrl,
                            // No sheet-1 row for Pricing / Data-deletion —
                            // opens silently (see v1 comment for provenance).
                            clickEvent: null,
                            viewedEvent: null,
                          ),
                        ),
                        const ProfileTileDivider(),
                        ProfileSettingTile(
                          key: const Key('profile-v2-deletion'),
                          leadingIcon: Icons.newspaper,
                          label: 'Data deletion',
                          onTap: () => _openLegal(
                            context,
                            title: 'Data deletion',
                            url: AppConfig.instance.dataDeletionUrl,
                            clickEvent: null,
                            viewedEvent: null,
                          ),
                        ),
                        const ProfileTileDivider(),
                        ProfileSettingTile(
                          key: const Key('profile-v2-language'),
                          leadingIcon: Icons.translate_rounded,
                          label: 'Select Language',
                          onTap: () => context.push(HomeRoutes.language),
                        ),
                        const ProfileTileDivider(),
                        ProfileSettingTile(
                          key: const Key('profile-v2-logout'),
                          leadingIcon: Icons.logout_rounded,
                          label: 'Log out',
                          onTap: () async {
                            // Row 149 — intent event fires FIRST (before the
                            // confirmation dialog) so the funnel sees users
                            // who dismissed the dialog as "clicked but
                            // didn't complete" (`logout_result` never
                            // fires in that path).
                            unawaited(
                              ref.read(analyticsProvider)?.trackEvent(
                                ProfileEvents.logoutClicked,
                                properties: <String, Object?>{
                                  ProfileEventProps.sourceScreen:
                                      _kProfileMenuScreen,
                                },
                              ),
                            );
                            await showLogoutConfirmationDialog(context, ref);
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.medium),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Return the phone number for the identity card without the country
  /// code. Returns null when the number is missing so the widget
  /// suppresses the row entirely.
  String? _formatPhone({String? code, String? number}) {
    final n = (number ?? '').trim();
    if (n.isEmpty) return null;
    return n;
  }

  /// Opens the given URL in the shared in-app webview. Ported verbatim
  /// from the v1 `profile_menu_screen.dart._openLegal` so the analytics
  /// events (`terms_clicked`, `terms_viewed`, and the privacy pair) still
  /// fire exactly the same way — the v2 rewrite must be a no-op for the
  /// analytics contract.
  void _openLegal(
    BuildContext context, {
    required String title,
    required String url,
    required String? clickEvent,
    required String? viewedEvent,
  }) {
    final uri = Uri.tryParse(url);
    if (uri == null || url.isEmpty) return;

    if (clickEvent != null) {
      unawaited(
        ref.read(analyticsProvider)?.trackEvent(
          clickEvent,
          properties: <String, Object?>{
            ProfileEventProps.documentVersion: null,
            ProfileEventProps.sourceScreen: _kProfileMenuScreen,
          },
        ),
      );
    }

    final analytics = ref.read(analyticsProvider);
    context.push(
      '/webview',
      extra: InAppWebViewArgs(
        title: title,
        url: url,
        onLoaded: viewedEvent == null
            ? null
            : (loadTimeMs) {
                unawaited(
                  analytics?.trackEvent(
                    viewedEvent,
                    properties: <String, Object?>{
                      ProfileEventProps.documentVersion: null,
                      ProfileEventProps.loadTimeMs: loadTimeMs,
                    },
                  ),
                );
              },
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      key: const Key('profile-v2-appbar'),
      height: AppNav.height,
      child: Row(
        children: <Widget>[
          const SizedBox(width: AppSpacing.xSmall),
          InkResponse(
            key: const Key('profile-v2-back'),
            radius: 24,
            onTap: () => Navigator.of(context).maybePop(),
            child: SizedBox(
              width: 44,
              height: 44,
              child: Center(
                child: SvgPicture.asset(
                  'assets/aarti/back-arrow.svg',
                  width: 24,
                  height: 24,
                  colorFilter: const ColorFilter.mode(
                    AppColors.black,
                    BlendMode.srcIn,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.xSmall),
          Expanded(
            child: Text(
              'Profile & Settings',
              key: const Key('profile-v2-title'),
              style: AppText.headingSm(color: AppColors.black),
            ),
          ),
        ],
      ),
    );
  }
}

