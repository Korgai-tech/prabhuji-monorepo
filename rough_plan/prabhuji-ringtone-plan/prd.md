# Prabhuji Ringtone PRD

## 1. Module Summary

**App:** Prabhuji  
**Module:** Ringtone  
**Screen:** Module Spec  
**Feature type:** Devotional audio utility and Pro conversion feature  
**Version:** v1.0  
**Status:** approved  
**Figma source:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=712-7122&t=TzCwzI6RZASLubyK-1

Ringtone lets devotees discover devotional ringtones, preview a selected ringtone, and set it as their phone ringtone. The module is entered from Home and uses a simple browse-first pattern: search, deity filters, and a visual grid of ringtone cards.

The module is also a Pro conversion feature. Free users can explore the listing but cannot play, preview, like, share, or set ringtones. When a free user taps a ringtone card or play action, the unified paywall opens. If subscription succeeds, the selected ringtone preview opens and starts playing.

All ringtone content comes from CMS. CMS controls ringtone data, deity filters, images, audio files, ordering, and display counters. The design should stay devotional, simple, and readable on 360px Android screens.

## 2. Product Intent

Ringtone gives users a practical devotional utility: make their phone ringtone devotional. The experience should feel simple and familiar, not like a heavy music app.

The module should help users quickly find a devotional ringtone by deity, title, or keyword. Users should be able to see which ringtones are popular through play and set counts.

Confirmed monetization intent: this is a paid feature to drive Pro subscription. The paywall must appear after intent, not on module entry.

## 3. User Goals

- Open Ringtone from Home.
- Browse devotional ringtone options.
- Filter ringtones by deity.
- Search for ringtones by title, deity, tags, or keywords.
- Tap a ringtone card to preview it.
- Listen to the selected ringtone.
- Set the selected ringtone as the phone ringtone.
- Like and share a ringtone if Pro.

## 4. Business Goals

- Convert free users to Pro after they show ringtone intent.
- Track which ringtones drive taps, plays, sets, and subscriptions.
- Understand which deity filters and searches indicate content demand.
- Improve CMS/content planning using search gaps, play counts, and set counts.
- Avoid aggressive monetization on entry or near sacred imagery.

## 5. Free vs Pro Behavior

### Free User

Free users CAN:

- Open the Ringtone module.
- View Ringtone Home.
- View the ringtone grid.
- Use deity filters.
- Use text search.
- View Search Results.
- See title, thumbnail, play count, and set count on cards.

Free users CANNOT in Phase 1:

- Preview ringtone detail.
- Play ringtone audio.
- Like a ringtone.
- Share a ringtone.
- Set a ringtone.
- Reach the share sheet.

Paywall trigger rules:

- Tapping a ringtone card opens the unified paywall.
- Tapping a play overlay on a ringtone card opens the unified paywall.
- If a free user reaches any like, share, or set action through a future surface, that action opens the unified paywall.
- No paywall appears on module entry.
- No lock badges are shown on discovery cards in Phase 1.
- If subscription succeeds from this flow, open the selected ringtone preview and start playback automatically.

### Pro User

Pro users CAN:

- Browse all ringtone discovery surfaces.
- Use deity filters.
- Use text search.
- Tap a ringtone card to open preview.
- Auto-play the selected ringtone after opening preview.
- Pause and resume playback.
- Like a ringtone.
- Share a ringtone.
- Set the selected ringtone as the phone ringtone.

Pro users SHOULD NOT see:

- A paywall when opening the module.
- A paywall when tapping ringtone cards.
- A paywall for preview, playback, like, share, or set ringtone.

## 6. Section/feature requirements

### 6.1 Entry and Header

Confirmed behavior:

- User enters from the Home ringtone feature card or another internal entry point.
- Back button returns to the previous screen.
- The Ringtone Home screen contains a search field and a deity filter row.

Implementation note:

- Figma labels the module visually as Ringtone Home, but some internal node names contain legacy labels such as Aarti or generic app-header names. The behavior spec wins.

### 6.2 Search Field

Confirmed behavior:

- Text search is included in Phase 1.
- Search queries CMS ringtone title, deity, tags, and keywords.
- Search Results screen displays the query in the field, for example Krishna.
- Search Results uses the same ringtone card grid as Ringtone Home.

Rules:

- Empty query should keep user on Ringtone Home or show the unfiltered list.
- No results state copy: No results found.
- Search should not trigger paywall.
- Search should not auto-play audio.

Mic icon:

- Voice search is Phase 2.
- Recommendation for Phase 1: hide the mic icon or disable it. If retained visually, it should not request microphone permission in Phase 1.

### 6.3 Deity Filter Row

Confirmed behavior:

- The deity filter acts as an in-page filter on the Ringtone Home grid.
- All Gods is the default filter.
- CMS controls deity list, deity images/icons, order, and ringtone mapping.
- This same deity filter pattern is reused across multiple modules.

Rules:

- Filter selection updates the grid without leaving the screen.
- Filter selection does not trigger paywall.
- If a deity has no ringtones, show No ringtones found.

### 6.4 Ringtone Grid and Cards

Visible card elements:

- Thumbnail image.
- Center play icon overlay.
- Ringtone title.
- Play count with headphone icon.
- Set-as-ringtone count with ringtone/phone icon.
- Orange card border.

Confirmed behavior:

- Free user tapping card or play icon opens unified paywall.
- Pro user tapping card or play icon opens Ringtone Preview.
- For Pro users, selected ringtone auto-plays on preview entry.
- Displayed counts use Indian compact format.

Count display format:

- Under 1,000: 99
- Thousands: 1k, 8.5k
- Lakhs: 1.5L, 10.2L

Card tap target note:

- Cards are visually narrow in a 3-column grid. The whole card should be tappable, not only the small play icon.

### 6.5 Ringtone Preview

Visible elements:

- Back button.
- Large devotional image.
- Ringtone title.
- Ringtone set count, for example 24987 ringtone set.
- Like count.
- Play count.
- Share count.
- Play/pause button.
- Primary CTA: Set Ringtone.

Confirmed behavior:

- Preview is Pro-only in Phase 1.
- Pro user opens preview by tapping a ringtone card.
- The selected ringtone auto-plays after opening preview from a card tap.
- Only one ringtone plays at a time.
- No background playback in Phase 1.
- Audio stops or pauses when the user goes back, exits preview, opens share, or leaves the app.

Playback count rule:

- A play is counted after 3 seconds of playback or 25% of ringtone duration, whichever comes first.
- This avoids counting accidental taps.

### 6.6 Set Ringtone

Confirmed behavior:

- Phase 1 supports setting the selected audio as the default phone ringtone only.
- Alarm tone, notification tone, and contact-specific ringtone are Phase 2.
- Only Pro users can set ringtone.

Android permission flow:

1. Pro user taps Set Ringtone.
2. App checks whether Android allows the app to modify system ringtone settings.
3. If permission/access is missing, app shows or opens the required Android settings/permission flow.
4. If the user enables permission, continue setting the ringtone.
5. If the user denies permission or returns without enabling it, show a standard settings message: Please enable ringtone permission from Settings to set this ringtone.
6. If setting fails, show: Couldn’t set ringtone. Please try again.

Tracking rule:

- The primary Phase 1 product event for this action is ringtone_set_tapped.
- Track ringtone_set_success and ringtone_set_failed if Engineering can reliably detect success or failure.

### 6.7 Like

Confirmed behavior:

- Like is Pro-only in Phase 1 because free users cannot reach preview.
- Pro user can like or unlike from preview.

Assumption:

- If backend account identity is required for liking, use the app’s existing account/auth pattern. Do not add a new login design in this module unless requested.

### 6.8 Share

Confirmed behavior:

- Share is Pro-only.
- Free users should not reach the share sheet.
- If a free user taps a share action from a future surface, open unified paywall.
- Share payload is a deep link plus ringtone title and devotional preview image.
- Do not share the raw ringtone audio file in Phase 1.

Share sheet implementation:

- Figma shows a custom bottom share sheet with Whatsapp, Status, Instagram, and Other.
- Designer approved Engineering choice: custom Figma share sheet or native Android share sheet.
- Recommendation: use native Android share sheet in Phase 1 unless custom destination routing is already simple.

Destination rules if custom sheet is used:

- Whatsapp opens WhatsApp share.
- Status opens WhatsApp Status if supported.
- Instagram opens Instagram share if supported.
- Other opens native Android share sheet.
- If the selected app is not installed, fall back to native share sheet or show a simple unavailable message.

## 7. States & fallback behavior

### Loading

- Show lightweight skeleton/loading placeholders for filters and grid.
- Do not show paywall during loading.

### Empty list

- If CMS returns no ringtones for the selected filter, show: No ringtones found.

### No search results

- If search returns zero results, show: No results found.

### CMS error

- If the ringtone list fails to load, show: Couldn’t load ringtones.
- Provide Retry CTA.

### Partial CMS failure

- If some ringtone items are invalid or missing required assets, hide those items and show remaining valid items.
- If all items fail, show the CMS error or empty state depending on response.

### Audio error

- If audio fails to load or play, show: Couldn’t play this ringtone.
- Keep user on preview.
- Do not increment play count.

### Set ringtone error

- If set ringtone fails, show: Couldn’t set ringtone. Please try again.

### Permission denied

- If required Android permission is denied or not enabled from settings, show: Please enable ringtone permission from Settings to set this ringtone.

### Offline

- If offline on listing load, show the CMS error state with Retry.
- If offline on preview audio, show audio error.
- Offline caching is not Phase 1.

## 8. Phase 1 / Phase 2 scope

### Phase 1 scope

- Ringtone Home.
- Text search.
- Search Results.
- CMS-controlled deity filter.
- CMS-controlled ringtone grid.
- Free browse and Pro-only deep usage.
- Unified paywall when free user taps ringtone card/play.
- Subscription success continuation into selected ringtone preview.
- Pro preview with auto-play.
- Play/pause.
- Like for Pro users.
- Share for Pro users.
- Set as default phone ringtone for Pro users.
- Android permission/settings handling for phone ringtone.
- CMS error, empty, search-empty, audio error, set-failed states.
- Analytics events for discovery, paywall, playback, set ringtone, share, errors, and CMS gaps.

### Phase 2 scope

- Voice search through microphone.
- Set as alarm tone.
- Set as notification tone.
- Set as contact-specific ringtone.
- Download/offline ringtone cache for Pro users.
- Favorite ringtone library.
- Personalized ringtone recommendations by preferred deity.
- Trending, Most Set, and New filters.
- Share actual audio clip if licensing and business rules allow.
- Regional language search and tags.
- Ringtone collections by deity, festival, or occasion.

## 9. Analytics

Recommended core funnel:

1. ringtone_module_opened
2. ringtone_card_tapped
3. ringtone_paywall_opened
4. ringtone_subscription_success
5. ringtone_preview_opened
6. ringtone_play_counted
7. ringtone_set_tapped
8. ringtone_set_success, if reliable

Required Phase 1 events:

- ringtone_module_opened — user opens Ringtone module.
- ringtone_deity_filter_selected — user selects a deity filter.
- ringtone_search_submitted — user submits text search.
- ringtone_search_results_viewed — search results load.
- ringtone_no_search_results_viewed — search returns zero results.
- ringtone_card_tapped — user taps ringtone card or play overlay.
- ringtone_paywall_opened — free user is shown unified paywall from ringtone intent.
- ringtone_paywall_cta_tapped — user taps subscribe CTA from paywall.
- ringtone_subscription_success — subscription succeeds from ringtone flow.
- ringtone_subscription_cancelled — user closes or cancels paywall.
- ringtone_subscription_failed — payment attempt fails.
- ringtone_preview_opened — selected ringtone preview opens.
- ringtone_play_started — audio starts.
- ringtone_play_counted — playback reaches 3 seconds or 25% duration.
- ringtone_play_paused — user pauses audio.
- ringtone_play_completed — audio reaches end.
- ringtone_audio_error — audio load/play fails.
- ringtone_like_tapped — Pro user likes the ringtone.
- ringtone_like_removed — Pro user unlikes the ringtone.
- ringtone_share_tapped — Pro user taps share.
- ringtone_share_sheet_opened — custom or native share sheet opens.
- ringtone_share_destination_selected — user selects destination.
- ringtone_share_completed — share completes if OS callback is available.
- ringtone_share_failed — share fails if detectable.
- ringtone_set_tapped — Pro user taps Set Ringtone.
- ringtone_permission_required — permission/system settings access is required.
- ringtone_permission_settings_opened — user is sent to settings.
- ringtone_permission_enabled — user enables permission if detectable.
- ringtone_permission_denied — user denies or returns without enabling.
- ringtone_set_success — ringtone is successfully set if detectable.
- ringtone_set_failed — set ringtone fails.
- ringtone_cms_load_failed — CMS/list load fails.
- ringtone_retry_tapped — user taps Retry after CMS error.
- ringtone_empty_state_viewed — CMS returns no ringtones.

Suggested common event properties:

- user_type: free or pro.
- entry_source: home_feature_card, home_feed, internal, deep_link.
- source_screen: ringtone_home, search_results, preview, paywall_success.
- ringtone_id.
- ringtone_title.
- deity_id.
- deity_name.
- position_index.
- search_query, where privacy policy allows.
- result_count.
- subscription_plan_id, for purchase events.
- paywall_type: unified.
- audio_duration_seconds.
- playback_position_seconds.
- auto_play.
- set_target: phone_ringtone.
- permission_status_before_tap.
- share_destination.
- share_payload_type: deep_link.
- error_code, for failure events.

Why track these:

- Discover which ringtones and deities drive intent.
- Measure paywall conversion from ringtone usage.
- Separate accidental taps from meaningful plays.
- Track real user friction in Android permission flow.
- Understand which share destinations matter.
- Help CMS/content team fill missing search demand.

## 10. Handoff Notes

- Figma is visual truth. This package is behavior truth.
- The module is approved as v1.0.
- Paywall must not appear on module entry.
- Free users must not preview or hear ringtone audio before subscribing in Phase 1.
- After subscription success from a ringtone tap, return to the selected ringtone preview and auto-play the ringtone.
- Use the unified paywall for MVP.
- Do not share raw audio files in Phase 1.
- Use phone ringtone only in Phase 1.
- Keep Android permission language simple and non-technical.
- Voice search is not Phase 1. Hide or disable the mic icon unless Design explicitly keeps it visible.
- Respect sacred imagery. Avoid overlays that cover deity faces more than the current play affordance.
- The 3-column grid is dense; make the full card tappable to preserve usability on small screens.