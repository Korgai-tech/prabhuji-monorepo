# Figma Links: Prabhuji Home Screen

## Main Home Frame

- **Name:** Home + Infinite Scroll Feed
- **Node ID:** `285:3464`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=285-3464&t=8GTJCrqUNd9uTCCg-1

## Feed Card Header Reference

- **Name:** Article / Status Card Header reference
- **Node ID:** `285:3641`
- **URL:** https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=285-3641&t=8GTJCrqUNd9uTCCg-1
- **Usage:** Header of each feed content card should be tappable and should open the respective module.

## Important Detected Nodes

| Area | Node ID | Notes |
|---|---:|---|
| Home root | `285:3464` | Main Home + Infinite Scroll Feed frame |
| Header container | `285:3482` | Contains logo, help icon, profile avatar, search area in Figma |
| Search bar | `285:3499` | Remove completely from Phase 1 |
| Banner carousel | `224:1367` | CMS-controlled hero banner component |
| Feature shortcut grid | `300:4338` | 2x2 shortcut card grid |
| Aarti & Bhajans card | `767:6580` | Opens Aarti & Bhajans module |
| Mantras & Stutis card | `767:6643` | Opens Mantras & Stutis module |
| Set Ringtone card | `767:6658` | Opens Ringtone module/library page |
| Set Wallpaper card | `767:6666` | Opens Wallpaper module/library page |
| Wallpaper feed card | `285:3539` | Feed card with wallpaper preview and Set Wallpaper CTA |
| Status feed card | `285:3574` | Feed card with business status overlay |
| Aarti & Bhajan audio card | `285:3639` | Audio preview feed card |
| Mantra & Stuti audio card | `285:3689` | Audio preview feed card |
| Ringtone audio card | `285:3739` | Audio preview feed card |
| Bottom bar | `750:6251` | Bottom navigation + gesture bar |
| Bottom nav container | `750:6252` | Home active standard nav |

## Figma Implementation Notes

- Search exists in the current Figma frame, but should be excluded from Phase 1 implementation.
- Pro badge is not visible in the current Home frame; it needs a Pro-state variant near the profile avatar.
- Feed card header tap behavior is a product/spec rule and may not be visible in Figma.
- Feed ordering and banner destinations are CMS-configured and not fully represented in Figma.
