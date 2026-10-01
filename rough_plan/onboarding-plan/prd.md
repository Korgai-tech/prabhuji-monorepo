# PRD: Prabhuji Onboarding + Paywall

## 1. Module Summary

App: Prabhuji
Module: Onboarding + Paywall
Screen: Splash, Phone Login, OTP, Name + Language, VIP Membership Paywall
Feature type: Account onboarding, language setup, monetization entry point
Version: v1.0
Status: approved
Figma source: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=520-4992&t=TzCwzI6RZASLubyK-1

This module gets a new Prabhuji user into the app through a simple phone OTP login flow. The flow collects phone number, confirms OTP, asks for name, and asks for preferred language. Login is mandatory for MVP. There is no guest mode in Phase 1.

After the user completes name and language selection, the app shows the Prabhuji VIP Membership paywall. The user can subscribe or close the paywall and continue to Home. This keeps the monetization moment clear while still allowing free users to explore devotional content before paying.

This module is also used on future app opens. If the user is logged in, onboarding is complete, and the user is still free, the app shows the paywall again before Home. This is a confirmed exception to the usual Prabhuji default of avoiding paywall on entry. Active Pro users should not see this app-open paywall.

## 2. Product Intent

The intent is to onboard users with minimum friction and collect the basic information needed for personalization: phone number, name, and language.

The paywall intent is to introduce Prabhuji VIP early, while still allowing users to close and explore. The paywall should present Pro as added devotional value, not as payment required for basic worship.

The flow should stay simple for older and mass-market Android users. The UI should feel warm, devotional, and readable on 360px screens.

## 3. User Goals

- Open the app and understand that it is Prabhuji.
- Log in with an Indian mobile number.
- Receive and submit OTP.
- Correct a phone number if it was entered wrong.
- Recover from wrong OTP or resend OTP.
- Enter name.
- Choose preferred language.
- Understand the VIP offer.
- Subscribe if interested.
- Close the paywall and explore Home without paying.

## 4. Business Goals

- Get users onboarded with a verified phone login.
- Capture name and language for personalized UI and content.
- Introduce VIP Membership immediately after onboarding.
- Convert free users to Pro through a clear paywall.
- Allow plan, price, paywall copy, benefits, and video changes without an app update.
- Track the full onboarding and paywall conversion funnel.

## 5. Free vs Pro Behavior

### Free User

Free users can:

- Complete mandatory phone OTP login.
- Enter name.
- Select language.
- View the VIP Membership paywall after onboarding.
- Close the paywall and go to Home.
- Explore free discovery surfaces according to each module package.

Free users should not see:

- Any Pro-active state after payment failure or cancellation.
- Pro/VIP badge unless subscription is active.
- Hard blocks that prevent Home access after paywall close.

Paywall trigger rules for free users:

- Show paywall after successful name and language save during first onboarding.
- Show paywall again on every future app open if the user is logged in, onboarding is complete, and subscription is not active.
- Do not show confirmation when the user closes the paywall.
- Closing paywall routes directly to Home.
- If no valid paywall plans are available, do not block onboarding. Route user to Home.

### Pro User

Pro users can:

- Complete onboarding if they are a new user.
- Restore or be recognized as active Pro if subscription is already active.
- Skip the app-open paywall.
- Go directly to Home after splash/session check.

Pro users should not see:

- The onboarding paywall on every app open.
- Payment CTA for an already active plan in this onboarding paywall.

## 6. Section and Feature Requirements

### 6.1 Splash

The splash screen shows the Prabhuji logo on a warm devotional background. The rendered Figma snapshot also shows a small secure trust line.

Behavior:

- On app launch, show splash while the app checks session, onboarding state, subscription state, and initial config.
- If user is logged out, route to Phone Choice or Phone Input.
- If user is logged in but onboarding is incomplete, route to the first incomplete onboarding step.
- If user is logged in, onboarding is complete, and user is free, route to Paywall.
- If user is logged in, onboarding is complete, and user is Pro, route to Home.
- If config fetch fails, route based on cached session and cached subscription state.

### 6.2 Phone Choice

Figma shows a bottom login panel with Prabhuji branding and a primary action: Continue with Phone Number.

Behavior:

- Phone login is mandatory for MVP.
- Social login icons visible in Figma should not be enabled unless engineering/product confirms them. Phase 1 behavior is phone login only.
- Tapping Continue with Phone Number opens Phone Input.
- Terms checkbox is checked by default.
- Terms acceptance is required.
- Privacy Policy and Terms of Service links must open production URLs.

### 6.3 Phone Input

The phone input screen asks for an Indian phone number and has Get OTP.

Behavior:

- India-only for MVP.
- Country code is fixed to +91.
- No country picker in Phase 1.
- Client should validate phone number format before OTP request.
- Do not send OTP if terms checkbox is unchecked.
- Disable Get OTP when terms are unchecked or phone number is invalid.
- On successful OTP request, route to OTP screen.
- On OTP request failure, show a simple readable error.
- Do not send raw phone number to analytics.

### 6.4 OTP

Figma shows 4 OTP boxes, Submit, Change No., and Resend OTP with countdown. Designer confirmed exact OTP rules are engineering-owned and should follow existing internal app logic such as Dostii.

Behavior:

- OTP length, resend timer, retry limit, and temporary block rules are owned by engineering/auth provider.
- Figma is visual reference for OTP UI and error state.
- Submit is disabled until the required OTP digit count is entered.
- Tapping Submit verifies OTP.
- If OTP is correct, route to Name + Language.
- If OTP is wrong, show Invalid OTP state.
- Tapping Change No. returns to Phone Input with previous number editable.
- Resend OTP is disabled during countdown and active after countdown.
- Active resend requests a new OTP and restarts resend timer.

### 6.5 Name + Language

Figma shows a name field, Choose your language title, 8 language cards, and Continue.

Behavior:

- Name is mandatory.
- Language is mandatory.
- Hindi is selected by default.
- Continue is enabled only when name is non-empty and a language is selected.
- Selected language applies to both app UI and content preference.
- If selected-language copy or content is unavailable, fallback order is Hindi first, then English.
- Phase 1 language list shown in Figma is Hindi, Marathi, Gujarati, Bengali, Odia, Tamil, Telugu, Kannada.
- Final language list is still an open discussion item, but Phase 1 implementation should use these 8 unless changed before build.
- On successful save, route to Paywall.
- If save fails, keep user on screen and show retry.

### 6.6 Paywall Header and Video

The paywall is titled Prabhuji VIP Membership and contains a header media area. Designer confirmed this is a video and must be changeable without app update.

Behavior:

- Video source comes from CMS or remote config.
- Video should autoplay.
- Video should not be muted by default.
- Tapping video toggles play and pause.
- If the app goes to background, pause video.
- If video fails, show cached video if available or fallback image.
- If no video or image fallback is available, keep paywall usable and show the plans.
- Video can be localized in Phase 1 if CMS provides language-specific video assets.

### 6.7 Paywall Localization

Paywall localization is Phase 1.

Behavior:

- Paywall copy should use the selected language.
- CMS or remote config should provide localized values for title, plan labels, trial label, subscription details, benefits heading, benefit names, Cancel Anytime, Refund Policy, Pay Now CTA, and payment state messages.
- Fallback order is selected language, then Hindi, then English.
- If some fields are missing, log localization fallback and use fallback fields.
- Prices and product validity come from billing/payment backend, not translation config.

### 6.8 Paywall Plans and Benefits

Figma shows plan tabs: Per Week, Per Month, Per Quarter. The plan card shows Free trial, price, subscription detail, VIP Benefits, Cancel Anytime, Refund Policy, payment method, and Pay Now.

Behavior:

- Do not hardcode Figma values such as ₹2, 7 days, or ₹99/week.
- Plans, plan order, plan labels, display copy, benefits, and video come from CMS or remote config.
- Final product validity and actual chargeable price come from payment or billing backend.
- The default selected plan should come from remote config. If not provided, default to weekly because Figma shows Per Week selected.
- Plan switcher changes the selected plan and updates displayed plan details.
- Benefits list must be CMS controlled and localizable.
- Figma visible benefit examples: Mandir, Wallpaper, Ringtone, Aarti & Bhajans, Mantras & Stutis, Whatsapp Status, Horoscope, App icon.
- Refund Policy opens a production URL.
- Cancel Anytime is informational unless product/legal adds a linked action.

### 6.9 Shimmer Pay Now Button

The paywall uses a special shimmer Pay Now button. This is different from normal Prabhuji buttons.

Behavior:

- Use shimmer only for the paywall CTA.
- Do not apply shimmer to devotional ritual actions or normal module buttons.
- Button remains 44px high and easy to tap.
- Disable Pay Now while payment is starting or if no valid selected plan exists.
- On tap, start payment flow.

### 6.10 Payment

Designer confirmed payment provider is Razorpay/UPI custom flow or engineering decision.

Behavior:

- Payment provider is not final and must be confirmed before final payment build.
- Payment should support success, failure, user-cancelled, pending, and active subscription/restored states.
- On payment success, mark user Pro and route to Home.
- On failure, show simple toast/dialog and keep user on paywall.
- On cancellation, keep user on paywall and allow close to Home.
- On pending, show a clear pending message and route according to engineering payment verification design.
- Do not store or log sensitive payment details in analytics.

## 7. States and Fallback Behavior

### Loading

- Splash loading while session, subscription, and config are checked.
- Get OTP loading after OTP request tap.
- Submit OTP loading during verification.
- Profile save loading after Continue on Name + Language.
- Pay Now loading while payment starts.
- Paywall config loading before paywall render.

### Empty

- If paywall benefits are empty but valid plans exist, show paywall without benefits and log config issue.
- If language list fails to load from CMS, use built-in Phase 1 default list.

### Error

- Invalid phone number: show inline validation.
- OTP request failed: show readable retry message.
- Invalid OTP: show Invalid OTP under OTP inputs.
- OTP rate limit or temporary block: follow engineering/auth provider behavior.
- Profile save failed: keep user on screen and allow retry.
- Paywall config failed: use cached config if available.
- Paywall video failed: show fallback image or keep paywall usable.
- Payment failed: show simple toast/dialog and allow retry.

### Partial Failure

- If paywall localized copy is missing for selected language, fallback to Hindi, then English.
- If video fails but plans exist, still show paywall.
- If some plan display fields are missing, hide invalid plan and show remaining valid plans.
- If all valid plans are missing, route to Home and log paywall_no_valid_plans.

### Offline

- If offline before login, show network error and allow retry.
- If offline after login and user is free, use cached paywall config if available.
- If no cached paywall config or valid plans are available, route to Home.
- Payment cannot start offline.

## 8. Phase 1 / Phase 2 Scope

### Phase 1 Scope

- Splash routing.
- Mandatory mobile OTP login.
- India-only phone number using +91.
- Required terms acceptance, checked by default.
- OTP UI, invalid OTP state, resend OTP, and Change No.
- OTP exact rules owned by engineering/auth provider.
- Name capture.
- Language selection with Hindi default.
- 8 visible language options from Figma.
- Language applies to UI and content preference.
- Paywall after name and language save.
- Paywall on every future app open for free users.
- Pro users skip paywall.
- Paywall close routes to Home.
- CMS/remote config controlled paywall video, copy, plan display, plan order, benefits, and localization.
- Paywall localization based on selected language.
- Paywall video autoplay with sound, tap to play/pause.
- Special shimmer Pay Now button.
- Payment states: success, failure, cancelled, pending, restored/active subscription.
- Analytics events for onboarding, paywall, localization, and payment funnel.

### Phase 2 Scope

- Guest mode or explore-first onboarding variant.
- Frequency capping or smart timing for repeated free-user app-open paywall.
- A/B testing for video, plans, benefits, trial copy, and shimmer CTA.
- Additional languages based on content readiness.
- More advanced localization quality tooling.
- Edit name and language from profile/settings if not already covered elsewhere.
- Restore subscription self-serve screen.
- Referral or family plan experiments.
- Personalized paywall benefits based on user behavior.
- Offline/cached paywall video thumbnail improvements.

## 9. Analytics

Analytics should track the full onboarding and paywall funnel without storing sensitive personal data. Do not send raw phone number, OTP, user name, or payment details.

Common attributes recommended for all events where available:

- user_id
- anonymous_id
- session_id
- app_version
- build_number
- platform
- device_locale
- selected_language
- subscription_status
- network_status
- entry_point
- config_version
- experiment_variant

Required Phase 1 events:

- onboarding_app_opened: app is opened.
- onboarding_splash_viewed: splash is shown.
- onboarding_route_decided: next route is selected after session checks.
- onboarding_phone_choice_viewed: phone choice screen is shown.
- onboarding_phone_continue_tapped: user taps Continue with Phone Number.
- onboarding_phone_input_viewed: phone input screen is shown.
- onboarding_get_otp_tapped: user requests OTP.
- onboarding_otp_request_result: OTP request succeeds or fails.
- onboarding_otp_screen_viewed: OTP screen is shown.
- onboarding_change_number_tapped: user taps Change No.
- onboarding_otp_submitted: user submits OTP.
- onboarding_otp_verified: OTP verification succeeds.
- onboarding_otp_failed: OTP verification fails.
- onboarding_resend_otp_tapped: user taps active resend.
- onboarding_resend_otp_result: resend succeeds or fails.
- onboarding_language_screen_viewed: name and language screen is shown.
- onboarding_language_selected: user selects language.
- onboarding_language_continue_tapped: user taps Continue.
- onboarding_profile_saved: name and language save succeeds or fails.
- onboarding_completed: required onboarding fields are saved.
- paywall_config_loaded: paywall config loads from remote, cache, or fallback.
- paywall_config_failed: paywall config fails.
- paywall_no_valid_plans: no valid plans are available.
- paywall_localization_fallback_used: selected language fallback is used.
- paywall_viewed: paywall is shown.
- paywall_video_autoplay_started: video autoplay starts.
- paywall_video_tapped: user toggles video play/pause.
- paywall_video_failed: video fails.
- paywall_plan_selected: user changes plan.
- paywall_pay_now_tapped: user taps Pay Now.
- paywall_payment_started: payment flow begins.
- paywall_payment_success: payment succeeds.
- paywall_payment_failed: payment fails.
- paywall_payment_cancelled: user cancels payment.
- paywall_payment_pending: payment enters pending state.
- paywall_closed: user closes paywall.
- paywall_subscription_status_checked: subscription status is checked.
- paywall_subscription_restored: active subscription is detected.
- legal_link_tapped: user taps Privacy Policy, Terms of Service, or Refund Policy.

Important attributes:

- Do not send raw phone number. Use country_code and phone_number_length only.
- Do not send OTP. Use otp_digit_count_entered and attempt_count only.
- Do not send name. Use name_present and name_length_bucket only.
- For paywall_viewed and paywall_closed, include paywall_impression_count_for_user because free users see paywall on every app open.
- For localization events, include selected_language, requested_locale, served_locale, fallback_used, and missing_fields.
- For payment events, include payment_provider, selected_plan_id, selected_plan_period, product_id, amount, currency, result, and safe error_code.

## 10. Handoff Notes

- This package is approved as behavior truth for v1.0.
- Figma is visual truth for layout, spacing, and component styling.
- This spec is behavior truth for routing, login, paywall, CMS, localization, payment states, analytics, and fallbacks.
- The repeated free-user app-open paywall is confirmed and intentionally overrides the default Prabhuji rule that paywalls should not appear on module entry.
- Payment provider decision remains open and blocks final payment implementation.
- OTP exact rules are engineering-owned and should follow existing internal app behavior such as Dostii.
- Legal URLs must be provided before release.
- Paywall copy, video, benefits, and plan display must not require an app update to change.
- Paywall localization is Phase 1 and must use selected language fallback rules.
- Some Figma nodes contain stray non-Prabhuji placeholder copy. Do not implement placeholder copy that conflicts with the visible Prabhuji VIP paywall.