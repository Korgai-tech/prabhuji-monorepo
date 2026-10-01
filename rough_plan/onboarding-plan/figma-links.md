# Figma Links: Prabhuji Onboarding + Paywall

## Main Frames

- Onboarding+Paywall section
  - Node ID: `520:4992`
  - URL: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=520-4992&t=TzCwzI6RZASLubyK-1
  - Notes: Main section containing splash, phone choice, phone input, OTP, OTP-wrong, language, paywall, and paywall component variants.

- Language selector and name
  - Node ID: `406:2953`
  - URL: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=406-2953&t=TzCwzI6RZASLubyK-1
  - Notes: Name input, language grid, Hindi selected state, Continue button.

- Paywall after language selection
  - Node ID: `493:3349`
  - URL: https://www.figma.com/design/ipSvV1FnmzvV8TK2Ig8Aiq/Prabhuji?node-id=493-3349&t=TzCwzI6RZASLubyK-1
  - Notes: Prabhuji VIP Membership paywall with video, plan tabs, benefits, payment area, and shimmer Pay Now CTA.

## Important Detected Nodes

| Area | Node ID | Notes |
|---|---:|---|
| Onboarding+Paywall section | `520:4992` | Parent section for the full onboarding and paywall flow. |
| Splash | `520:4992` | Visible in rendered snapshot. Shows Prabhuji logo and warm background. Child node ID was not exposed by harness JSON. |
| Phone Choice | `520:4992` | Child frame inside section. Shows Login to Prabhuji and Continue with Phone Number. Child node ID was not exposed. |
| Phone Input | `520:4992` | Child frame visible in rendered snapshot. Shows phone number field and Get OTP. Child node ID was not exposed. |
| OTP | `520:4992` | Child frame inside section. Shows OTP sent message, Change No., 4 digit boxes, Submit, Resend OTP countdown. Child node ID was not exposed. |
| OTP Wrong | `520:4992` | Child frame inside section. Shows red input state and Invalid OTP. Child node ID was not exposed. |
| Language frame | `406:2953` | Name field, Choose your language, 8 language cards, Continue. |
| Language selected state | `406:2953` | Hindi selected with orange border and check mark. |
| Paywall frame | `493:3349` | Main VIP paywall screen. |
| Paywall basic nav | `493:3349` | Close icon and Prabhuji VIP Membership title. Raw node also includes extra trailing icon instances that should not affect Phase 1 behavior unless retained visually. |
| Paywall video area | `493:3349` | Header Video Container. Spec requires CMS or remote config video, autoplay with sound, tap to play/pause. |
| Plan switcher | `493:3349` | Per Week, Per Month, Per Quarter tabs. Plan data must be remote-config or CMS controlled. |
| Plan details card | `493:3349` | Free trial, price, subscription detail, VIP Benefits, Cancel Anytime, Refund Policy. |
| Benefits list | `493:3349` | Visible benefits include Mandir, Wallpaper, Ringtone, Aarti & Bhajans, Mantras & Stutis, Whatsapp Status, Horoscope, App icon. |
| Payment container | `493:3349` | Shows Pay Using and GPay UPI. Behavior depends on final payment provider. |
| Shimmer Pay Now button | `493:3349` | Special paywall CTA. Should not become global button behavior. |
| Shimmer button variants | `520:4992` | Rendered snapshot shows shimmer button component states and darker overlays. Use as implementation reference for CTA effect. |

## Figma Implementation Notes

- Figma is visual truth for screen layout, component hierarchy, warm background, input shapes, language card states, paywall card layout, and shimmer CTA visual style.
- This package is behavior truth for mandatory login, routing, paywall frequency, CMS rules, localization, payment states, analytics, and fallbacks.
- Splash is visible in the rendered section snapshot but was not included as an individual node in the harness JSON. Use section node `520:4992` as its source reference.
- Phone input is visible in the rendered section snapshot but was not included as a separate fetched node. Use section node `520:4992` as its source reference.
- Social login icon placeholders appear in raw Figma structure, but phone OTP login is the confirmed MVP behavior. Do not implement social login unless product adds it.
- Figma shows 4 OTP boxes and Resend OTP 20. Exact OTP length and resend rules are engineering-owned and should follow existing internal app behavior such as Dostii.
- Figma shows paywall prices such as ₹2, 7 days, and ₹99/week. These must not be hardcoded. Use CMS/remote config for display and payment/billing backend for actual product and price validity.
- Figma paywall title and plan copy are in English. Phase 1 requires localized paywall copy using selected language with fallback to Hindi, then English.
- Paywall header is specified as video by designer. Figma appears as image/media placeholder, but implementation must support CMS or remote config video replacement without app update.
- Paywall video behavior is confirmed as autoplay with sound and tap to play/pause.
- The paywall close X must route directly to Home without confirmation.
- Free users should see this paywall again on every future app open. This is a confirmed behavior even though Prabhuji default guidance usually avoids paywall on entry.
- Pro users should skip this app-open paywall.
- Some raw Figma node data includes stray placeholder copy unrelated to Prabhuji, such as non-devotional benefit or testimonial text. Do not implement that placeholder copy. Use the visible Prabhuji VIP paywall benefits and CMS-provided localized content.
- Payment provider is not final. The payment method area should be treated as visual intent until Engineering/Product confirms Razorpay, UPI custom flow, or another provider.