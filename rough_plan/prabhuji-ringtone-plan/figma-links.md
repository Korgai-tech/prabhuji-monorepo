# Figma Links: Prabhuji Ringtone

## Main Frame(s)

| Frame | Node ID | URL |
|---|---:|---|
| Ringtone module section | `712:7122` | https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=712-7122&t=TzCwzI6RZASLubyK-1 |
| Ringtone Home | `670:4481` | https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=670-4481&t=TzCwzI6RZASLubyK-1 |
| Search Results | `1073:3472` | https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=1073-3472&t=TzCwzI6RZASLubyK-1 |
| Ringtone Preview | `683:4775` | https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=683-4775&t=TzCwzI6RZASLubyK-1 |
| Share Ringtone | `683:5084` | https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=683-5084&t=TzCwzI6RZASLubyK-1 |
| Ringtone card component reference | `676:4710` | https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=676-4710&t=TzCwzI6RZASLubyK-1 |

## Important Detected Nodes

| Area | Node ID | Notes |
|---|---:|---|
| Main Ringtone section | `712:7122` | Contains Ringtone Home, Search Results, Ringtone Preview, and Share Ringtone in the rendered section snapshot. |
| Ringtone Home frame | `670:4481` | Main listing screen with search, deity filters, and 3-column ringtone grid. |
| Search Results frame | `1073:3472` | Search state with query Krishna, Search Results heading, and same card grid. |
| Ringtone Preview frame | `683:4775` | Preview screen visually detected in section snapshot with hero image, title, metrics, play/pause, and Set Ringtone CTA. |
| Share Ringtone frame | `683:5084` | Bottom-sheet share screen visually detected with Whatsapp, Status, Instagram, and Other. |
| Ringtone card component | `676:4710` | Designer-referenced component for play count and set count tracking. |
| Search field | `670:4481` | Placeholder copy: Search Ringtones. Mic icon visible but voice search is Phase 2. |
| Deity filter row | `670:4481` | All Gods selected, then deity chips such as Hanuman ji, Ram ji, Durga Ma, Ganesh. CMS-controlled. |
| Ringtone grid cards | `670:4481` / `1073:3472` | Cards show image, play overlay, title, play count, and set count. |
| Gurur Brahma Mantra card | `670:4481` | Example ringtone card with 5.8L plays and 1.5L set count. |
| Shanti Mantra card | `670:4481` | Example ringtone card with 6.0L plays and 2.0L set count. |
| Maha Mrityunjaya Mantra card | `670:4481` | Example ringtone card with truncated title and compact counts. |
| Gayatri Mantra card | `670:4481` | Example ringtone card with 7.4L plays and 3.3L set count. |
| Saraswati Vandana card | `670:4481` | Example ringtone card with 2.9L plays and 0.8L set count. |
| Vishnu Sahasranama card | `670:4481` | Example ringtone card with 9.1L plays and 5.0L set count. |
| Durga Saptashati card | `670:4481` | Example ringtone card with 3.6L plays and 1.1L set count. |
| Hanuman Chalisa card | `670:4481` | Example ringtone card with 8.0L plays and 2.5L set count. |
| Lakshmi Ashtakshara card | `670:4481` | Example card with truncated title and compact set count. |
| Krishna Stotra card | `670:4481` | Example ringtone card with 6.5L plays and 3.2L set count. |
| Brahma Gayatri Mantra card | `670:4481` | Example ringtone card with 5.1L plays and 0.9L set count. |
| Vishwakarma Mantra card | `670:4481` | Example ringtone card with 10.2L plays and 4.0L set count. |
| Preview Set Ringtone CTA | `683:4775` | Primary orange CTA. Sets phone ringtone only in Phase 1. |
| Preview metrics row | `683:4775` | Like, play, and share metrics visible. Pro-only actions. |
| Share destination sheet | `683:5084` | Custom visual design exists, but Engineering may choose native Android share sheet. |

## Figma Implementation Notes

- The approved behavior is Pro-only deep usage. Free users can browse but cannot preview or hear ringtone audio before subscribing.
- Figma shows play icons on cards. Behavior differs by entitlement: free users see paywall, Pro users open preview and auto-play.
- Figma shows a microphone icon in the search field. Voice search is not Phase 1. Hide or disable the mic icon, and do not request microphone permission.
- Figma shows a custom share sheet. Designer approved Engineering choice between this custom sheet and the native Android share sheet.
- Figma does not show Android ringtone permission states. These are defined in the package behavior spec.
- Figma does not show paywall frames in this module. Use the existing unified MVP paywall.
- Some Figma node names appear to be inherited or generic, such as Aarti and Openly/Chats in header internals. Treat the visible Ringtone UI and this spec as the source for behavior.
- The grid is visually dense. For accessibility and small-screen usability, make the full card tappable, not only the play icon.
- The preview frame uses a large devotional image. Avoid adding overlays that cover deity faces or sacred imagery.
- Search Results uses the same card component and access rules as Ringtone Home.
- Count formatting in Figma uses Indian compact notation such as 5.8L, 1k, and 99. Preserve this behavior.