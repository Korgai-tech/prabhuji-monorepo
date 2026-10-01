# Onboarding + Paywall Analytics Contract

**Ticket**: TAM-55 (Wave 4 hardening pass — `specs/TAM-55-mobile-onboarding-and-paywall-analytics-events.md`).
**Source of truth**: `rough_plan/onboarding-plan/screen-spec.yaml` §`analytics_events`
and PRD §9 (`rough_plan/onboarding-plan/prd.md`).

This doc is the reference for anyone touching an onboarding or paywall event on
the mobile client. It sits on top of the generic
[`docs/ANALYTICS-FLUTTER-GUIDE.md`](ANALYTICS-FLUTTER-GUIDE.md) — read that first
for the `Analytics.trackEvent` API, the "action vs. user vs. workspace"
scoping rules, and the local verification loop.

## Common attributes (injected on every event by `AnalyticsEnricher`)

The Wave-4 `AnalyticsEnricher` (`apps/mobile/lib/core/analytics_enricher.dart`)
folds these into every payload — callers never set them by hand. Caller-supplied
keys always override the enricher (defensive).

| Attribute | Source | Notes |
| --- | --- | --- |
| `user_id` | `SessionContext.userId` (JWT `sub`) | Null before OTP verify. |
| `anonymous_id` | `SharedPreferences['anonymous_id']` (UUID v4) | Reused across launches; wiped on uninstall. |
| `session_id` | UUID v4 generated at cold-start | Static field on the enricher; held until app kill. |
| `app_version` | `package_info_plus.PackageInfo.version` | Empty string under `flutter test`. |
| `build_number` | `package_info_plus.PackageInfo.buildNumber` | Same fallback. |
| `platform` | `dart:io Platform` | `'android'` or `'ios'`. |
| `device_locale` | `Platform.localeName` | e.g. `en_US`. |
| `selected_language` | `SessionContext.selectedLanguage` | Set by the orchestrator on `/users/me` and by the name+language bloc on save. |
| `subscription_status` | `SessionContext.subscriptionStatus` | Written by the orchestrator after `/subscription/status`. |
| `entry_point` | `SessionContext.entryPoint` | `'cold_start'` on first launch; flipped to `'resume'` by the app-level `WidgetsBindingObserver`. |
| `config_version` | `SessionContext.paywallConfigVersion` | Set by `PaywallBloc` on `PaywallReady`. |
| `experiment_variant` | Always `null` in Phase 1 | No experiment framework wired yet. |
| `network_status` | **Omitted for Phase 1** | Would require `connectivity_plus`; noted as future work. |

`SessionContext` (`apps/mobile/lib/core/session_context.dart`) is a plain
in-memory holder registered as a `get_it` singleton — blocs write, the enricher
reads. See its class docs for field semantics.

## Prohibited attributes (`do_not_track`)

From `screen-spec.yaml.analytics_rules.do_not_track`:

- `raw_phone_number` — use `country_code` (+ `phone_number_length`) instead.
- `otp_value` — use `otp_digit_count_entered` + `attempt_count` instead.
- `raw_user_name` — use `name_present` + `name_length_bucket` instead.
- `sensitive_payment_details` — use `payment_provider`, `order_id`, and a
  sanitized `error_code` only. Never card / UPI details.

`apps/mobile/test/analytics/no_pii_leak_test.dart` enforces this at test time:

- Walks the full funnel via bloc events (no widgets).
- For every recorded event's `properties`, walks all string values
  (recursively) and asserts none match the patterns above.
- Special-cases the phone-only stub email (`otp-…@prabhuji.internal`) so the
  legitimate UPI/VPA regex doesn't false-positive on it.
- Also asserts no banned property KEY is used (`otp_value`, `raw_phone_number`,
  `raw_user_name`, `sensitive_payment_details`, and common footguns like
  `phone_number` / `otp` / `name` / `card_number`).

Every new event dispatch site MUST keep this test green.

## Event contract (Phase 1 required unless noted)

Trigger-point column names the file that owns the dispatch. Attributes are the
per-event fields on top of the common-attribute bag above.

### Onboarding funnel

| Event | Trigger point (file) | Required attributes |
| --- | --- | --- |
| `onboarding_app_opened` | `splash/presentation/splash_screen.dart` (once per process) | `entry_point` |
| `onboarding_splash_viewed` | `splash/presentation/splash_screen.dart` | `config_fetch_started`, `session_check_started` |
| `onboarding_route_decided` | `onboarding/bloc/onboarding_orchestrator_bloc.dart` | `route_to`, `reason`, `subscription_status?`, `has_completed_onboarding?` |
| `onboarding_phone_choice_viewed` | `phone/presentation/phone_choice_screen.dart` | `available_login_methods`, `terms_checked_default` |
| `onboarding_phone_continue_tapped` | `phone/presentation/phone_choice_screen.dart` | `terms_accepted` |
| `onboarding_phone_input_viewed` | `phone/presentation/phone_input_screen.dart` | `country_code_default`, `country_picker_available` |
| `onboarding_terms_toggled` (opt) | `phone/presentation/terms_row.dart` | `checked`, `screen_name` |
| `legal_link_tapped` | `phone/presentation/terms_row.dart` | `source_screen`, `link_type`, `url_available` |
| `onboarding_get_otp_tapped` | `phone/presentation/phone_input_screen.dart` | `country_code`, `phone_number_length`, `terms_accepted`, `is_phone_valid_client_side` |
| `onboarding_otp_request_result` | `phone/bloc/phone_otp_bloc.dart` | `result`, `error_code?`, `latency_ms`, `resend_available_after_seconds` |
| `onboarding_otp_screen_viewed` | `otp/presentation/otp_screen.dart` | `country_code`, `phone_number_length`, `otp_length_configured`, `resend_timer_seconds` |
| `onboarding_change_number_tapped` | `otp/bloc/otp_bloc.dart` | `otp_attempt_count`, `resend_count` |
| `onboarding_otp_submitted` | `otp/bloc/otp_bloc.dart` | `otp_digit_count_entered`, `attempt_count`, `resend_count`, `terms_accepted` |
| `onboarding_otp_verified` | `otp/bloc/otp_bloc.dart` | `attempt_count`, `resend_count`, `latency_ms`, `is_new_user` |
| `onboarding_otp_failed` | `otp/bloc/otp_bloc.dart` | `attempt_count`, `resend_count`, `error_code`, `latency_ms`, `temporary_block_applied` |
| `onboarding_resend_otp_tapped` | `otp/bloc/otp_bloc.dart` | `resend_count`, `seconds_since_last_otp` |
| `onboarding_resend_otp_result` | `otp/bloc/otp_bloc.dart` | `result`, `resend_count`, `error_code?`, `latency_ms`, `next_resend_available_after_seconds` |
| `onboarding_language_screen_viewed` | `profile/bloc/name_language_bloc.dart` (`ScreenViewed`) | `default_language`, `available_languages`, `preselected_language`, `name_prefilled` |
| `onboarding_language_selected` | `profile/bloc/name_language_bloc.dart` | `selected_language`, `previous_language`, `was_default_selection` |
| `onboarding_name_field_completed` (opt) | `profile/bloc/name_language_bloc.dart` | `name_length_bucket` |
| `onboarding_language_continue_tapped` | `profile/bloc/name_language_bloc.dart` | `selected_language`, `name_present`, `name_length_bucket`, `is_form_valid` |
| `onboarding_profile_saved` | `profile/bloc/name_language_bloc.dart` | `result`, `selected_language`, `error_code?`, `latency_ms` |
| `onboarding_completed` | `profile/bloc/name_language_bloc.dart` | `selected_language`, `login_method` |

### Paywall funnel

| Event | Trigger point (file) | Required attributes |
| --- | --- | --- |
| `paywall_config_loaded` | `paywall/bloc/paywall_bloc.dart` | `source`, `config_version`, `locale_requested`, `locale_served`, `fallback_used`, `fallback_from?`, `has_valid_video`, `valid_plan_count`, `benefit_count` |
| `paywall_config_failed` | `paywall/bloc/paywall_bloc.dart` | `error_code`, `error_message_key`, `cache_available`, `fallback_available`, `route_after_failure` |
| `paywall_no_valid_plans` | `paywall/bloc/paywall_bloc.dart` | `config_version`, `locale_requested`, `locale_served`, `route_after_failure`, `reason` |
| `paywall_localization_fallback_used` | `paywall/bloc/paywall_bloc.dart` | `selected_language`, `requested_locale`, `served_locale`, `fallback_level`, `missing_fields` |
| `paywall_viewed` | `paywall/bloc/paywall_bloc.dart` | `trigger`, `paywall_id`, `config_version`, `locale_served`, `subscription_status`, `selected_plan_id`, `selected_plan_period`, `selected_product_id`, `display_price`, `currency`, `trial_available`, `trial_days`, `benefit_count`, `video_id`, `paywall_impression_count_for_user` |
| `paywall_closed` | `paywall/bloc/paywall_bloc.dart` (`CloseTapped`) | `trigger`, `route_after_close`, `time_on_paywall_seconds?`, `selected_plan_id?`, `selected_plan_period?`, `paywall_impression_count_for_user?`, `video_played?` |
| `paywall_video_tapped` | `paywall/bloc/paywall_bloc.dart` | `paywall_id`, `video_id`, `is_playing_after_tap` |
| `paywall_video_paused` (opt) | `paywall/bloc/paywall_bloc.dart` (`AppBackgrounded`) | `paywall_id`, `video_id`, `reason` |
| `paywall_plan_selected` | `paywall/bloc/paywall_bloc.dart` | `paywall_id`, `previous_plan_id`, `selected_plan_id`, `selected_plan_period`, `display_price`, `trial_days` |
| `paywall_pay_now_tapped` | `paywall/bloc/payment_placeholder_bloc.dart` | `selected_plan_id`, `selected_plan_period`, `selected_product_id`, `display_price`, `currency`, `trial_available`, `trial_days`, `payment_provider` (Phase 1: `'none'`), `payment_method_displayed` |
| `paywall_payment_deferred` (Phase 1 only) | `paywall/bloc/payment_placeholder_bloc.dart` | `selected_plan_id`, `reason` (`'no_provider_configured'`) |
| `paywall_subscription_status_checked` | `onboarding/bloc/onboarding_orchestrator_bloc.dart` | `status`, `is_pro` |
| `paywall_subscription_restored` | `onboarding/bloc/onboarding_orchestrator_bloc.dart` | `status` |

**Not yet dispatched in Phase 1** (deferred with the Razorpay integration — see
`specs/TAM-55` §Notes and PRD §10):
`paywall_video_autoplay_started`, `paywall_video_completed`,
`paywall_video_failed`, `paywall_benefits_viewed`,
`paywall_payment_method_tapped`, `paywall_payment_started`,
`paywall_payment_success`, `paywall_payment_failed`,
`paywall_payment_cancelled`, `paywall_payment_pending`.

## Special attribute: `paywall_impression_count_for_user`

Persisted in `SharedPreferences` under `paywall_impression_count`
(`PaywallBloc.kImpressionCountKey`). Bumped on every `ConfigRequested` (i.e.
every fresh mount of `/paywall`) and included in BOTH `paywall_viewed` and
`paywall_closed` payloads — Wave 3 wired this end-to-end. Persistence survives
app kill; only an app uninstall (or explicit clear) resets it.

## Maestro happy-path flow

`apps/mobile/maestro/onboarding_happy_path.yaml` walks the full funnel with
tag `onboarding`. Runnable via `pnpm nx run mobile:maestro` (requires an
Android emulator OR Maestro Cloud). Authored under TAM-55; **not executed** as
part of the ticket — QAS runs it against a device build.

## Reference

- `apps/mobile/lib/core/analytics.dart` — the seam.
- `apps/mobile/lib/core/analytics_enricher.dart` — the common-attribute pipe.
- `apps/mobile/lib/core/session_context.dart` — the shared bloc-fed store the
  enricher reads from.
- `apps/mobile/test/analytics/no_pii_leak_test.dart` — the non-negotiable safety net.
- `docs/ANALYTICS-FLUTTER-GUIDE.md` — general Flutter analytics conventions.
- `docs/ANALYTICS-EVENT-CONTRACT.md` — the wire contract to the collector.
- `rough_plan/onboarding-plan/screen-spec.yaml` §`analytics_events` — the
  cross-team source of truth for names + attributes.
- `rough_plan/onboarding-plan/prd.md` §9 — PRD required-event list.
