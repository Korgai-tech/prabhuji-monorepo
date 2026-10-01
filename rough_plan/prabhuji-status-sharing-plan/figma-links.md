# Figma Links: Prabhuji Status Sharing

## Main Frames

- Status section — node `371:2182` — https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=371-2182&t=TzCwzI6RZASLubyK-1
- Status Home — node `302:4384` — https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=302-4384&t=TzCwzI6RZASLubyK-1
- Personal Details — node `371:2185` — https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=371-2185&t=TzCwzI6RZASLubyK-1
- Business Details — node `371:3567` — https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=371-3567&t=TzCwzI6RZASLubyK-1

## Important Detected Nodes

| Area | Node ID | Notes |
|---|---:|---|
| Status module section | `371:2182` | Contains Status Home, Personal Details, and Business Details frames. |
| Status Home frame | `302:4384` | Main Status screen with header, deity filters, status card, actions, overlay, and bottom nav. |
| Personal Details frame | `371:2185` | Add your details screen with Personal tab, avatar picker, name field, and Save button. |
| Business Details frame | `371:3567` | Add your details screen with Business tab, business fields, mobile number, and Save button. |
| Status header | inside `302:4384` | Shows Status title and Edit Details CTA. Sub-node ID was not exposed by harness. |
| Deity filter row | inside `302:4384` | Shows All Gods, Hanuman ji, Ram ji, Durga Ma, Ganesh Ji, and additional filters in node structure. Sub-node ID was not exposed by harness. |
| Status swipe/feed component | inside `302:4384` | Tall vertical status preview feed. Sub-node ID was not exposed by harness. |
| Engagement footer | inside `302:4384` | Contains Share, like count, view count, and Next. Sub-node ID was not exposed by harness. |
| Overlay preview | inside `302:4384` | Bottom overlay with avatar and personal/business details. Sub-node ID was not exposed by harness. |
| Personal/Business tab group | inside `371:2185` and `371:3567` | Selector for details profile type. Sub-node ID was not exposed by harness. |
| Avatar image picker | inside `371:2185` | Large avatar area with camera icon. Sub-node ID was not exposed by harness. |
| Business information fields | inside `371:3567` | Business name, business details, and business mobile number fields. Sub-node ID was not exposed by harness. |
| Bottom navigation | inside `302:4384` | Five-item bottom nav with Status active. Sub-node ID was not exposed by harness. |

## Figma Implementation Notes

- Figma shows one fixed overlay style on the status card. Different overlay templates are approved for Phase 2, not Phase 1.
- Figma shows the Share CTA with a WhatsApp icon. The approved Phase 1 behavior is native Android share sheet, with WhatsApp as the primary expected destination, not WhatsApp-only custom sharing.
- Figma does not show the unified paywall state on Share tap. The spec controls this behavior for free users.
- Figma does not show login/auth states. The approved behavior is login required for all app features, including Status.
- Figma does not show render progress or render failure states. These are required by the spec because final output must be generated before sharing.
- Figma shows image status content in the provided snapshot. Video status behavior is confirmed by designer: Phase 1 videos autoplay muted when in view, and sound controls are Phase 2.
- Figma shows Like and View counts, but the exact view count source is not visually defined. This is listed as a non-blocking implementation question.
- Figma shows camera icons on avatar areas. Approved Phase 1 behavior is image picker only. Camera capture is Phase 2.
- The fetched node structure includes some component names with duplicated Personal labels in tab internals, but the rendered frames clearly show Personal and Business tabs. The rendered visual should be followed.
