# Figma Links: Prabhuji Wallpaper

## Main Frames

- **Wallpaper module section** — node `712:7121`  
  https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=712-7121&t=TzCwzI6RZASLubyK-1

- **Wallpaper Home** — node `704:5223`  
  https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=704-5223&t=TzCwzI6RZASLubyK-1

- **Listing view after deity tap** — node `707:6427`  
  https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=707-6427&t=TzCwzI6RZASLubyK-1

- **Static wallpaper preview** — node `282:2812`  
  https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=282-2812&t=TzCwzI6RZASLubyK-1

- **Live wallpaper preview** — node `712:6622`  
  https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=712-6622&t=TzCwzI6RZASLubyK-1

## Important Detected Nodes

| Area | Node ID | Notes |
|---|---:|---|
| Wallpaper module section | `712:7121` | Combined section containing Wallpaper Home, listing, static preview, live preview, and note card. |
| Wallpaper Home | `704:5223` | Home screen with back/title, deity row, and horizontal rows: Top Live Wallpapers, New Wallpapers, Trending Wallpaper, Liked Wallpaper. |
| Deity filter row | `704:5223` | Visible inside Wallpaper Home. Includes All Gods, Hanuman ji, Ram ji, Durga Ma, Ganesh Ji, Shri Krishna, Vishnu Ji, Lakshmi Ma, Radha Ma, Khatu Shyam, Saraswati Ma, Kali Ma. |
| Top Live Wallpapers row | `704:5223` | CMS-controlled homepage row. Initial Phase 1 row, not hardcoded permanently. |
| New Wallpapers row | `704:5223` | CMS-controlled homepage row. Initial Phase 1 row, not hardcoded permanently. |
| Trending Wallpaper row | `704:5223` | CMS-controlled homepage row. Initial Phase 1 row, not hardcoded permanently. |
| Liked Wallpaper row | `704:5223` | Personalized row for wallpapers liked by current user. Hide when empty. |
| Deity/category listing page | `707:6427` | Example title: Durga Ma Wallpapers. Two-column vertical grid. |
| Wallpaper grid cards | `707:6427` | Grid cards include vertical image thumbnails; some show LIVE badge. |
| LIVE badge | `707:6427` | Badge appears on live/video wallpaper cards only. |
| Static wallpaper preview | `282:2812` | Full-screen image preview with back button, engagement rail, set count, Set Wallpaper, and Set Lockscreen. |
| Live wallpaper preview | `712:6622` | Full-screen live/video preview with back button, engagement rail, set count, and Set Wallpaper only. |
| Right engagement rail | `282:2812`, `712:6622` | Like and WhatsApp/share actions with counts. |
| Bottom action area | `282:2812`, `712:6622` | Static has two buttons. Live has one button. |
| Figma note card | `712:7121` | Note says wallpaper should scroll vertically like reels to preview them. This behavior is confirmed. |

## Figma Implementation Notes

- Figma is visual truth for layout. This package is behavior truth.
- Implement only visible design elements from the approved frames and snapshots.
- Ignore hidden or unrelated Figma JSON artifacts such as Openly / Chats, coins, unrelated menu dots, and unrelated trailing icons.
- Any VIP+ or membership-looking element in non-visible node structure should not create an extra preview CTA. The approved behavior is paywall only after set intent.
- The visible deity row is for deity filters only. Custom categories do not appear in this row.
- Custom categories must appear as CMS-controlled horizontal homepage rows below the deity row, following the design pattern of Top Live Wallpapers, New Wallpapers, Trending Wallpaper, and Liked Wallpaper.
- The four visible homepage rows are Phase 1 product-suggested rows. They should be CMS-configurable, not permanently hardcoded.
- Liked Wallpaper is personalized. If the logged-in user has no liked wallpapers, hide the row.
- Static preview shows Set Wallpaper and Set Lockscreen.
- Live preview shows only Set Wallpaper because live/video wallpapers can be set only as home screen wallpaper in Phase 1.
- Preview must support vertical reels-like scrolling while preserving source context.
- Share uses WhatsApp direct share first, then native share fallback. It shares a deep link plus preview thumbnail, not the original full-resolution file.
- No user-visible download/save-to-gallery action should be added in Phase 1.
- Use Android system wallpaper flow where possible. Unsupported actions must show: This device does not support this wallpaper action.