# PRD: Prabhuji Home Screen

## 1. Module Summary

**App:** Prabhuji  
**Module:** Home  
**Screen:** Home + Infinite Scroll Feed  
**Feature Type:** Primary discovery and engagement surface  
**Version:** v1.0  
**Figma Source:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=285-3464&t=8GTJCrqUNd9uTCCg-1

The Home screen is the primary entry point for Prabhuji. It helps users discover devotional content and key modules such as Aarti & Bhajans, Mantras & Stutis, Ringtones, Wallpapers, Status, Mandir, Horoscope, and Books.

The Home screen contains a branded header, optional CMS-controlled hero banners, static feature shortcut cards, a CMS-driven mixed infinite feed, and bottom navigation.

## 2. Product Intent

Home should quickly communicate the breadth of Prabhuji and guide users toward high-value devotional actions. It should work as a discovery surface for both free and Pro users.

The page should support:

- Fast module discovery
- Devotional content browsing
- Feed-based engagement
- Sharing behavior
- Pro discovery without aggressive locking on the Home UI
- Audio preview consumption
- Returning users' daily browsing habit

## 3. User Goals

Users should be able to:

- Understand that Prabhuji contains multiple devotional features.
- Open core modules from shortcut cards.
- Discover wallpapers, statuses, aarti/bhajans, mantras/stutis, and ringtones from the feed.
- Preview audio content directly in the feed.
- Like, view, and share content.
- Open detail/preview screens before applying or consuming content fully.
- Navigate to primary sections through bottom navigation.

## 4. Business Goals

Home should improve:

- Content discovery
- Module discovery
- Session duration
- Feed engagement
- Share intent
- Pro conversion through feature discovery and premium action gates
- Repeat app opens through fresh CMS-controlled content

## 5. Free vs Pro Behavior

### Free User

Free users see the same Home UI as Pro users, without a Pro badge.

Free users can:

- Open Home.
- View banners.
- View shortcut cards.
- Open modules and see their library/listing pages.
- View Home feed.
- Play preview audio if allowed by feed rules.
- Like content if logged in.
- Share content using native share sheet.

Free users should not see:

- Lock badges on Home feed cards.
- Pro labels on Home cards.
- Different banners just because they are free.
- Different feed ranking just because they are free.

Paywall behavior:

- Paywall should not open simply because the user lands on Home.
- Paywall should not trigger from normal module entry unless the CMS banner is specifically configured as a Pro feature discovery banner.
- For feature shortcut cards, free users can open the module/library page. Paywall triggers only when they try to open premium content or use a premium action inside that module.
- For CMS-controlled feature discovery banners, free users can be routed directly to unified Pro paywall if the banner is configured for a Pro-only feature.

### Pro User

Pro users see the same Home UI as free users, but with a small crown/VIP badge near the profile avatar.

Pro users should not receive a different Home feed ranking or different banner set in MVP.

## 6. Header Requirements

The Home header should include:

- Prabhuji logo
- Prabhuji wordmark
- Help/question icon
- Profile avatar
- Pro crown/VIP badge for Pro users only

### Search Bar Decision

Search bar is removed completely from Phase 1.

The Figma design currently contains a search bar and mic icon, but these should not be implemented in MVP Phase 1 unless search becomes confirmed before implementation.

## 7. Header Interaction Rules

### Profile Avatar

Tapping the profile avatar should open Account/Settings.

For Pro users, show a small crown/VIP badge near the profile avatar.

### Help / Question Icon

Tapping the help/question icon should open Help & Support if available.

This is not fully finalized. The help entry may later move to Account/Settings. If Help & Support is not ready for Phase 1, the icon should either be hidden or routed to the nearest available support/help surface.

## 8. Hero Banner Requirements

The hero banner section should be CMS-controlled.

Banners can be used for:

- Feature discovery
- Module promotion
- Pro/VIP promotion
- Devotional campaigns
- Content highlights

### Banner Tap Behavior

Banner behavior should be controlled by CMS.

Supported banner destination types:

- Linked feature/module
- Content detail/preview
- Unified Pro paywall
- Non-clickable informational banner

For Pro users:

- If the banner is linked to a feature/module, open the linked feature/module.

For free users:

- If the banner is a Pro-only feature discovery banner, open unified Pro paywall.
- Otherwise, open the linked module/content as configured.

### Banner Failure Rules

- If all banners fail to load, hide the banner section.
- If one banner fails, show the remaining valid banners.
- Do not show broken image placeholders.

## 9. Feature Shortcut Cards

Home has four Phase 1 shortcut cards:

1. Aarti & Bhajans
2. Mantras & Stutis
3. Set Ringtone
4. Set Wallpaper

### Shortcut Behavior

- Tapping Aarti & Bhajans opens the Aarti & Bhajans module/library page.
- Tapping Mantras & Stutis opens the Mantras & Stutis module/library page.
- Tapping Set Ringtone opens the Ringtone module/library page.
- Tapping Set Wallpaper opens the Wallpaper module/library page.

Free users can open these modules and see their library pages. Paywall triggers only when they attempt to open premium content or use premium actions within each module.

Feature cards should always be visible, even if CMS feed or banners fail.

## 10. Infinite Feed Requirements

The Home infinite feed is CMS-driven.

Supported feed content types:

- Wallpaper card
- Status card
- Aarti & Bhajans audio card
- Mantras & Stutis audio card
- Ringtone audio card

The feed should be a mixed content feed, not grouped by content type.

### Feed Source

Feed data comes from CMS.

### Feed Ordering

MVP feed ordering should support:

- CMS-curated order
- Trending-first ordering
- Randomized content-type mixing

Recommended MVP logic:

- CMS provides ordered feed items.
- If trending ordering is enabled, prioritize trending content while maintaining mixed content types.
- Do not personalize by deity, language, recent usage, or Pro/free status in MVP.

### Trending/Suggested Labels

Trending/Suggested labels are CMS-controlled in MVP.

After launch, these labels can optionally switch to auto-generated labels from engagement data once enough engagement data exists.

## 11. Feed Card Requirements

Each feed card should include:

- Content type/module label
- Content title/subtitle
- CMS-controlled badge such as Trending or Suggested
- Hero preview area
- Primary CTA
- Engagement footer with like, view, and share

### Header Tap Behavior

The header component of each feed card should be tappable and should take the user directly to the respective module.

Example:

- Wallpaper card header -> Wallpaper module
- Aarti & Bhajans card header -> Aarti & Bhajans module
- Mantras & Stutis card header -> Mantras & Stutis module
- Ringtone card header -> Ringtone module
- Status card header -> Status module

## 12. Feed CTA Behavior

Feed CTA should open a detail/preview screen first. It should not directly apply wallpaper, ringtone, or status.

### Wallpaper Card

CTA: Set Wallpaper  
Behavior: Open wallpaper preview screen.

### Status Card

CTA: Set Status  
Behavior: Open status preview/customization flow.

Status sharing is Pro-only. Free users can discover and customize status, but when they try to share/set status, show unified Pro paywall.

### Aarti & Bhajans Card

CTA: Listen to more  
Behavior: Open Aarti & Bhajans module.

### Mantras & Stutis Card

CTA: Listen to more  
Behavior: Open Mantras & Stutis module.

### Ringtone Card

CTA: Set Ringtone  
Behavior: Open ringtone preview screen.

## 13. Audio Preview Behavior

For audio feed cards:

- Audio should autoplay when the card comes into view.
- Only one audio item can play at a time.
- When the user scrolls away and the card leaves the viewport, audio should stop or pause automatically.
- If another audio card comes into view and starts playing, the previous audio must stop or pause.
- Feed audio should be treated as preview audio, not full player mode.

## 14. Engagement Behavior

### Like

- Like toggles like/unlike.
- Like should be saved if the user is logged in.
- If user identity is unavailable, define fallback behavior with engineering.

### View

- A view should be counted after a feed card is visible for at least 2 seconds.
- Avoid counting immediate scroll-past as a view.

### Share

- Share opens native share sheet.
- WhatsApp should be an important destination in the share experience.
- Share payload should be based on content type and CMS-provided share metadata.

## 15. Status / Business Template Behavior

The status card shown in Figma includes a business-style overlay with fields such as:

- Name
- Business name
- Phone number
- Short message/tagline
- Profile image/avatar

This is a business status template that can be added as an overlay over static or video status content in the Prabhuji app.

Rules:

- Free users can discover business status templates.
- Free users can customize business status templates from the Status module.
- Sharing/setting status is Pro-only.
- When a free user tries to share/set the status, show unified Pro paywall.
- Business status customization should happen inside the Status module, not directly on Home.

## 16. Empty / Loading / Error States

### Banners

- If all banners fail, hide banner section.
- If one banner fails, show the rest.
- Do not show broken media placeholders.

### Feed

- If feed fails, show retry CTA.
- If CMS returns no feed items, hide feed section.
- Feature cards should always remain visible.

### Feature Cards

- Feature cards are static for MVP and should always show.

## 17. Phase 2 / Not in MVP

The following are not part of MVP Phase 1:

- Search bar
- Search results
- Mic search
- Feed personalization by preferred deity
- Feed personalization by language
- Feed personalization by recent module usage
- Feed personalization by Pro/free status
- Auto-generated Trending/Suggested labels from engagement, until engagement data is available
- Contextual paywall variants, unless separately prioritized

## 18. Analytics Requirements

Recommended events:

- `home_screen_viewed`
- `home_banner_viewed`
- `home_banner_tapped`
- `home_profile_tapped`
- `home_help_tapped`
- `home_feature_card_tapped`
- `home_feed_item_impression`
- `home_feed_item_viewed`
- `home_feed_item_header_tapped`
- `home_feed_cta_tapped`
- `home_feed_audio_autoplay_started`
- `home_feed_audio_paused_on_scroll`
- `home_feed_like_tapped`
- `home_feed_share_tapped`
- `home_feed_retry_tapped`
- `home_paywall_triggered`

## 19. Success Metrics

Primary metrics:

- Home screen view rate
- Feature card tap rate
- Feed item view rate
- Feed CTA tap rate
- Module entry rate from Home
- Share tap rate
- Pro paywall trigger rate from Home

Secondary metrics:

- Audio autoplay engagement
- Feed scroll depth
- Banner tap rate
- Feed retry rate
- Status customization starts from Home

Guardrail metrics:

- Audio annoyance / immediate scroll-away after autoplay
- Home load failure rate
- Feed load failure rate
- Paywall close rate from banner-triggered paywalls
- Search-related confusion should be zero in MVP because search is removed

## 20. Handoff Readiness

This package is ready for design/dev discussion. Remaining non-blocking questions are listed in `open-questions.yaml`.
