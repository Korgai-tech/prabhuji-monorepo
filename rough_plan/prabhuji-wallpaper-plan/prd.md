# Prabhuji Wallpaper PRD

## 1. Module Summary

**App:** Prabhuji  
**Module:** Wallpaper  
**Screen/Flow:** Wallpaper Module Spec  
**Feature type:** Devotional media gallery and wallpaper utility  
**Version:** v1.0  
**Status:** Approved  
**Figma source:** Prabhuji Figma file `ipSvV1FnmzvV8TK2Ig8Aiq`, nodes `712:7121`, `704:5223`, `707:6427`, `282:2812`, `712:6622`

Wallpaper is a devotional media gallery where users discover static devotional images and live/video wallpapers. Users usually enter from the `Set Wallpaper` card on Home. They can browse by deity, explore CMS-controlled homepage rows, preview a wallpaper full-screen, like it, and share it.

The module should feel visual, devotional, and simple. Sacred imagery must remain dignified. UI overlays should not cover deity faces or important sacred symbols. The preview experience uses a vertical reels-like swipe, but it should remain calm and utility-focused, not noisy like an entertainment feed.

The business goal is Pro subscription conversion. Free logged-in users can browse and preview freely. Pro is required only when the user tries to set a wallpaper on the device.

## 2. Product Intent

Wallpaper helps users make their phone feel devotional through Prabhuji content.

The product intent is to let users first see devotional value, then convert to Pro when they show clear intent to apply a wallpaper. This follows Prabhuji monetization principles: discovery is free, deep usage can be Pro, and paywall should appear after intent.

The feature should be easy for mass-market Android users. The path should be simple: open Wallpaper, browse, preview, then set.

## 3. User Goals

- Browse devotional wallpapers by deity.
- Discover new, trending, live, and personalized liked wallpapers.
- Preview static and live wallpapers full-screen before applying.
- Swipe vertically in preview to explore the next wallpaper.
- Like wallpapers for later.
- Share wallpaper preview links, especially through WhatsApp.
- Set a static wallpaper as home screen or lock screen.
- Set a live/video wallpaper as home screen wallpaper.

## 4. Business Goals

- Convert free users to Pro when they try to set a wallpaper.
- Increase session depth through visual devotional browsing.
- Increase sharing through WhatsApp-first sharing.
- Increase daily return potential through fresh CMS-controlled wallpaper rows.
- Build a CMS-driven structure so product/content teams can add categories and rows without app release.

## 5. Free vs Pro Behavior

### 5.1 Free User

Confirmed Phase 1 rule: users cannot use the app unless logged in. Therefore all Wallpaper users are assumed to be logged in.

Free users CAN:

- Open Wallpaper from Home.
- Browse Wallpaper Home.
- Browse deity filters.
- Open deity/category listing pages.
- View static wallpaper previews.
- View live/video wallpaper previews.
- Swipe vertically through the preview feed.
- Like and unlike wallpapers.
- Share a wallpaper deep link with preview thumbnail.
- Use WhatsApp-first share with native share fallback.

Free users CANNOT:

- Set a static wallpaper as home screen wallpaper.
- Set a static wallpaper as lock screen wallpaper.
- Set a live/video wallpaper as home screen wallpaper.
- Download the full-resolution media file to gallery in Phase 1.

Free users should NOT see:

- Lock badges on Wallpaper Home cards.
- Lock badges on listing grid cards.
- A paywall on module entry.
- A paywall when tapping a deity/category.
- A paywall when opening preview.
- A paywall when liking.
- A paywall when sharing.

Exact paywall trigger rules:

- If a free user taps `Set Wallpaper`, open the unified paywall.
- If a free user taps `Set Lockscreen`, open the unified paywall.
- After successful subscription, return to the same preview.
- Automatically resume the intended set action if technically safe.
- If auto-resume is not safe on the device, return to the same preview and keep the set CTA visible.

### 5.2 Pro User

Pro users CAN:

- Do everything free users can do.
- Set static wallpapers as home screen wallpaper.
- Set static wallpapers as lock screen wallpaper.
- Set live/video wallpapers as home screen wallpaper.

Pro users should not see:

- Paywall on set actions.
- Pro lock badges on wallpaper discovery surfaces.

## 6. Section/Feature Requirements

### 6.1 Entry and Navigation

Users normally enter Wallpaper from the Home `Set Wallpaper` feature card. The Wallpaper Home screen has a top nav with a back button and title `Wallpapers`.

Tapping back returns to the previous screen. If the user entered from Home, back returns to Home.

Hidden or unrelated Figma artifacts should not be implemented. Only visible design elements from the approved frames/snapshots should be used.

### 6.2 Wallpaper Home

Wallpaper Home contains:

- Top app bar with back button and title.
- Horizontal deity filter row.
- CMS-controlled horizontal content rows.
- Wallpaper cards in vertical image ratio.

Initial Phase 1 product-suggested rows are:

- Top Live Wallpapers.
- New Wallpapers.
- Trending Wallpaper.
- Liked Wallpaper.

These rows must be CMS-configurable. CMS can add, remove, reorder, rename, and configure homepage rows.

If a CMS row has no content, hide that row. Do not show an empty placeholder row.

### 6.3 Deity Filter Row

The top circular row is for deity filters only.

Visible examples:

- All Gods.
- Hanuman ji.
- Ram ji.
- Durga Ma.
- Ganesh Ji.
- Shri Krishna.
- Vishnu Ji.
- Lakshmi Ma.
- Radha Ma.
- Khatu Shyam.
- Saraswati Ma.
- Kali Ma.

`All Gods` should be pinned first.

Custom categories do not appear in this row. Custom categories appear as homepage rows below the deity row, using the same design pattern as rows like `Top Live Wallpapers` and `Trending Wallpaper`.

Tapping a deity opens a listing page filtered to that deity. Example: tapping Durga Ma opens `Durga Ma Wallpapers`.

### 6.4 CMS Homepage Rows and Custom Categories

Custom categories are represented as CMS-controlled homepage rows. They should follow the same horizontal row design as the visible rows.

Each row should have:

- Row title.
- Optional row icon.
- Ordered wallpaper items.
- Optional filter criteria such as media type, deity tag, festival tag, or custom category tag.
- Optional row type such as top live, new, trending, liked, or custom.

CMS must support row add/remove/reorder in Phase 1.

`Liked Wallpaper` is personalized. It shows wallpapers liked by the current logged-in user. If the user has no liked wallpapers, hide the row.

### 6.5 Category / Listing View

The listing view appears when the user taps a deity or a row `Show all` action if present.

Visible example: `Durga Ma Wallpapers`.

The listing page contains:

- Top app bar with back button and dynamic title.
- Two-column wallpaper grid.
- Vertical image cards.
- `LIVE` badge on live/video wallpaper cards.

Tapping a wallpaper card opens preview.

The listing should support infinite scroll or pagination if the CMS result is large.

### 6.6 Static Wallpaper Preview

Static preview uses a full-screen devotional image with calm overlays.

Visible elements:

- Back button.
- Immersive background image.
- Gradient overlay for readability.
- Right engagement rail with like and WhatsApp/share.
- Like count.
- Share count.
- Set count text, e.g. `Wallpaper set 560678 TIMES`.
- Bottom buttons: `Set Wallpaper` and `Set Lockscreen`.

Static set behavior:

- `Set Wallpaper` means set as home screen wallpaper.
- `Set Lockscreen` means set as lock screen wallpaper.
- Free user tapping either button opens unified paywall.
- Pro user tapping either button starts the Android system-level wallpaper flow where possible.
- If Android shows a system chooser, the app should preselect or label based on the tapped action where possible.

### 6.7 Live / Video Wallpaper Preview

Live preview uses a full-screen looping video or live wallpaper preview.

Visible elements:

- Back button.
- Immersive live/video preview.
- Gradient overlay for readability.
- Right engagement rail with like and WhatsApp/share.
- Like count.
- Share count.
- Set count text.
- One bottom button: `Set Wallpaper`.

Live wallpaper rules:

- Live/video wallpaper can only be set as home screen wallpaper in Phase 1.
- Do not show `Set Lockscreen` for live/video wallpapers.
- Live preview autoplays muted and loops.
- Wallpapers have no sound.
- If preview leaves the viewport during vertical swipe, pause or stop playback.
- Only the active visible live preview should play.

Implementation note:

- CMS/backend should provide a video preview URL plus an Android-compatible live wallpaper asset/package or rendered video asset. The exact implementation depends on engineering feasibility.

### 6.8 Reels-like Vertical Preview Behavior

Preview should scroll vertically like reels.

When the user opens preview, the preview feed should preserve source context:

- Opened from a deity/category grid: vertical swipe continues through the same category list.
- Opened from a homepage row: vertical swipe continues through that same row list.
- Opened from All Gods: vertical swipe continues through the all wallpapers feed.

The user should be able to swipe up/down to previous and next wallpapers.

The transition should feel smooth, but not overly playful. Sacred imagery should remain dignified.

### 6.9 Like Behavior

Like is available to free and Pro users.

Since Phase 1 requires login before app use, likes are saved to the user account.

Tapping like:

- Toggles liked/unliked state.
- Updates UI immediately if the backend request is likely to succeed.
- Reverts and shows a simple error if the backend request fails.
- Updates `Liked Wallpaper` row after refresh or when the user returns to home.

### 6.10 Share Behavior

Share is available to free and Pro users.

The right rail share/WhatsApp button should:

- Prefer direct WhatsApp share if WhatsApp is installed.
- Fall back to the native share sheet if WhatsApp is not installed or cannot open.
- Share a Prabhuji deep link plus preview thumbnail.
- Not share the original full-resolution image/video file.

Share should not require Pro.

### 6.11 Counts

Counts shown in the UI come from backend.

Counts include:

- Like count.
- Share count.
- Wallpaper set count.

Display counts in formatted form, such as `12.5k`.

Increment set count only after a successful wallpaper set action.

Share count may increment after the share intent is launched or after a confirmed callback if available. If callback is not reliable, increment on share sheet launch.

### 6.12 Android Set Flow

Use system-level Android wallpaper APIs/settings where possible.

For unsupported actions, show this message:

`This device does not support this wallpaper action.`

For failures, show a simple error with retry if appropriate.

Do not show a custom permission education screen in Phase 1 unless engineering needs it for a specific Android version.

### 6.13 Downloads and Caching

No user-visible download/save-to-gallery feature in Phase 1.

Temporary caching is allowed only for:

- Smooth preview.
- Share thumbnail.
- Wallpaper set flow.

The app should not expose the original full-resolution media file through share.

## 7. States & Fallback Behavior

### Loading

- Show skeletons or lightweight placeholders for homepage rows and grid cards.
- Load images progressively if possible.
- For live wallpapers, load thumbnail first, then preview video when opened.

### Empty Wallpaper Home

- If all CMS homepage rows are empty, show a calm empty state and retry.
- Keep the top nav and deity row if deity data is available.

### Empty CMS Row

- Hide the row.
- Do not show an empty row title.

### Empty Liked Wallpaper Row

- Hide `Liked Wallpaper` if the current user has no liked wallpapers.

### Empty Deity Listing

- Show a simple empty state: `No wallpapers available yet.`
- Include a back action.

### CMS Failure

- Show retry CTA.
- Do not crash the screen.
- If some rows load and some fail, show loaded rows and hide failed rows.

### Image Load Failure

- Show a neutral devotional placeholder or retry state on the card/preview.
- Do not show broken image icons.

### Live Preview Failure

- Show static thumbnail fallback if available.
- Hide live playback controls because wallpapers do not use audio.
- Keep set action disabled if the set asset is unavailable.

### Offline

- If cached thumbnails exist, show cached content with limited interaction.
- If preview/set requires network and the asset is not cached, show offline error.
- Do not allow set action until required asset is available.

### Unsupported Device Action

- Show: `This device does not support this wallpaper action.`

### Set Failure

- Show a simple failure message and allow retry.
- Do not increment set count.

### Set Success

- Show a calm success confirmation.
- Increment set count after confirmed success.
- Return user to preview unless Android system flow already returned there.

### Paywall Cancellation

- Return the user to the same preview.
- Do not set wallpaper.
- Do not increment set count.

## 8. Phase 1 / Phase 2 Scope

### Phase 1 Scope

- Wallpaper Home.
- Deity filter row.
- CMS-controlled homepage rows and custom categories.
- Initial rows: Top Live Wallpapers, New Wallpapers, Trending Wallpaper, Liked Wallpaper.
- Hide empty rows.
- Personalized Liked Wallpaper row.
- Deity/category listing with two-column grid.
- Static wallpaper preview.
- Live/video wallpaper preview.
- Reels-like vertical preview swipe.
- Source-context preserved in preview feed.
- Like/unlike.
- WhatsApp-first share with native fallback.
- Share deep link plus preview thumbnail.
- Backend counts for likes, shares, and sets.
- Static set as home screen or lock screen for Pro users.
- Live/video set as home screen only for Pro users.
- Unified paywall when free user taps set action.
- Android system-level wallpaper flow where possible.
- Unsupported device message.
- No user-visible download/save-to-gallery.
- Ignore hidden/non-visible Figma artifacts.

### Phase 2 Scope / Brainstorm

- Search wallpapers.
- Personalized wallpaper rows by preferred deity.
- Festival/occasion wallpaper rows.
- Daily wallpaper recommendation.
- Download/save to gallery.
- Wallpaper packs.
- Advanced live wallpaper effects.
- More granular Pro packaging for premium wallpaper collections.
- New wallpaper notifications.
- Contextual Pro explanation before paywall.
- Better live wallpaper compatibility checks by device.

## 9. Analytics

Suggested events:

- `wallpaper_home_opened` — user opens Wallpaper Home.
- `wallpaper_deity_filter_tapped` — user taps a deity filter.
- `wallpaper_home_row_viewed` — a CMS row becomes visible.
- `wallpaper_home_row_item_tapped` — user taps a wallpaper from a homepage row.
- `wallpaper_listing_opened` — user opens a category/listing page.
- `wallpaper_grid_item_tapped` — user taps a grid item.
- `wallpaper_preview_opened` — preview opens.
- `wallpaper_preview_swiped` — user swipes to next/previous wallpaper.
- `wallpaper_like_toggled` — user likes or unlikes a wallpaper.
- `wallpaper_share_tapped` — user taps share/WhatsApp.
- `wallpaper_set_tapped` — user taps Set Wallpaper or Set Lockscreen.
- `wallpaper_paywall_shown` — free user sees paywall after set intent.
- `wallpaper_paywall_purchase_success` — user converts from paywall.
- `wallpaper_set_success` — wallpaper set succeeds.
- `wallpaper_set_failed` — wallpaper set fails.
- `wallpaper_unsupported_device_action_shown` — unsupported Android action shown.

## 10. Handoff Notes

- Figma is visual truth for layout. This package is behavior truth.
- Only visible design elements should be implemented. Hidden/unrelated node artifacts should be ignored.
- Wallpaper module follows Prabhuji defaults: discovery is free, deep usage can be Pro, no paywall on module entry, no lock badges on discovery surfaces.
- All users are logged in before using the app in Phase 1, so module-level logged-out behavior is not required.
- CMS must control homepage rows and custom categories.
- Custom categories appear as horizontal rows below deity filters, not inside the deity filter row.
- Sacred imagery should not be covered by aggressive overlays, badges, or commercial CTAs.
- Live wallpapers have no audio.
- Full-resolution original media should not be shared in Phase 1.
- Engineering must validate Android wallpaper APIs and live wallpaper support across target devices.