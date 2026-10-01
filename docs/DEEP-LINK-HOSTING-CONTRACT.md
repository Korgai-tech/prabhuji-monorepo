# Deep Link Hosting Contract — krutyug.ai

**TAM-124 deliverable.** Everything the marketing site (`https://krutyug.ai`) must serve so the mobile app's deep linking works end-to-end. Two artifacts: `assetlinks.json` under `.well-known/`, plus a landing page under `/app/*`.

Nothing in this doc is code — it's a hand-off from the mobile team to whoever owns `krutyug.ai` hosting.

> **Last checked against production: 2026-09-16.** `assetlinks.json` and the `/app/*` page were fetched live, and `adb shell pm get-app-links com.prabhuji.ai.debug` reported `krutyug.ai: verified` on a physical device. Sections below describe what is actually deployed, and call out where it differs from the original plan.

---

## 1. `/.well-known/assetlinks.json`

### Where to host

**Exact URL**: `https://krutyug.ai/.well-known/assetlinks.json`

**Requirements** (all enforced by Google's Digital Asset Links verifier — miss any and App Links auto-verify silently falls through to a browser tap):

- HTTPS only. HTTP + redirect to HTTPS is **not accepted**.
- `Content-Type: application/json`. A `; charset=utf-8` parameter is fine — production serves exactly that and verifies on-device (checked 2026-09-16). Any other media type is not.
- No redirects (302/301). Must return HTTP 200 with the body directly.
- File must be **publicly readable** (no auth, no cookies required).
- Body must be minified or pretty-printed JSON — either is fine.

### Content — as deployed

**This is the live file. Deploy changes by editing THIS block, never an older copy** — dropping a fingerprint silently breaks App Links for every install signed with that key (a Play-installed user's tap would open the browser instead of the app).

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.prabhuji.ai",
      "sha256_cert_fingerprints": [
        "0C:37:B7:F6:80:CE:E1:FE:FA:62:9A:27:D4:76:27:5F:C8:10:D1:A9:31:97:5B:F8:F6:EE:A6:C6:49:49:A8:71",
        "B3:1B:DA:3B:54:E5:47:0A:EA:D2:32:F5:E4:8B:4F:94:A8:39:F8:83:71:DC:DE:72:CA:71:A5:12:E2:98:81:75",
        "C1:CE:AD:FF:63:7D:E0:C3:06:34:F2:95:5A:C9:0C:B3:AA:51:22:51:3E:89:C3:98:31:DB:87:1F:44:4A:53:77"
      ]
    }
  },
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.prabhuji.ai.debug",
      "sha256_cert_fingerprints": [
        "0C:37:B7:F6:80:CE:E1:FE:FA:62:9A:27:D4:76:27:5F:C8:10:D1:A9:31:97:5B:F8:F6:EE:A6:C6:49:49:A8:71",
        "B3:1B:DA:3B:54:E5:47:0A:EA:D2:32:F5:E4:8B:4F:94:A8:39:F8:83:71:DC:DE:72:CA:71:A5:12:E2:98:81:75"
      ]
    }
  }
]
```

### What each fingerprint is

| SHA-256 (prefix) | Key | Listed for | Purpose |
|---|---|---|---|
| `0C:37:B7…` | `apps/mobile/android/app/prabhuji-upload-keystore.jks` (alias `upload`) | both packages | Sideloaded release APKs (direct `adb install`, staff distribution). |
| `B3:1B:DA…` | the shared Android debug keystore (`~/.android/debug.keystore`) | both packages | Debug builds, so devs can test App Links end to end. Confirmed: this is the signature of the debug build that verified on 2026-09-16. |
| `C1:CE:AD…` | **not recorded in this repo** — presumably the Google Play **app signing** key (see below) | `com.prabhuji.ai` only | Play-Store-installed users. **Confirm** against Play Console → App integrity → App signing key certificate, and record it here. |

### Google Play App Signing SHA-256

When `com.prabhuji.ai` is enrolled in Google Play App Signing (default and required for new apps published since Aug 2021), **Google re-signs your uploaded AAB with a different key before serving to users**. On-device, App Links verify against **that** key's SHA-256 — not your upload keystore's.

Google's app-signing SHA-256 must be in entry 1 (the release entry). Production lists a third fingerprint there (`C1:CE:AD…`) that is not documented anywhere else in this repo — it is very likely this key, but verify it rather than assume. Otherwise every Play-Store-installed user's tap on `https://krutyug.ai/app/...` will fall through to the browser instead of opening the app.

**Where to find it** (once the app is on Play Console):
1. Play Console → your app → **Release** → **Setup** → **App integrity**
2. Under **App signing**, copy the **SHA-256 certificate fingerprint** for the "App signing key certificate"
3. Add it to `sha256_cert_fingerprints` in entry 1 (the array supports multiple values):

```json
"sha256_cert_fingerprints": [
  "0C:37:B7:F6:80:CE:E1:FE:FA:62:9A:27:D4:76:27:5F:C8:10:D1:A9:31:97:5B:F8:F6:EE:A6:C6:49:49:A8:71",
  "<PASTE-PLAY-APP-SIGNING-SHA-256-HERE>"
]
```

Keep the upload-key SHA-256 in there too — it doesn't hurt, and it keeps sideloaded release APKs working.

### Verify after deploying

```bash
# 1. Confirm the file is actually served with the right Content-Type + no redirects
curl -I https://krutyug.ai/.well-known/assetlinks.json
# Expect: HTTP/2 200, Content-Type: application/json

# 2. View the body to be sure it's what you deployed
curl https://krutyug.ai/.well-known/assetlinks.json

# 3. Google's official verifier — the exact same thing the OS runs at app install:
# https://developers.google.com/digital-asset-links/tools/generator
# Enter:
#   Hosting site domain: krutyug.ai
#   App package name:    com.prabhuji.ai
#   App package fingerprint: 0C:37:B7:F6:80:CE:E1:FE:FA:62:9A:27:D4:76:27:5F:C8:10:D1:A9:31:97:5B:F8:F6:EE:A6:C6:49:49:A8:71
# Should return "Test succeeded".

# 4. On a real Android device with the app installed, verify from the OS side:
adb shell pm get-app-links com.prabhuji.ai
# Should show:
#   krutyug.ai: verified
```

---

## 2. Landing page under `/app/*`

### Purpose

A user without the app taps a share URL (`https://krutyug.ai/app/aarti/xyz`, `.../status/abc`, etc.). Their browser loads this landing page. The page's ONLY job is to:

1. Render Open Graph meta tags so the preview card in the messenger looked right BEFORE the tap (WhatsApp fetches these to build the link preview).
2. Redirect to Play Store with `?referrer=<original path>` so the app can recover the target on first launch.

**The app itself never sees this page.** When the app IS installed, Android App Links intercepts the URL before the browser is ever involved.

### Path shape

The mobile app's Android intent-filter is `pathPrefix="/app/"`, so anything under that prefix opens the app if installed. Marketing site should serve the same set of paths so users without the app land on the redirect page:

```
https://krutyug.ai/app/                                (generic — no target)
https://krutyug.ai/app/status/<id>
https://krutyug.ai/app/aarti/<id>
https://krutyug.ai/app/mantra/<id>
https://krutyug.ai/app/book/<id>
https://krutyug.ai/app/horoscope/<zodiacId>
https://krutyug.ai/app/ringtone/<id>
https://krutyug.ai/app/wallpaper/<id>
https://krutyug.ai/app/pro
https://krutyug.ai/app/home
```

The simplest deployment is a **single HTML page** that handles all `/app/*` paths — the mobile team confirmed the marketing site is static, so per-content dynamic OG tags aren't in scope. One generic OG card for every share is the accepted trade-off.

### What is deployed (2026-09-16)

A minimal redirect page — no Open Graph tags, no styling:

```html
<script>
  var target = location.pathname + location.search;
  var storeUrl = "https://play.google.com/store/apps/details?id=com.prabhuji.ai&referrer=" + encodeURIComponent(target);
  document.getElementById("fallback").href = storeUrl;
  location.replace(storeUrl);
</script>
```

- **Referrer: correct.** It passes `pathname + search`, which is better than the original template below (`pathname` only): share attribution (`?ref=…`, `?utm_*`) survives the install. The app accepts either form.
- **Open Graph: missing.** Messengers get no preview card from the URL itself. App shares still look rich because the app attaches the content thumbnail as an image to every share (`share_service.dart`), but a pasted link — or any client that ignores the attachment — shows a bare URL. Deploying the tags from the template below is still outstanding.

### Landing page HTML template (target state)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Krutyug — Prabhu Ji app</title>

  <!-- Open Graph — what messenger apps read to build the preview card
       before the recipient taps. Static (single OG card for all shares)
       because the site is static; per-content OG is a follow-up. -->
  <meta property="og:type"        content="website">
  <meta property="og:site_name"   content="Krutyug">
  <meta property="og:title"       content="Krutyug — Prabhu Ji">
  <meta property="og:description" content="Daily aartis, mantras, bhajans and more. Watch on Krutyug.">
  <meta property="og:image"       content="https://krutyug.ai/og-image.png">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">

  <!-- Twitter Card mirror (some IM clients read these too) -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="Krutyug — Prabhu Ji">
  <meta name="twitter:description" content="Daily aartis, mantras, bhajans and more.">
  <meta name="twitter:image"       content="https://krutyug.ai/og-image.png">

  <!-- No-JS fallback: refresh redirects to Play Store even if the user's
       browser has JS disabled (some in-app browsers on old Android). -->
  <meta http-equiv="refresh"
        content="0; url=https://play.google.com/store/apps/details?id=com.prabhuji.ai">

  <style>
    body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
           background: #FFF1E2; color: #2b2b2b; text-align: center;
           padding: 48px 24px; margin: 0; }
    h1  { font-size: 28px; margin: 24px 0 8px; color: #FC7304; }
    p   { font-size: 16px; margin: 0 0 32px; }
    a.cta { display: inline-block; padding: 14px 28px; border-radius: 8px;
            background: #FC7304; color: #fff; text-decoration: none;
            font-weight: 600; }
    img.logo { width: 96px; height: 96px; }
  </style>
</head>
<body>
  <img class="logo" src="/og-image.png" alt="Krutyug">
  <h1>Opening Krutyug…</h1>
  <p>If nothing happens automatically, install the app to continue.</p>
  <a class="cta" id="store-link"
     href="https://play.google.com/store/apps/details?id=com.prabhuji.ai">
    Open in Play Store
  </a>

  <script>
    // Preserve the original path (e.g. /app/aarti/xyz) into the Play Store
    // install referrer so the app can recover the target after first launch.
    (function () {
      // pathname + search, so share attribution (?ref=, ?utm_*) survives.
      var referrer = encodeURIComponent(window.location.pathname + window.location.search);
      var storeUrl = 'https://play.google.com/store/apps/details?id=com.prabhuji.ai&referrer=' + referrer;
      document.getElementById('store-link').href = storeUrl;
      // Immediate redirect — the meta http-equiv above handles JS-disabled
      // browsers; this handles the common path.
      window.location.replace(storeUrl);
    })();
  </script>
</body>
</html>
```

### OG image asset

The mobile team supplied `apps/mobile/assets/onboarding/login-background.png` as the OG image. It needs to be:
- Resized to **1200×630** (the standard OG dimensions)
- Kept under **100 KB** (WhatsApp caches aggressively — larger images fail to render on first fetch)
- Hosted at `https://krutyug.ai/og-image.png` (the URL in the `<meta property="og:image">` tag above)

Any web-image compressor (Squoosh, TinyPNG, ImageMagick) handles the resize/compress. If a smaller preview looks better than the current asset, swap it — the mobile team just needs the source of truth to be a decision, not a specific file.

### What the redirect must include

**Non-negotiable**: `?referrer=<url-encoded original pathname>` appended to the Play Store URL. The mobile app reads this via the Play Install Referrer API on first launch to recover which content the user was originally trying to reach.

Without it, users who install the app after tapping a share link always land on the home screen — the whole point of deferred deep linking is defeated.

---

## 3. What the app does after the tap — and how to test it

The site's job ends when Android hands the URL to the app (or the Play Store). What the app then does depends on who is tapping:

| Situation | Result | Verified |
|---|---|---|
| Installed, **logged out** | Login screen first — never Home. The target is held through login and onboarding (including the paywall for a free account) and opened once the user reaches Home, exactly once. Back from the content returns to Home. | On device, 2026-09-16, with both a Pro and a free account |
| Installed, logged in, **Pro** | Opens straight to the content, with Home underneath (back returns to Home — the app never opens a shared screen with nothing behind it). | Automated tests |
| Installed, logged in, **free** | Paywall first; closing it continues to the content. | Automated tests; production analytics show this replay firing (Jul–Aug 2026) |
| **Not installed** | Landing page → Play Store (with `referrer`) → install → first launch → login/onboarding → the content. Same "held until Home" rule as logged out. | **Not yet tested end to end** |

For Pro-gated audio (aarti, mantra), a **free** account lands on that module's main screen rather than the player — by design.

Held targets expire after 24 hours and are wiped on logout, so a later user on the same device never inherits one.

### Test checklist

1. **Verification** — on a device with the app installed:
   ```bash
   adb shell pm get-app-links com.prabhuji.ai        # or com.prabhuji.ai.debug
   # expect:  krutyug.ai: verified
   ```
   Test with a **real tap** (from a messenger or notes app), not `adb shell am start … <package>` — naming the package skips verification, so an unverified domain would still appear to work.
2. **Each row of the table above** — tap a share link in each state.
3. **Not installed** — uninstall, tap a link, confirm the Play Store URL carries `&referrer=%2Fapp%2F…`.
4. **Preview card** — paste a share URL into WhatsApp without sending. Currently a bare link (no OG tags deployed — see §2).

If a link opens the browser instead of the app, check verification first: Google's verifier (§1) and `pm get-app-links`. On debug builds the app logs every step with a `[DEEPLINK]` prefix: `adb logcat -s flutter | grep DEEPLINK`.
