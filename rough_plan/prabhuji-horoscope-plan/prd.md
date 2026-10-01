# Prabhuji Horoscope PRD

## 1. Module Summary

**App:** Prabhuji  
**Module:** Horoscope  
**Screen:** Horoscope Module Spec  
**Feature type:** Daily devotional guidance / Pro feature  
**Version:** v1.0  
**Status:** approved  
**Figma source:** `ipSvV1FnmzvV8TK2Ig8Aiq`, nodes `392:3149`, `371:3796`, `387:2491`

Horoscope lets devotees choose their zodiac sign and receive daily horoscope guidance in the language they chose for the app. The module is available from the bottom navigation. The first screen is a simple zodiac selection grid with today’s date.

Horoscope results are Pro-only. Free users can discover the feature and see all zodiac signs, but tapping any sign opens the unified Pro paywall. Pro users can open the result flow for any zodiac sign.

The result flow uses a calm astrology video background, a selected zodiac header, a result card, TTS narration, and Next / Finish actions. The visible 8 result screens in Figma are examples, not fixed app logic. In Phase 1, CMS/admin must be able to add, remove, rename, reorder, enable, and disable daily horoscope steps without an app release.

## 2. Product Intent

Horoscope should give users a daily spiritual reason to return to Prabhuji. It should feel calm, helpful, and familiar to users who expect daily zodiac guidance.

The experience should not feel like gambling, fear-based prediction, or a hard medical/financial claim. It should be positioned as daily guidance and devotional reflection.

The module supports the business goal of converting users to Pro while still allowing free users to understand the value before payment. The paywall appears after zodiac selection intent, not on tab entry.

## 3. User Goals

- Open the Horoscope tab from bottom navigation.
- See today’s date.
- Choose a zodiac sign.
- If Pro, read and listen to daily horoscope guidance.
- Move through horoscope sections using Next.
- Let TTS auto-read each section.
- Mute or unmute TTS when needed.
- Finish the horoscope flow and return to the main Horoscope screen.

## 4. Business Goals

- Make Horoscope a clear Pro value feature.
- Encourage Pro conversion after user intent is clear.
- Increase daily retention through fresh daily content.
- Support multiple app languages using onboarding/settings language.
- Keep content generation flexible so the business can choose AI model or third-party API later.
- Allow Product/CMS to configure horoscope steps without app updates.

## 5. Free vs Pro Behavior

### Free User

Free users CAN:

- Open the Horoscope tab from bottom navigation.
- View the Horoscope main screen.
- See today’s date.
- View all 12 zodiac sign cards.
- Tap a zodiac sign and understand that horoscope results are a Pro feature.

Free users should NOT see:

- Lock badges on zodiac cards.
- Pro labels on zodiac cards.
- Horoscope result text before paywall.
- TTS result playback before paywall.
- A paywall immediately on opening the Horoscope tab.

Paywall trigger rule:

- When a free user taps any zodiac sign, open the unified Prabhuji VIP Membership paywall.
- If the user successfully purchases Pro, return them directly into the selected zodiac result flow.
- If the user closes or fails purchase, return them to the Horoscope zodiac grid.

### Pro User

Pro users CAN:

- Open the Horoscope tab.
- Select any zodiac sign.
- View daily horoscope results.
- Listen to each result section using TTS.
- Use mute/unmute on the result screen.
- Use Next to move manually.
- Let the flow auto-advance after TTS finishes.
- Finish the result flow and return to the zodiac grid.

Pro users should NOT see:

- Paywall on zodiac tap.
- Lock badges on zodiac cards.
- Any interruption during active result reading unless there is an error.

## 6. Section/Feature Requirements

### 6.1 Bottom Navigation Entry

The Horoscope tab is part of the standard five-item bottom navigation:

1. Home
2. Status
3. Mandir
4. Horoscope
5. Books

Behavior:

- Tapping Horoscope opens the Horoscope main screen.
- The Horoscope tab is visually active.
- Bottom nav does not directly trigger paywall.
- This matches Prabhuji’s default rule: navigation items should not be Pro-locked.

### 6.2 Horoscope Main Screen

Visible UI from Figma:

- Status bar.
- Title: “Today’s Horoscope”.
- Date text, example: “15 June, 2026”.
- 12 zodiac cards in a 3-column grid.
- Bottom navigation with Horoscope active.

Zodiac signs:

- Aries
- Taurus
- Gemini
- Cancer
- Leo
- Virgo
- Libra
- Scorpio
- Sagittarius
- Capricorn
- Aquarius
- Pisces

Implementation note:

- Figma contains typos: “Saittarius” and “Capricon”. Implementation must use “Sagittarius” and “Capricorn”.

Interaction rules:

- Tapping a zodiac sign checks user entitlement.
- If user is free, open unified paywall.
- If user is Pro, open result flow for selected zodiac.
- No lock badges are shown on zodiac cards.
- Zodiac cards should maintain large, clear tap targets for older users.

### 6.3 Result Flow Header

Visible UI from Figma:

- Back arrow.
- Selected zodiac icon and name.
- Date.
- TTS icon in header.

Behavior:

- Back arrow returns to the Horoscope main screen.
- Back arrow stops any active TTS.
- TTS icon is a mute/unmute control.
- TTS icon should reflect current mute state if an icon variant exists.
- If no muted icon variant exists yet, Engineering may use accessible state text while Design provides a variant.

### 6.4 Result Video Background

The astrology/star background in the result flow is a video.

Behavior:

- Use a lightweight compressed silent looping video.
- Start the video when result flow opens.
- Keep it silent.
- Loop while the user is in the result flow.
- Stop or release it when the user exits the result flow.
- Use a static fallback image for low-end devices, slow network, video load failure, or performance issues.

Design principle:

- The background should feel calm and spiritual, not flashy or distracting.
- Avoid heavy motion that harms readability.

### 6.5 Configurable Result Steps

The 8 result sections shown in Figma are example/default content, not fixed app logic.

Example sections visible in Figma:

1. Namaste
2. A good time today
3. Be careful
4. Work and money
5. Health care
6. Today’s solution
7. Lucky number
8. Lucky colour

Confirmed Phase 1 rule:

- CMS/admin controls result steps.
- Product/CMS/admin must be able to add steps.
- Product/CMS/admin must be able to remove steps.
- Product/CMS/admin must be able to rename/change steps.
- Product/CMS/admin must be able to reorder steps.
- Product/CMS/admin must be able to enable or disable steps.
- App logic must not hardcode the visible 8 sections.

Phase 1 mode:

- Only `daily_horoscope` is supported.
- Future modes such as weekly/monthly horoscope are Phase 2.

Each step should include:

- Step ID.
- Title.
- Order.
- Enabled state.
- Content type.
- Result text.
- TTS text if different from display text.
- Language.

### 6.6 TTS Behavior

TTS is required in Phase 1.

Behavior:

- TTS auto-starts on each result section.
- TTS reads the section heading and the result text.
- TTS language should match the user’s app-level language.
- User can mute/unmute using the TTS icon.
- If muted, TTS does not play automatically for subsequent sections in the same result session.
- If unmuted, TTS resumes normal auto-start behavior.
- If user taps Next while TTS is speaking, current speech stops, next section opens, and TTS starts for that next section if unmuted.
- If user taps Back or Finish, current speech stops.
- If app goes to background, speech should pause or stop according to platform behavior, but it must not continue unexpectedly after the user exits the flow.

Fallback:

- If the selected language has no available TTS voice, show translated text and fail gracefully.
- Do not block horoscope reading because TTS is unavailable.
- Engineering should use system TTS or app-supported TTS based on platform feasibility.

### 6.7 Auto-Advance and Manual Navigation

Behavior:

- The result flow starts at the first enabled CMS step.
- When TTS finishes for a section, auto-advance to the next enabled step.
- The Next button remains visible so users can skip manually.
- On the final enabled step, the CTA label is “Finish”.
- Tapping Finish returns to the Horoscope main screen.
- If TTS is muted, auto-advance after TTS completion cannot occur because no speech is playing. In this case, the user moves manually using Next.

### 6.8 Language and Translation

Confirmed behavior:

- Horoscope content uses the app-level language selected during onboarding.
- Users can change language from Settings.
- The app-level language is the source of truth.
- TTS should speak in the same language as the displayed translated text.

Working fallback:

- If horoscope content is unavailable in the selected language, show a friendly retry/error state or use a backend-provided fallback language based on implementation.
- Exact fallback hierarchy remains an open implementation question.

### 6.9 Daily Content Refresh

Confirmed behavior:

- Horoscope refresh uses IST for daily devotional consistency.
- Phase 1 returns the same result per zodiac sign, date, and language.
- Phase 1 does not personalize results per user.

Implication:

- Two Pro users selecting Taurus on the same IST date and same language should receive the same content.

### 6.10 Horoscope Engine Source

The source is not finalized.

Allowed source options:

- AI model trained/configured for horoscope.
- Third-party horoscope API.

Ownership:

- Business stakeholders choose source.
- Engineering/Tech owns integration.
- Product/Design owns user-facing behavior.

The app should use an abstraction layer so the UI behavior does not depend on which provider is chosen.

### 6.11 Content Safety Rules

Horoscope content must feel like guidance, not certainty.

The app must prohibit:

- Medical cures.
- Financial guarantees.
- Legal guarantees.
- Fear-based remedies.
- Expensive rituals.
- Panic-inducing warnings.
- Claims that a user will definitely suffer harm if they do not perform an action.

“Today’s solution” may include:

- Simple devotional suggestion.
- Mantra or prayer suggestion.
- Calm reflection.
- Simple offering such as flowers, diya, or respectful puja action.
- Lucky colour or number.

## 7. States & Fallback Behavior

### Loading: Main Screen

- Show the Horoscope main screen shell and loading placeholders if zodiac configuration is loading.
- Zodiac signs are static enough to ship locally, but CMS may control assets/copy.

### Loading: Result

- After Pro user selects a zodiac sign, show a loading state while content is fetched/generated.
- Keep selected zodiac context visible where possible.
- Do not start TTS until content is ready.

### Paywall State

- Free user tapping zodiac sign opens the unified paywall.
- Paywall is not shown on screen load.
- On purchase success, continue into the selected zodiac result.
- On close/failure, return to zodiac grid.

### Empty Step Configuration

- If CMS returns no enabled steps, show a friendly error with Retry.
- Do not show an empty result screen.
- Engineering should log this as configuration error.

### API / AI Generation Error

- Show a friendly error with Retry.
- Keep the selected zodiac sign and date context.
- Do not play TTS on error.

Suggested copy direction:

- “Horoscope is not available right now. Please try again.”

### Video Background Failure

- Use the static fallback image.
- Result flow should continue.
- TTS and text should still work.

### Unsupported TTS Language

- Show translated text if available.
- Do not block reading.
- TTS may be skipped or use platform fallback voice.
- This should be logged for Engineering visibility.

### Offline

- If no network and no cached result exists, show an offline-friendly retry state.
- If cached result exists for the same zodiac/date/language, Engineering may show it if data freshness rules allow.
- Cache policy is an implementation decision.

### Partial Failure

- If text loads but TTS fails, show text and keep navigation available.
- If video fails but text loads, use static fallback image.
- If one CMS step fails but the result has other valid enabled steps, Engineering may skip the failed step only if backend marks it optional. Otherwise show Retry.

## 8. Phase 1 / Phase 2 Scope

### Phase 1 Scope

- Horoscope tab entry from bottom nav.
- Zodiac selection grid.
- 12 zodiac sign cards.
- Date display.
- Free-user paywall trigger on zodiac tap.
- Unified paywall return to selected zodiac after purchase success.
- Pro-user daily horoscope result flow.
- CMS/admin-configurable result steps.
- Daily horoscope mode only.
- Result video background.
- Static image fallback for video background.
- TTS auto-start on each section.
- TTS mute/unmute control.
- Auto-advance after TTS finishes.
- Manual Next and Finish actions.
- App-level language translation.
- IST-based daily refresh.
- Same result per zodiac/date/language.
- Loading, error, retry, offline, video fallback, and TTS fallback states.
- Content safety guardrails.

### Phase 2 Scope

- Saved/default zodiac sign.
- Daily horoscope reminder notification.
- Share horoscope card or text.
- Save/favorite horoscope.
- Replay/pause/speed TTS controls.
- Weekly horoscope mode.
- Monthly horoscope mode.
- Personalized horoscope using date of birth, birth time, and birth place, only if business approves.
- Horoscope history/archive.
- More advanced language/voice selection.
- Analytics-based personalization.
- Admin preview/testing workflow for generated horoscope content.

## 9. Analytics

Suggested required events:

- Horoscope tab opened.
- Zodiac sign tapped.
- Paywall shown from zodiac tap.
- Purchase success returned to horoscope result.
- Result loaded.
- Result section viewed.
- TTS started.
- TTS muted.
- TTS unmuted.
- Next tapped.
- Auto-advance occurred after TTS finish.
- Finish tapped.
- Retry tapped.
- Error shown.
- Video fallback used.

Analytics should include:

- Zodiac sign.
- Date.
- App language.
- User access state: free or Pro.
- Step ID and step order for result section events.
- Whether TTS was muted.
- Whether video fallback was used.

## 10. Handoff Notes

- Status is approved for design execution package export.
- Final build is blocked by the open question around horoscope engine source.
- The UI must not hardcode the 8 visible result sections.
- CMS/admin-configured steps are required in Phase 1.
- The result background is a video and needs static fallback.
- TTS icon behavior is mute/unmute, not replay.
- App-level language from onboarding/settings is the source of truth.
- Use IST for daily refresh.
- Keep the paywall after intent: zodiac tap only.
- Correct Figma text typos in implementation: “Sagittarius” and “Capricorn”.
- Keep Horoscope guidance calm and safe. Do not allow fear-based or high-risk claims.