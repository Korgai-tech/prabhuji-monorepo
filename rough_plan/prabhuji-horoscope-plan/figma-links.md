# Figma Links: Prabhuji Horoscope

## Main Frame(s)

| Name | Node ID | URL |
|---|---:|---|
| Horoscope module section | `392:3149` | https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=392-3149&t=TzCwzI6RZASLubyK-1 |
| Horoscope main tab / zodiac selection | `371:3796` | https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=371-3796&t=TzCwzI6RZASLubyK-1 |
| Result header with TTS control | `387:2491` | https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=387-2491&t=TzCwzI6RZASLubyK-1 |
| Unified Prabhuji VIP Membership paywall | `493:3349` | Figma file `ipSvV1FnmzvV8TK2Ig8Aiq`; known app profile node |
| Bottom navigation designs | `765:6549` | Figma file `ipSvV1FnmzvV8TK2Ig8Aiq`; known app profile node |

## Important Detected Nodes

| Area | Node ID | Notes |
|---|---:|---|
| Horoscope module section | `392:3149` | Contains main Horoscope screen and multiple result screen examples. |
| Horoscope main tab | `371:3796` | 360x800 screen with title “Today’s Horoscope”, date, 12 zodiac cards, and bottom nav. |
| Zodiac grid | `371:3796` | Child node IDs were not exposed by the fetched JSON. Grid shows Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, Saittarius, Capricon, Aquarius, Pisces. Implementation must correct typos. |
| Result screen examples | `392:3149` | Shows dark astrology result flow with selected zodiac, date, card, section title, result text, and Next/Finish CTA. Individual result frame node IDs were not exposed by the fetched JSON. |
| Result header with TTS icon | `387:2491` | Updated Basic Nav variant includes back arrow and TTS icon. Spec confirms the TTS icon behaves as mute/unmute. |
| TTS icon | `387:2491` | The visible speaker icon is a mute/unmute control, not replay. |
| Bottom navigation | `765:6549` | Standard app bottom nav has Home, Status, Mandir, Horoscope, Books. Horoscope should be active on main Horoscope screen. |
| Unified paywall | `493:3349` | Used when a free user taps any zodiac sign. No contextual paywall in Phase 1. |

## Figma Implementation Notes

- The 8 visible result screens in Figma are examples/default content, not fixed app logic.
- CMS/admin must be able to add, remove, rename, reorder, enable, and disable horoscope result steps in Phase 1.
- Phase 1 supports only the `daily_horoscope` mode.
- The astrology/star result background is a video, not a static image.
- Use a lightweight compressed silent looping video.
- Provide a static fallback image for low-end devices, slow network, video load failure, or performance issues.
- The TTS icon in node `387:2491` must behave as mute/unmute.
- TTS auto-starts on each section and auto-advances after speech finishes when unmuted.
- The visible Next button remains available even with auto-advance.
- Final enabled step uses Finish.
- Figma text typo: `Saittarius` should be implemented as `Sagittarius`.
- Figma text typo: `Capricon` should be implemented as `Capricorn`.
- Free users should not see lock badges on zodiac cards.
- Paywall should not appear on Horoscope tab entry or screen load.
- Paywall appears only after free user taps a zodiac sign.
- Result content and TTS language should use the app-level language chosen during onboarding or changed in settings.
- Daily refresh should use IST.
- The exact horoscope engine source is not finalized. Business chooses AI model vs third-party API; Engineering owns implementation.