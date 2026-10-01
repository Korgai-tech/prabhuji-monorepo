import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Design tokens extracted from Figma nodes 520:4992, 406:2953, 493:3349 via
/// Figma Dev Mode MCP `get_variable_defs`. Cite the source variable name in the
/// dartdoc above each constant so drift back to raw literals is obvious in review.
///
/// Fidelity pass: TAM-49..53 (2026-07-13).
class AppColors {
  AppColors._();

  // Brand ramp — `Colors/Brand/*`
  static const Color brand100 = Color(0xFFFFF1E2); // splash + phone-choice bg
  static const Color brand200 = Color(0xFFFFE4C5);
  static const Color brand300 = Color(0xFFFE8A02); // primary orange
  static const Color brand400 = Color(0xFFFC7304); // deep orange / CTA start
  static const Color brand500 = Color(0xFFFE7B00); // logo fill

  // Grey ramp — `Colors/Grey/*`
  static const Color grey100 = Color(0xFFF8F8F8);
  static const Color grey200 = Color(0xFFEAEBEE);
  static const Color grey300 = Color(0xFFB8B8B8);
  static const Color grey400 = Color(0xFF767676); // secondary body copy
  static const Color grey500 = Color(0xFF3F3F3F); // primary body copy

  // Universal — `Colors/Universal/*` and `Colors/Neutral/*`
  static const Color black = Color(0xFF000000);
  static const Color white = Color(0xFFFFFFFF);

  // Error — `Colors/Error/*`
  static const Color error100 = Color(0xFFF9EAEA); // invalid OTP pill bg
  static const Color error200 = Color(0xFFDA1F1F); // invalid OTP border/text

  // Success — `Colors/Green`
  static const Color green = Color(0xFF34C759); // benefit checkmarks

  // Terms links — hard-coded `#0069DE` in Figma (no variable). Cited from the
  // phone-choice / phone-input / OTP terms row (nodes 392:3192, 397:2833).
  static const Color linkBlue = Color(0xFF0069DE);

  // Semantic aliases (compose from ramp)
  static const Color scaffoldWarm =
      brand100; // splash / phone-choice / phone-input / OTP
  static const Color primaryCta = brand300;
  static const Color textPrimary = grey500;
  static const Color textSecondary = grey400;
  static const Color dividerHairline = grey200;

  // Onboarding (TAM-49..51) — the phone-choice / phone-input / OTP bottom sheet
  // lifts off the cream scaffold with Figma's `0 -2 10 rgba(0,0,0,0.05)` card
  // shadow (nodes 392:3159, 397:2763, 397:2618). Same value as [homeAvatarShadow]
  // but a different node, so it stays its own token.
  static const Color onboardingSheetShadow = Color(
    0x0D000000,
  ); // #000000 @ 0.05

  // Paywall (TAM-53) surfaces
  static const Color paywallBackground = white;
  static const Color planTabActive = brand300;
  static const Color planTabInactive = grey400;
  static const Color selectedBorder = brand300;
  static const Color unselectedBorder = grey200;
  // Plan-card 2px border — hard-coded `#FF7200` inline in Figma (no variable;
  // NOT the brand ramp's #FC7304/#FE8A02). Cited from the paywall plan card,
  // node 493:3349. Same inline orange as the books drawer header's gradient
  // start (see [AppGradient.booksDrawerHeader]).
  static const Color paywallPlanCardBorder = Color(0xFFFF7200);
  // GPay icon drop shadow — Figma `0 0 1.75 rgba(0,0,0,0.22)` (node 493:3349
  // payment row).
  static const Color paywallGpayIconShadow = Color(
    0x38000000,
  ); // #000000 @ 0.22

  // Language card fill (TAM-52) — `Colors/Brand/100` with subtle tint
  static const Color languageCardFill = brand100;
  static const Color languageCardSelectedFill = Color(0xFFFFF7E6);

  // ---------------------------------------------------------------------------
  // Shell / shared-UI tokens (TAM-58). Extracted from Figma nav `750:6252` and
  // deity row `412:2656` via the Figma REST API (fills sampled off the nodes):
  //   nav surface  = #FFFFFF  (`Colors/Universal/White`)  → white
  //   nav active   = #FC7304  (`Colors/Brand/400`)        → brand400
  //   nav inactive = #767676  (`Colors/Grey/400`)         → grey400
  //   deity label  = #3F3F3F  (`Colors/Grey/500`)         → grey500
  // All resolve to existing ramp entries — semantic aliases only, no new hex.
  static const Color navSurface = white; // nav container fill (#FFFFFF)
  static const Color navActive = brand400; // active tab icon + label (#FC7304)
  static const Color navInactive =
      grey400; // inactive tab icon + label (#767676)
  static const Color navDivider = grey200; // hairline above the bar
  // Deity chip states — Figma component set `Dieties` (302:5225), variants
  // `state=default` / `state=active`:
  static const Color deityLabel = grey500; // default caption (#3F3F3F)
  static const Color deityLabelActive = brand300; // active caption (#FE8A02)
  static const Color deityAvatarBorder =
      grey500; // default inner ring (#3F3F3F)
  static const Color deityAvatarBorderActive =
      white; // active inner ring (#FFFFFF)
  static const Color deityAvatarPlaceholder = grey200; // shimmer/empty avatar
  static const Color shimmerBase = grey200; // AppNetworkImage shimmer base
  static const Color shimmerHighlight =
      grey100; // AppNetworkImage shimmer sweep
  static const Color cardSurface = white; // feed/content card fill

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Aarti & Bhajans (TAM-64). Fills sampled off Figma nodes 412:2656 (main),
  // 420:2909 (listing), 423:4387 (player), 423:4384 (player controls) via the
  // REST tree dump (scratch/aarti_*.json). Semantic aliases where a ramp entry
  // already matches; genuinely new hexes are introduced here (theme is the ONLY
  // place raw hex is allowed) with their Figma provenance.
  static const Color aartiSectionTitle =
      black; // section titles (#000000, 20/28 w600)
  static const Color aartiShowAll =
      grey400; // "Show all" link (#767676, 14/20 w500)
  static const Color aartiCardTitle =
      black; // audio-card title (#000000, 14/20 w500)
  // Audio-card subtitle "Luna" (#8B9CA9, 11/16.5 w300) — a cool grey with no ramp
  // entry; introduced here from node 412:2916.
  static const Color aartiCardSubtitle = Color(0xFF8B9CA9);
  static const Color aartiCategoryCardFill =
      brand500; // category card bg (#FE7B00)
  static const Color aartiCategoryCardLabel =
      white; // category name (#FFFFFF, 16/24 w500)
  // Player metadata near-black (#191815) — title + singer/composer (nodes 425:4849
  // /4851/4852/4854); a warm near-black with no ramp entry.
  static const Color aartiPlayerText = Color(0xFF191815);
  static const Color aartiPlayerTime =
      black; // elapsed/total (#000000, 14 w400)
  static const Color aartiEngagementCount =
      grey500; // like/share counts (#3F3F3F)
  static const Color aartiEngagementIcon =
      grey500; // like/share glyph tint (#3F3F3F)
  // Progress bar (node 425:4871): unfilled track = black @30%, filled + thumb = black.
  static const Color aartiProgressTrack = Color(0x4D000000); // #000000 @ 0.30
  static const Color aartiProgressFill = black;
  static const Color aartiProgressThumb = black;
  // Play/pause centre button circle (node 423:4282/4373): brand400 (#FC7304) in the
  // paused state (prominent "play"), brand200 (#FFE4C5) while playing.
  static const Color aartiPlayCirclePaused = brand400;
  static const Color aartiPlayCirclePlaying = brand200;
  // Player control bar (node 425:4876 "Player Controls" fill = #3F3F3F): a dark
  // rounded pill; the rewind/prev/next/forward glyphs sit on it in white.
  static const Color aartiControlBar = grey500; // #3F3F3F
  // Side-control glyphs (rewind / prev / next / forward) tint on the dark pill.
  // Peach brand200 so every action inside the pill reads as one warm colour
  // family — pairs with the peach play-circle in the playing state and the
  // orange play-circle in the paused state.
  static const Color aartiControlGlyph = brand200;
  static const Color aartiBackArrow = black; // top-nav back arrow (#000000)
  static const Color aartiLikeActive = brand400; // heart tint when liked

  // ---------------------------------------------------------------------------
  // Mantras & Stutis (TAM-66). Fills sampled off Figma nodes 425:4944 (main),
  // 1066:3358 (listing), 438:3074 (player), 1054:4130 (counter sheet) via the
  // REST tree dump (scratch/mantra_*.json). Semantic aliases where an existing
  // ramp/aarti token already matches; the genuinely mantras-specific looks are
  // introduced here with their Figma provenance.
  static const Color mantraArtworkBlock =
      brand200; // artwork card #FFE4C4 (node 438:3076)
  static const Color mantraText =
      brand300; // Devanagari mantra text #FE8A02 (node 438:3199)
  static const Color mantraCounterPillBorder =
      black; // pill hairline #000000 (node 457:3419)
  static const Color mantraCounterPillText =
      grey500; // "0/7 times" #3F3F3F (node 457:3439)
  static const Color mantraNextCardFill =
      grey200; // next-card bg #EAEBEE (node 457:3481)
  static const Color mantraNextTitle =
      black; // next-card title/label #000000 (nodes 457:3485/3486)
  static const Color mantraNextCircle =
      brand400; // next-card play circle #FC7304 (node 459:3119)

  // Ringtone module (TAM-68). Cited from the Figma frames 670:4481 (Home),
  // 1073:3472 (Search), 683:4775 (Preview) via the REST tree dump
  // (scratch/rt-*.json). Semantic aliases where an existing ramp token already
  // matches; genuinely ringtone-specific looks introduced here with provenance.
  static const Color ringtoneCardBorder =
      brand300; // orange card border #FE8A02 (node 676:4711)
  static const Color ringtoneCardTitle = Color(
    0xFF3E2723,
  ); // card title #3E2723 (node 676:4697)
  static const Color ringtoneCountText =
      grey400; // card counts #767676 (nodes 676:4709/4703)
  static const Color ringtonePlayCountIcon =
      grey500; // headphones #3F3F3F (node 683:4689)
  static const Color ringtoneSetCountIcon =
      brand300; // ringtone bell #FE8A02 (node 683:4558)
  static const Color ringtoneCountDivider =
      grey200; // vertical divider #EAEBEE (node 676:4704)
  static const Color ringtonePlayOverlayGlyph =
      white; // card play glyph, cream→white (node 676:4771)
  static const Color ringtonePlayOverlayScrim = Color(
    0x66000000,
  ); // scrim behind card play glyph (52px ellipse 676:4764, legibility)
  static const Color ringtoneSearchBorder = Color(
    0xFFE5E7EB,
  ); // search field stroke #E5E7EB (node 670:4608)
  static const Color ringtoneSearchHint = Color(
    0xFF9CA3AF,
  ); // placeholder + search icon #9CA3AF (nodes 670:4610/4613)
  static const Color ringtoneSearchText = black; // typed query #000000
  static const Color ringtonePreviewTitle = Color(
    0xFF191815,
  ); // preview title #191815 (node 683:4786)
  static const Color ringtonePreviewMetric =
      grey500; // preview counts #3F3F3F (nodes 683:4799 etc.)
  static const Color ringtoneSetCtaFill =
      brand300; // Set Ringtone CTA #FE8A02 (node 683:4904)
  static const Color ringtoneSetCtaLabel =
      white; // CTA label + glyph #FFFFFF (node 683:4916)
  static const Color ringtonePlayCircle =
      brand200; // preview play/pause circle #FFE4C5 (node 683:4282)
  static const Color ringtonePlayCircleGlyph =
      brand400; // preview play/pause glyph #FC7304 (node 683:4286)
  static const Color ringtoneSearchHeading =
      black; // "Search Results" #000000 (node 1073:3927)
  static const Color ringtoneLikeActive = brand400; // heart tint when liked

  // Wallpaper module (TAM-70). Cited from the Figma frames 704:5223 (Home),
  // 707:6427 (Listing), 282:2812 (Static preview), 712:6622 (Live preview) via
  // the REST tree dump (scratch/wp-*.json). Semantic aliases where an existing
  // ramp token already matches; genuinely wallpaper-specific looks (translucent
  // overlays on the immersive image) introduced here with provenance.
  static const Color wallpaperNavTitle =
      black; // "Wallpapers" #000000 20/28 w600 (node I704:5786;5186:10376)
  static const Color wallpaperRowTitle =
      black; // row title #000000 20/28 w600 (node 707:6168)
  static const Color wallpaperShowAll =
      grey400; // "Show all" #767676 14/20 w500 (node 707:6170)
  static const Color wallpaperSetBtnFill =
      white; // Set button pill #FFFFFF (node 282:2818)
  static const Color wallpaperSetBtnLabel =
      brand300; // Set button label + glyph #FE8A02 (node I282:2818;5178:7620)
  static const Color wallpaperFooterText =
      white; // "Wallpaper set N TIMES" #FFFFFF 12/14.4 w400 (node 282:2817)
  static const Color wallpaperRailCount =
      white; // engagement-rail counts #FFFFFF 12/16 w500 (node 282:2837)
  static const Color wallpaperRailIcon =
      white; // engagement-rail glyphs #FFFFFF (nodes 282:2835/2843)
  static const Color wallpaperRailScrim = Color(
    0x33000000,
  ); // rail icon backing #000000 @0.20 (node 282:2834)
  // LIVE badge pill (node 712:6808): the fill is a bound VARIABLE
  // (VariableID:777e045f…/8064:43) that resolves to the brand orange in the
  // listing frame's variable mode (the raw JSON default is white@10%, but the
  // rendered frame — specs/evidence/TAM-70/fidelity/figma-refs — is orange).
  static const Color wallpaperLiveBadgeFill = brand300; // #FE8A02
  static const Color wallpaperLiveBadgeText =
      white; // LIVE glyph + text #FFFFFF (nodes I712:6808;712:6715/6716)
  static const Color wallpaperLikeActive = brand400; // heart tint when liked
  static const Color wallpaperImageBackdrop =
      black; // letterbox behind the immersive image
  static const Color whatsAppShareButton = Color(
    0xFF25D366,
  ); // whatsapp green color

  // ---------------------------------------------------------------------------
  // Status module (TAM-72). Cited from the Figma frames 302:4384 (Status Home),
  // 371:2185 (Personal Details), 371:3567 (Business Details) via the REST tree
  // dumps (scratch/status-*.json). Semantic aliases where an existing ramp token
  // already matches; status-specific looks introduced here with provenance.
  // ---------------------------------------------------------------------------
  static const Color statusTitle =
      black; // "Status" #000000 24/32 w600 (node I302:4928;5186:10465)
  static const Color statusDetailsTitle =
      black; // "Add your details" #000000 24/32 w600 (node I371:2371;5186:10376)
  static const Color statusBackArrow =
      black; // details back arrow #000000 (node I371:2371;5186:10373;5177:7196;5178:7295)

  // Edit Details pill (node I302:4928;5186:10469) — white pill, grey hairline.
  static const Color statusEditPillFill = white; // #FFFFFF
  static const Color statusEditPillBorder = grey300; // #B8B8B8 w1
  static const Color statusEditPillLabel = black; // "Edit Details" #000000

  // Status card (node I330:6125;322:1721) — white card on a warm scaffold with a
  // pale peach hairline.
  static const Color statusCardFill = white; // #FFFFFF
  static const Color statusCardBorder = Color(0xFFFCDBD3); // #FCDBD3 w0.82

  // Engagement footer (node I330:6125;322:1723).
  static const Color statusShareBtnLabel =
      white; // "Share" + whatsapp glyph #FFFFFF (node I330:6125;322:1724;5178:7452)
  static const Color statusCountText =
      grey500; // "24K" / "1.4L" #3F3F3F (nodes I330:6125;322:1728/1735)
  static const Color statusCountIcon =
      grey500; // heart + eye glyph #3F3F3F (nodes I330:6125;322:1726/1730)
  static const Color statusLikeActive = brand400; // heart tint when liked
  static const Color statusNextBtnFill =
      white; // Next pill #FFFFFF (node I330:6125;322:1740)
  static const Color statusNextBtnBorder = grey300; // #B8B8B8 w1.005
  static const Color statusNextBtnLabel =
      black; // "Next" #000000 (node I330:6125;322:1740;5183:8427)

  // Overlay template band (node I330:6125;322:1743) — the FIXED Phase-1 template.
  // Its background is an IMAGE fill (cream mandala, ref 7678fa5a…) exported to
  // assets/status/overlay_template_bg.png; these tokens are its chrome + type.
  static const Color statusOverlayBorder = grey200; // #EAEBEE w0.82
  static const Color statusOverlayName =
      black; // overlay name #000000 16/24 w500 → scaled 13.11/19.66 (node I330:6125;322:1749)
  static const Color statusOverlayDetail =
      grey400; // business/details lines #767676 14/20 w400 → scaled 11.47/16.39 (nodes I330:6125;322:1758/1765)
  static const Color statusAvatarRing =
      grey200; // avatar wrapper ring #EAEBEE (node I330:6125;322:1769)
  static const Color statusAvatarFill =
      white; // avatar backing #FFFFFF (node I330:6125;322:1770)
  static const Color statusAvatarGlyph =
      grey300; // user-01 silhouette stroke #B8B8B8 (node I330:6125;322:1771)
  static const Color statusAvatarBadgeFill =
      white; // plus-circle badge #FFFFFF (node I330:6125;322:1772)
  static const Color statusAvatarBadgeGlyph =
      grey300; // plus glyph stroke #B8B8B8 (node I330:6125;322:1773;3463:405286)
  // NOT a Figma read — letterbox behind the 9:16 media (no Figma node; same
  // treatment as AppColors.wallpaperImageBackdrop).
  static const Color statusMediaBackdrop = black;

  // Details tabs (node 371:3531) — NOTE this frame uses its own orange #EF8A21
  // (NOT the brand300 #FE8A02 ramp); kept literal per the STRICT gate.
  static const Color statusTabActive = Color(
    0xFFEF8A21,
  ); // active label + 3px underline (node I371:3531;371:3524)
  static const Color statusTabInactive =
      black; // inactive label #000000 w400 (node I371:3531;371:3527;371:3520)
  static const Color statusTabGroupLine = Color(
    0xFF969696,
  ); // group bottom hairline #969696 w1 (node 371:3531)

  // Details form fields (nodes 371:3448 focused / 371:3713 default).
  static const Color statusFieldFill = white; // #FFFFFF
  static const Color statusFieldBorderFocused =
      brand300; // #FE8A02 w1.5 (node 371:3448)
  static const Color statusFieldBorder = grey200; // #EAEBEE w1 (node 371:3713)
  static const Color statusFieldLabelFocused =
      brand300; // #FE8A02 12/16 w500 (node 371:3450)
  static const Color statusFieldLabel =
      grey400; // #767676 12/16 w500 (node 371:3715)
  static const Color statusFieldText =
      black; // typed value #000000 16/24 w400 (node 371:3451)
  // NOT a Figma read — Figma ships no error/validation state for these fields
  // (rough_plan/prabhuji-status-sharing-plan/figma-links.md). Spec-driven (§7),
  // reusing the existing error ramp so it matches the OTP error treatment.
  static const Color statusFieldError = error200;
  static const Color statusSectionLabel =
      grey400; // "Business Information" #767676 12/16 w400 (node 371:3671)

  /// Translucent black scrim behind the controls that sit ON the status media
  /// — the mute toggle (node I330:6125;322:1721) and the credit chip
  /// (`4149:22544`). Both render as #000000 at 40%, so they share one token and
  /// cannot drift apart.
  static const Color statusOverMediaControl = Color(0x66000000);

  // Report sheets (TAM-N — Figma 4118:16914 / 4118:17395 / 4118:17468 /
  // 4118:17538). The unfocused border is `Colors/Grey/300` #B8B8B8, NOT the
  // details form's #EAEBEE — a deliberate difference in the newer design, so
  // these fields carry their own tokens rather than reusing statusField*.
  static const Color reportFieldBorder = grey300; // #B8B8B8
  static const Color reportFieldBorderFocused = brand300; // #FE8A02
  static const Color reportFieldLabel = brand300; // #FE8A02 floating label
  static const Color reportCtaEnabled = error200; // #DA1F1F `Colors/Error/200`
  static const Color reportCtaDisabled =
      Color(0xFFECEBF0); // `Greyscale/Surface/Disabled`
  static const Color reportCtaDisabledLabel =
      Color(0xFFBAB3C7); // `Greyscale/Text/Disabled`
  static const Color reportFooterText = grey400; // #767676 privacy line

  // Personal avatar picker (node 371:3556) — 128px circle + orange camera badge.
  static const Color statusPickerRing =
      grey200; // wrapper/content ring #EAEBEE w1.33
  static const Color statusPickerBadgeFill =
      brand300; // camera badge #FE8A02 (node 371:3549)
  static const Color statusPickerBadgeBorder = white; // badge ring #FFFFFF w2
  static const Color statusPickerBadgeGlyph =
      white; // camera glyph #FFFFFF (node I371:3556;371:3550)

  // Save CTA (nodes 371:3724 / 371:3738) — the ctaLR gradient, white label.
  static const Color statusSaveLabel = white; // "Save" #FFFFFF 16/24 w500

  // ---------------------------------------------------------------------------
  // Horoscope module (TAM-74). Cited from the Figma frames 371:3796 (Main) and
  // 387:2571 (Result — the canonical result frame; 8 example step frames live
  // under section 392:3149) via the REST tree dumps (scratch/horo-*.json).
  // Every value below is read from a fill with `visible:true` — several nodes in
  // these frames carry `visible:false` fills (a stale cream header, a bordered
  // pill) that the design does NOT render.
  // ---------------------------------------------------------------------------

  // Main / zodiac grid (371:3796).
  static const Color horoscopeTitle =
      black; // "Today's Horoscope" #000000 24/32 w600 (node I371:3798;5186:10465)
  static const Color horoscopeDate =
      grey400; // "15 June, 2026" #767676 20/28 w600 (node 379:2578)
  static const Color horoscopeCardBorder =
      grey300; // zodiac card hairline #B8B8B8 w1, r8 (node 379:2333)
  static const Color horoscopeCardLabel =
      grey500; // zodiac name #3F3F3F 18/24 w500 (node I379:2333;379:2331)
  // Grid glyph tint. NOTE the exported zodiac MASTERS carry #FC7304, but the
  // grid INSTANCES render #FE8A02 — the glyphs are monochrome and MUST be
  // tinted at the call site (skill: master export is safe only when tinted).
  static const Color horoscopeZodiacGlyph =
      brand300; // #FE8A02 (node I379:2333;379:2410)

  // Result (387:2571). A starfield video/still under a flat 50% black scrim.
  static const Color horoscopeResultScrim = Color(
    0x80000000,
  ); // #000000 @0.50 (node 387:2573)
  static const Color horoscopeVideoBackdrop =
      black; // letterbox behind the video/still (no Figma node — same treatment as wallpaperImageBackdrop)
  static const Color horoscopeBackArrow =
      white; // #FFFFFF (node I1173:4536;5186:10373;5177:7196)
  static const Color horoscopeTtsIcon =
      white; // TTS glyph, both states #FFFFFF (node I1173:4536;5186:10379;5177:7196)
  // The SAME zodiac glyph as the grid, tinted cream here (node 387:2612).
  static const Color horoscopeResultZodiacGlyph = brand200; // #FFE4C5
  static const Color horoscopeResultZodiacName =
      brand200; // #FFE4C5 16/24 w500 (node 387:2613)
  static const Color horoscopeResultDate =
      grey300; // #B8B8B8 16/24 w400 (node 387:2616)
  static const Color horoscopeStepPillFill = Color(
    0x80000000,
  ); // #000000 @0.50, r8 (node 1162:4437)
  static const Color horoscopeStepPillLabel =
      white; // #FFFFFF 16/24 w600 (node 1162:4438)
  static const Color horoscopeResultText =
      brand200; // step body #FFE4C5 16/24 w500, centred (node 1162:4436)
  // The decorative card border/flourish art renders UNTINTED — the exported
  // SVG's own 27 paths are #B8B8B8, which IS the design colour (= grey300).
  static const Color horoscopeCardArt = grey300; // #B8B8B8 (node 1162:4407)
  static const Color horoscopeNextBtnFill = white; // #FFFFFF (node 1162:4461)
  static const Color horoscopeNextBtnBorder = grey300; // #B8B8B8 w1.005
  static const Color horoscopeNextBtnLabel =
      brand300; // "Next"/"Finish" #FE8A02 (node I1162:4461;5178:7620)

  // ---------------------------------------------------------------------------
  // Books & Scriptures (TAM-76) — frames 534:5061 (home), 562:5565 (listing),
  // 639:3947 (contents), 620:3904 (reader), 647:4133 (scripture reader),
  // 637:4191 (chapters drawer), 637:4463 (font overlay).
  // ---------------------------------------------------------------------------
  static const Color booksSectionTitle =
      black; // "Books"/"Browse Categories"/"Newly Added Books" #000000 20/28 w600 (nodes 534:5065/5108/5138)
  static const Color booksShowAll =
      grey400; // "Show all" link #767676 14/20 w500 (node 534:5067)
  static const Color booksCardTitle =
      black; // book-card title #000000 12/16 w500 (node I534:5505;534:5403)
  static const Color booksCardSurface =
      white; // Book Cover frame fill #FFFFFF (node I534:5505;534:5223)
  static const Color booksCardShadow = Color(
    0x1A000000,
  ); // cover drop shadow #000000 @0.10 (node I534:5505;534:5223 effect)

  // Browse Categories cards (nodes 534:5112/5116/5120/5124) — each card carries
  // its OWN fill; there is no shared "category card" token.
  static const Color booksCategoryChalisa = Color(0xFF302722); // node 534:5112
  static const Color booksCategoryAarti = Color(0xFFC88611); // node 534:5116
  static const Color booksCategoryKavach = Color(0xFF505210); // node 534:5120
  static const Color booksCategoryStotram = Color(0xFFB13800); // node 534:5124
  static const Color booksCategoryLabel =
      white; // category name #FFFFFF 16/24 w500 (node 534:5115)

  // Contents (639:3947)
  static const Color booksContentsPanel =
      white; // "Chapters List" panel #FFFFFF (node 639:4029)
  static const Color booksContentsItemTitle =
      grey500; // kanda title #3F3F3F 12/16 w500 (node 639:4046)
  static const Color booksContentsItemCount =
      grey500; // "77 chapters" #3F3F3F 12/16 w400 (node 639:4080)

  // Reader (620:3904 / 647:4133) — the warm reading surface is a FLAT fill here,
  // unlike the home/listing frames' cream→white gradient.
  static const Color booksReaderSurface =
      brand100; // #FFF1E2 (node 620:3904 fill)
  static const Color booksReaderTitle =
      black; // chapter title #000000 20/28 w600 (node 621:4078)
  static const Color booksReaderBody =
      black; // Devanagari body #000000 16/28 w500 (node 620:4076)
  static const Color booksReaderNavTitle =
      black; // kanda name in nav #000000 20/28 w600 (node I620:3917;5186:10376)
  static const Color booksReaderNavIcon =
      black; // font-size + chapters glyphs #000000 (nodes I620:3917;5186:10379/10380)
  static const Color booksReaderNavIconActive =
      brand400; // chapters glyph while the drawer is open #FC7304 (node I637:4196;5186:10380;5177:7196;620:4063)
  static const Color booksButtonLabel =
      white; // Listen/Previous/Next/Start Reading label #FFFFFF (node I663:4269;5178:7452)
  static const Color booksButtonGlyph =
      white; // play/pause/skip glyphs #FFFFFF (node I663:4269;5178:7451;5178:7304)

  // Chapters drawer (637:4191)
  static const Color booksDrawerScrim = Color(
    0x99000000,
  ); // #000000 @0.60 (node 637:4459)
  static const Color booksDrawerSurface =
      white; // drawer panel #FFFFFF (node 637:4366)
  static const Color booksDrawerBookTitle =
      black; // "Valmiki Ramayan" #000000 16/20 w700 (node 637:4424)
  static const Color booksDrawerMeta =
      grey500; // kanda line + "Total Chapters: 77" #3F3F3F 12/16 w400 (nodes 637:4427/4431)
  static const Color booksDrawerChapterActive =
      black; // active chapter #000000 12/16 w500 (node 637:4370)
  static const Color booksDrawerChapterIdle =
      grey500; // idle chapter #3F3F3F (node 637:4372)
  static const Color booksDrawerActiveFill = Color(
    0x33B8B8B8,
  ); // active row #B8B8B8 @0.20 (node 637:4369)

  // Font-size overlay (637:4463)
  static const Color booksFontPanel =
      white; // panel #FFFFFF r0/0/16/16 (node 620:3844)
  static const Color booksFontIcon =
      grey400; // text-size glyph #767676 (node I634:4097;620:4052)
  static const Color booksFontSliderTrack =
      grey200; // #EAEBEE r2 (node 620:3859)
  static const Color booksFontSliderFill = brand300; // #FE8A02 (node 621:4081)
  static const Color booksFontSliderThumb =
      white; // #FFFFFF r12 (node 620:3860)
  static const Color booksFontValueText =
      grey400; // "18px" #767676 14/20 w400 (node 620:3862)
  static const Color booksFontValueBorder =
      grey200; // value box stroke #EAEBEE w2, r4 (node 620:3861)
  static const Color booksFontThumbBorder =
      grey200; // thumb stroke #EAEBEE w1 (node 620:3860)
  static const Color booksFontThumbShadow = Color(
    0x1A000000,
  ); // thumb shadow #000000 @0.10, (0,+2) blur 4 (node 620:3860)
  static const Color booksFontPanelShadow = Color(
    0x1F000000,
  ); // panel shadow #000000 @0.12, (0,+8) blur 30 (node 620:3844)

  // ---------------------------------------------------------------------------
  // Home (TAM-62) — frame 285:3464 "Home+Infinite scroll feed". Read from the
  // REST tree dump (scratch/home_root.json), never eyeballed. The search bar
  // (285:3499) is EXCLUDED from Phase 1 (PRD §6) so none of its tokens land.
  // ---------------------------------------------------------------------------

  // Header (285:3482).
  static const Color homeLogoRing =
      brand300; // logo circle stroke #FE8A02 w0.5 (node 285:3485)
  static const Color homeWordmark =
      brand400; // "Prabhuji" #FC7304 24/31.2 w700 (node 285:3493)
  static const Color homeHelpGlyph =
      black; // messages-question glyph #000000 (node 285:3496)
  static const Color homeAvatarFill = Color(
    0xFFD83A00,
  ); // profile circle #D83A00 (node 285:3497)
  static const Color homeAvatarInitial = Color(
    0xFFFFFBFF,
  ); // avatar initial "M" #FFFBFF (node 285:3498)
  static const Color homeAvatarShadow = Color(
    0x0D000000,
  ); // #000000 @0.05, (0,+1) blur 2 (node 285:3497 effect)

  // Banner carousel (285:3506 / 285:3507, component 224:1367).
  static const Color homeBannerDotActive =
      white; // active dot #FFFFFF (node I285:3507;224:1358)
  static const Color homeBannerDotInactive = Color(
    0x80FFFFFF,
  ); // #FFFFFF @0.50 (nodes I285:3507;224:1359/1360)
  static const Color homeBannerShadowNear = Color(
    0x1A000000,
  ); // #000000 @0.10, (0,+4) blur 6 (node 285:3507)
  static const Color homeBannerShadowFar = Color(
    0x1A000000,
  ); // #000000 @0.10, (0,+10) blur 15 (node 285:3507)

  // Feature shortcut cards (300:4338; cards 767:6580/6643/6658/6666).
  static const Color homeShortcutLabel =
      grey500; // card title #3F3F3F 18/21.78 w600 (node I767:6580;767:6553)
  static const Color homeShortcutShadow = Color(
    0x0D000000,
  ); // #000000 @0.05, (0,+1) blur 2 (node 767:6580 effect)
  static const Color homeShortcutGridShadow = Color(
    0x40000000,
  ); // grid block #000000 @0.25, (0,+3) blur 4 (node 285:3508 effect)

  // Feed card chrome — shared by all five content types (285:3539/3574/3639/
  // 3689/3739; the card body is 285:3540 and the header 285:3541).
  static const Color homeCardSurface =
      white; // card fill #FFFFFF (node 285:3540)
  static const Color homeCardBorder =
      grey300; // card hairline #B8B8B8 w1 (node 285:3539 stroke)
  static const Color homeCardShadow = Color(
    0x0AFC4500,
  ); // #FC4500 @0.04, (0,+8) blur 32 (node 285:3540 effect)
  static const Color homeCardThumbFill = Color(
    0x1AFC7304,
  ); // 40px module tile #FC7304 @0.10 (node 285:3544)
  static const Color homeCardLabel = Color(
    0xFF281712,
  ); // module label #281712 14/20 w500 (node 285:3548)
  static const Color homeCardTitle = Color(
    0xFF281712,
  ); // content title #281712 12/16 w400 (node 285:3550)
  static const Color homeBadgeGlyph =
      brand300; // Trending/Suggested flame #FE8A02 (node 285:3553)
  static const Color homeBadgeLabel =
      brand300; // "TRENDING"/"SUGGESTED" #FE8A02 12/16 w500 (node 285:3554)

  // Primary CTA — the shared `Main Buttons` instance (nodes 285:3557 hero /
  // 285:3672 audio). Both variants share fill/stroke/label; only size differs.
  static const Color homeCtaFill = white; // #FFFFFF (nodes 285:3557 / 285:3672)
  static const Color homeCtaBorder = grey300; // #B8B8B8 w1
  static const Color homeCtaLabel =
      black; // #000000 (nodes I285:3557;5183:8424 / I285:3672;5183:8427)

  // Engagement footer (285:3558/3559).
  static const Color homeEngagementIcon =
      grey500; // like/view/share glyphs #3F3F3F (nodes 285:3562/3567/3571)
  static const Color homeEngagementCount =
      grey500; // "24K"/"1.4L"/"Share" #3F3F3F 14/20 w500 (nodes 285:3564/3569/3573)
  // NOT a Figma read — the frame ships no liked state. Matches every sibling
  // module's liked heart (aartiLikeActive / statusLikeActive / …).
  static const Color homeLikeActive = brand400;

  // Audio preview area (285:3655) + its mini player (285:3658).
  static const Color homeAudioSurface = Color(
    0xFFFCDBD3,
  ); // preview area backing #FCDBD3 (node 285:3655)
  static const Color homeAudioTime =
      white; // elapsed/total #FFFFFF 12/16 w500 (nodes 285:3661/3663)
  static const Color homeAudioProgressTrack = Color(
    0x4DFFFFFF,
  ); // #FFFFFF @0.30 r12 (node 285:3664)
  static const Color homeAudioProgressFill =
      brand300; // #FE8A02 (node 285:3665)
  static const Color homeAudioProgressThumb =
      white; // playhead dot #FFFFFF r12 (node 285:3666)
  static const Color homeAudioProgressThumbShadow = Color(
    0x0D000000,
  ); // #000000 @0.05, (0,+1) blur 2 (node 285:3666 effect)
  static const Color homeAudioPlayGlyph =
      white; // play/pause glyph #FFFFFF (node 285:3671)
  // Node 285:3669 ("Play/Pause Button:shadow") carries two DROP_SHADOWs
  // (#000000 @0.10 at (0,+4) blur 6 spread −4, and (0,+10) blur 15 spread −3) —
  // but its fill is #FFFFFF @ **0.002**, and Figma derives a drop shadow from the
  // layer's alpha mask, so a ~zero-alpha fill casts nothing. The frame render
  // (figma-refs/feed-card-aarti.png) confirms a bare glyph. The effects are
  // vestigial ⇒ deliberately NO token: painting them put a dark box on the
  // artwork that the design does not have. See features/home/TOKENS.md.
  // NOT a Figma read — letterbox behind a 9:16 hero whose aspect differs from
  // the card's box (same treatment as wallpaperImageBackdrop / statusMediaBackdrop).
  static const Color homeMediaBackdrop = black;

  // ---------------------------------------------------------------------------
  // Mini-player v2 (TAM-N-mini-player-v2). Figma frame 1950:20911 ("Frame 276",
  // 360×74) — the visual redesign of the sticky mini-player. Fills read from
  // the node tree (Phase-1 variables endpoint is 403 on this token — file uses
  // semantic variables the SDK can't read, so the resolved node fills are the
  // source of truth per the figma-flutter skill's Phase-1 fallback rule).
  //
  // Gradient stops: node 1950:20911 fill is GRADIENT_LINEAR (handles 0.5,0 →
  // 0.5,1) with stop 0 = rgba(0.9961,0.9843,0.9529,1) and stop 1 =
  // rgba(1,0.7405,0.4364,1). See AppGradient.miniPlayerV2 for the LinearGradient.
  //
  // Glyph tint: play triangle vector 1950:20955 fill = rgba(0.247,0.247,0.247,1)
  // — dark grey #3F3F3F, NOT AppColors.brand400. The close instance 1950:20972
  // inherits the same tint at the call site (SVG srcIn).
  //
  // Text colour: title 1950:20915 + subtitle 1950:20916 both use SOLID rgba(0,0,
  // 0,1) — pure black #000000. AppColors.textPrimary resolves to grey500
  // (#3F3F3F) which is NOT the design fill, hence a dedicated token.
  static const Color miniPlayerV2GradientTop = Color(0xFFFEFBF3);
  static const Color miniPlayerV2GradientBottom = Color(0xFFFFBD6F);
  static const Color miniPlayerV2Glyph = grey500; // #3F3F3F — grey500 exactly
  static const Color miniPlayerV2Text =
      black; // #000000 (title + subtitle both)

  // ---------------------------------------------------------------------------
  // Support screen (TAM-N-support-screen). Figma frame 1939:20185. The
  // WhatsApp CTA uses the partner-brand green #00965E (NOT in the Prabhuji
  // palette — read off node 1939:20197). The disabled/degraded state uses
  // the grey ramp with a dimmed white label so the affordance stays legible
  // when Secrets.supportWhatsAppEnabled is false (placeholders / missing).
  // The clock glyph on the availability row is orange #FC7304 (== brand400)
  // and reuses the existing token via aliasing (supportClockOrange = brand400).
  static const Color whatsAppGreen = Color(0xFF00965E); // node 1939:20197 fill
  static const Color supportDisabledCtaFill = grey300; // #B8B8B8 grey ramp
  static const Color supportDisabledCtaLabel = Color(
    0xB3FFFFFF,
  ); // white @0.70 — dimmed but still legible
  static const Color supportClockOrange = brand400; // #FC7304 (node 1939:20204)

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Chat module (TAM-164). Derived from Figma frames under section 2612:17646
  // (chat empty state 2612:17647, active-chat 2612:17701/17716/17787/17837,
  // components: bubble 2612:17963, cards 2612:17847/17876/17905, typing
  // 2612:17934, date-separator 2612:18005, composer 2612:18010). Colours here
  // reuse the shared ramp wherever the design matches; the four genuinely
  // chat-specific fills (bot bubble ink, empty-state title ink, empty-state
  // subtitle grey and chip-label slate) are introduced here with provenance.
  //
  // NOTE: Slice 3 of TAM-164 re-extracted every value below from the live
  // Figma REST API against file `ipSvV1FnmzvV8TK2Ig8Aiq` via `$FIGMA_TOKEN`
  // (per `.claude/skills/figma-flutter/SKILL.md` § "Data source: MCP first,
  // REST fallback" — the Figma MCP is not exposed in this environment, and
  // `/variables/local` returns 403 because the file is not on an Enterprise
  // plan, so fills are read off resolved node fills per the same skill's
  // Phase-1 fallback). Diff table + per-frame extractor output live at
  // `specs/evidence/TAM-164/fidelity/token-diff.md`.
  // ---------------------------------------------------------------------------
  static const Color chatAppBarTitle =
      black; // "Prabhuji Chat" 20/28 w600 (2612:17647)
  static const Color chatAppBarBackArrow = black; // back-arrow glyph #000000
  static const Color chatUserBubbleFill =
      brand300; // user bubble #FE8A02 (2612:17963 variant=user)
  static const Color chatUserBubbleText =
      white; // 16/24 w400 white (2612:17963)
  static const Color chatBotBubbleFill =
      brand100; // bot bubble peach cream #FFF1E2 (2612:17963 variant=bot)
  // Bot bubble ink is a NEAR-black `#1F1F1F`, NOT pure black — read off
  // node 2612:17963 (Chat Bubble-AI text fill). Distinct from pure #000
  // enough to warrant a dedicated hex; per the skill, theme is the only
  // place raw hex lives.
  static const Color chatBotBubbleText = Color(0xFF1F1F1F);
  static const Color chatTypingBubbleFill =
      grey100; // typing bubble grey #F8F8F8 (2612:17934 Background)
  static const Color chatTypingDot =
      grey400; // typing dots #767676 (2612:17934)
  static const Color chatTypingHint =
      grey400; // "Aapke liye theek cheez dhoondh raha hoon…" #767676 (2612:17837)
  // --- TAM-177: khoj question label + intro video card ----------------------
  /// The `1/6`…`6/6` progress label above a khoj question (Figma `3938:26855`).
  /// This label IS the progress indicator — the old wizard's LinearProgressIndicator
  /// is deleted, so nothing else reports position in the flow.
  static const Color chatKhojLabel = brand300; // #FE8A02
  /// `0:27` duration badge on the intro video card (Figma `3934:14677`) —
  /// translucent black plate so it reads over any frame.
  static const Color chatVideoBadgeFill = Color(0x99000000); // 60% black
  static const Color chatVideoBadgeText = white;

  /// Centred play/pause overlay circle — translucent cream over the frame.
  static const Color chatVideoPlayOverlayFill = Color(0xB3F5E6D3);
  static const Color chatVideoPlayOverlayGlyph = Color(0xFF3D2B1F);

  static const Color chatCardSurface =
      white; // card body fill (2612:17847/17876/17905)
  static const Color chatCardBorder =
      grey300; // 1px grey hairline #B8B8B8 (2612:17847 default)
  static const Color chatCardBorderActive =
      brand400; // 1px orange border #FC7304 (2612:17847 highlighted)
  static const Color chatCardDivider =
      grey200; // between header + CTA row #EAEBEE
  static const Color chatCardTitle = black; // "Hanuman Mantra" 16/24 w600
  static const Color chatCardSubtitle =
      grey400; // "Mantra · 108 baar" 14/20 w400 #767676
  static const Color chatCardCta =
      brand400; // "Jaap shuru karein" 14/20 w500 #FC7304
  static const Color chatCardChevron =
      brand400; // right chevron #FC7304 (matches CTA)
  static const Color chatDateSeparator =
      grey400; // "TODAY" 12/16 w500 letter-spaced #767676 (2612:18005)
  static const Color chatComposerSurface =
      grey100; // input pill fill #F8F8F8 (2612:18010)
  static const Color chatComposerBorder = grey200; // 1px hairline #EAEBEE
  static const Color chatComposerHint =
      grey400; // "Likhiye..." placeholder #767676
  static const Color chatComposerText = grey500; // typed text
  static const Color chatComposerMicFill =
      brand300; // mic circle #FE8A02 (2612:17962 recording variant)
  static const Color chatComposerMicGlyph = white; // mic glyph white
  static const Color chatComposerSendFill =
      brand300; // send circle #FE8A02 (typed variant, matches recording orange)
  static const Color chatComposerSendGlyph = white; // send arrow glyph white
  static const Color chatComposerDivider =
      grey200; // hairline above composer #EAEBEE
  static const Color chatEmptyDeityRing =
      brand300; // roundel inner ring #FE8A02 (2612:17647)
  static const Color chatEmptyDeityFill = brand100; // roundel fill #FFF1E2
  static const Color chatEmptyDeityGlyph =
      brand400; // temple + om glyph #FC7304
  // Empty-state "Namaste" title ink: NEAR-black `#1A1A1A`. Read off text
  // fill in 2612:17647 (Welcome Section title). Distinct from `#000000`.
  static const Color chatEmptyTitle = Color(0xFF1A1A1A);
  // Empty-state subtitle grey: `#666666`, warmer/darker than `grey400`
  // (#767676). Read off text fill in 2612:17647 (Welcome Section subtitle).
  static const Color chatEmptySubtitle = Color(0xFF666666);
  static const Color chatEmptyRecommendedLabel =
      grey400; // "RECOMMENDED" 12/16 w600 letter-spaced #767676
  static const Color chatEmptyChipFill = white; // chip bg
  static const Color chatEmptyChipBorder = grey200; // chip hairline #EAEBEE
  // Recommended-chip label ink: near-navy slate `#1F2937`, not pure black.
  // Read off text fills across the three chip labels in 2612:17647
  // (Aaj mann… / Hanuman chalisa… / Aaj ka rashifal…).
  static const Color chatEmptyChipText = Color(0xFF1F2937);
  static const Color chatEmptyChipIconFill =
      brand100; // 40x40 icon tile bg peach cream
  static const Color chatEmptyChipIconGlyph = brand300; // orange glyph tint
  static const Color chatErrorBanner = error200; // inline error copy tint
  static const Color chatReadOnlyBanner =
      grey400; // "Chat is not available for you right now"

  // Legacy aliases — kept so the pre-fidelity phone/OTP/name-lang/paywall/home
  // screens still compile while their fidelity passes land one at a time. As
  // each screen is rewritten to cite Figma tokens directly, drop its alias.
  // ---------------------------------------------------------------------------
  static const Color brandOrange = brand300;
  static const Color brandOrangeDark = brand400;
  static const Color surfaceSoft = brand100;
  static const Color danger = error200;
}

class AppGradient {
  AppGradient._();

  /// `CTA Gradient` — `Colors/Gradient/CTA (LR)/0` → `.../100`. Left-to-right.
  /// Used for the "Get OTP" / "Submit" / "Continue" / "Pay Now" primary CTAs.
  static const LinearGradient ctaLR = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: <Color>[AppColors.brand400, AppColors.brand300],
  );

  /// Aarti + Mantras category-card readability scrim (TAM-64 / TAM-66) — a
  /// left→right darkening pass under the white category label, over the CMS
  /// `imageUrl` artwork.
  ///
  /// PROVENANCE GAP (flagged, not silently tokenised): the Figma category card
  /// (aarti 412:3001, mantras per lib/features/mantras/TOKENS.md) documents only
  /// a flat `#FE7B00` fill + `#FFFFFF` label — it has NO scrim layer, because the
  /// mock's tiles are flat colour, not photography. This scrim exists only
  /// because we render live CMS art behind the label, where a flat tile would
  /// leave white-on-light text unreadable. The stops (#000000 @0.60 → @0.067)
  /// are therefore a call-site legibility choice, NOT a Figma value. Kept here so
  /// no raw hex lives in feature code; raise with the design owner to get a real
  /// node (tracked alongside the TAM-76 art follow-ups).
  static const LinearGradient categoryCardScrim = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: <Color>[
      Color(0x99000000), // #000000 @ 0.60 (label side)
      Color(0x11000000), // #000000 @ 0.067
    ],
  );

  /// Wallpaper immersive-image readability overlay (TAM-70, node 282:2815 /
  /// 712:6625) — a vertical gradient that darkens ONLY the top and bottom edges
  /// (where the nav, engagement rail and footer sit) and stays fully transparent
  /// across the middle so the deity's face is never covered (PRD §6.6 dignity).
  static const LinearGradient wallpaperOverlay = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: <Color>[
      Color(0x66000000), // #000000 @ 0.40 (top)
      Color(0x00000000), // #000000 @ 0.00 (middle — face stays clear)
      Color(0x99000000), // #000000 @ 0.60 (bottom)
    ],
    stops: <double>[0.0, 0.5, 1.0],
  );

  /// Horoscope Main scaffold (TAM-74, node 371:3796 root fill) — the frame's own
  /// fill is a GRADIENT_LINEAR, not the flat `scaffoldWarm` other screens use.
  ///
  /// Figma: handles (0.5,0) → (0.5,0.4578) with stops `Colors/Brand/100`
  /// (#FFF1E2) @0 and white @0.3846 along that axis. 0.4578 × 0.3846 = 0.1761 of
  /// the frame height, and Figma holds the last stop's colour to the bottom —
  /// so cream at y=0 fading to white by ~17.6%, then white. Expressed here as
  /// topCenter→bottomCenter with the stop pre-multiplied onto the full height.
  static const LinearGradient horoscopeScaffold = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: <Color>[AppColors.brand100, AppColors.white],
    stops: <double>[0.0, 0.1761],
  );

  /// Books home + listing scaffold (TAM-76, nodes 534:5061 / 562:5565 root
  /// fills) — cream→white, identical stop geometry to [horoscopeScaffold] but
  /// re-derived from these frames' own handles (0.5,0)→(0.5,0.4574) with
  /// `Colors/Brand/100` (#FFF1E2) @0 and white @0.3846 along that axis, i.e.
  /// white by 0.4574 × 0.3846 ≈ 0.1759 of the frame height.
  static const LinearGradient booksScaffold = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: <Color>[AppColors.brand100, AppColors.white],
    stops: <double>[0.0, 0.1759],
  );

  /// Book-cover spine gloss (TAM-76, node `I534:5505;534:5227` "Lights", fill 1
  /// of 2: GRADIENT_LINEAR, `blendMode: OVERLAY`, `opacity: 0.20`).
  ///
  /// Figma handles run (0,0.457)→(1,0.457) — a pure left→right axis — and EVERY
  /// stop lives inside the first 6.6% of the width: this is the book's spine
  /// highlight, not a full-width wash. Stops are copied verbatim from the node.
  /// Composite with `BlendLayer(blendMode: BlendMode.overlay, opacity: 0.20)`.
  ///
  /// Reproduced as a token rather than an exported PNG because an isolated node
  /// render flattens OVERLAY compositing to opaque white (see
  /// tools/figma-assets.manifest.json + features/books/TOKENS.md).
  static const LinearGradient bookCoverSpine = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: <Color>[
      Color(0x00FFFFFF), // 0.0046
      Color(0xFFFFFFFF), // 0.0082
      Color(0x00FFFFFF), // 0.0218
      Color(0x00FFFFFF), // 0.0443
      Color(0x00000000), // 0.0479
      Color(0x52000000), // 0.0518 — #000000 @0.32
      Color(0xBD000000), // 0.0544 — #000000 @0.74
      Color(0xFF000000), // 0.0574
      Color(0xFFFFFFFF), // 0.0578
      Color(0xDEFFFFFF), // 0.0603 — #FFFFFF @0.87
      Color(0x78FFFFFF), // 0.0629 — #FFFFFF @0.47
      Color(0x00FFFFFF), // 0.0656 → holds transparent to the right edge
    ],
    stops: <double>[
      0.0046,
      0.0082,
      0.0218,
      0.0443,
      0.0479,
      0.0518,
      0.0544,
      0.0574,
      0.0578,
      0.0603,
      0.0629,
      0.0656,
    ],
  );

  /// Book-cover soft light (TAM-76, node `I534:5505;534:5227` "Lights", fill 2
  /// of 2: GRADIENT_RADIAL, `blendMode: SOFT_LIGHT`, white→transparent).
  /// Figma centre handle (0.462, 0) ⇒ top-centre-ish origin; composite with
  /// `BlendLayer(blendMode: BlendMode.softLight)`.
  static const RadialGradient bookCoverLight = RadialGradient(
    center: Alignment(-0.076, -1.0), // (0.462, 0) in Figma 0..1 → Flutter -1..1
    radius: 1.15, // handle (0.968, 1.009) from the centre
    colors: <Color>[Color(0xFFFFFFFF), Color(0x00FFFFFF)],
    stops: <double>[0.0, 1.0],
  );

  /// Chapters-drawer header (TAM-76, node 637:4417) — left→right #FF7200 →
  /// #FFD4A2. The header's texture (637:4418) rides on top at
  /// `BlendLayer(blendMode: BlendMode.overlay, opacity: 0.30)`.
  static const LinearGradient booksDrawerHeader = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: <Color>[Color(0xFFFF7200), Color(0xFFFFD4A2)],
  );

  /// Shimmer variation used ONLY for the paywall Pay Now CTA (§6.9). Adds a
  /// bright center stop that the shimmer animation sweeps across.
  static const LinearGradient shimmerPayNow = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: <Color>[
      AppColors.brand400,
      Color(0xFFFF9A2E),
      Color(0xFFFFC66E),
      Color(0xFFFF9A2E),
      AppColors.brand400,
    ],
    stops: <double>[0.0, 0.25, 0.5, 0.75, 1.0],
  );

  /// Home scaffold (TAM-62, node 285:3464 root fill) — cream→white, the same
  /// stop geometry the Horoscope/Books frames use, re-derived from THIS frame's
  /// own handles (0.5,0)→(0.5,0.45787) with `Colors/Brand/100` (#FFF1E2) @0 and
  /// white @0.38462 along that axis, i.e. white by 0.45787 × 0.38462 ≈ 0.1761 of
  /// the frame height. Figma holds the last stop's colour to the bottom.
  static const LinearGradient homeScaffold = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: <Color>[AppColors.brand100, AppColors.white],
    stops: <double>[0.0, 0.1761],
  );

  /// Chat scaffold (TAM-164, nodes 2612:17647 / 2612:17701 / 2612:17716 /
  /// 2612:17749 / 2612:17787 / 2612:17837 — every chat frame's root FRAME
  /// fill). Re-derived from those frames' own handles (0.5,0)→(0.5,0.4578)
  /// with `Colors/Brand/100` (#FFF1E2) @0 and white @0.3846 along that
  /// axis, i.e. white by 0.4578 × 0.3846 ≈ 0.1761 of the frame height.
  /// Same shape as [homeScaffold] but re-declared for provenance (a Figma
  /// variable change lands per-module).
  static const LinearGradient chatScaffold = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: <Color>[AppColors.brand100, AppColors.white],
    stops: <double>[0.0, 0.1761],
  );

  /// Feature shortcut card fill (TAM-62, node 767:6580 fill) — GRADIENT_LINEAR
  /// with handles (0.5,0)→(0.5,1), i.e. a pure top→bottom axis: cream #FEFBF3 at
  /// the top fading into warm amber #FFBD6F at the bottom. Identical on all four
  /// cards (767:6580/6643/6658/6666).
  static const LinearGradient homeShortcutCard = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: <Color>[Color(0xFFFEFBF3), Color(0xFFFFBD6F)],
  );

  /// Feature shortcut card STROKE (TAM-62, node 767:6580 stroke, `opacity: 0.6`)
  /// — a 1px gradient border running bottom-right→top-left per its handles
  /// (1,0.970)→(0,0.047). The node's 0.6 opacity is baked into the stop colours
  /// here (#FC7304 → #964402, each @0.60) because Flutter's `GradientBoxBorder`
  /// equivalent takes no layer opacity.
  static const LinearGradient homeShortcutCardBorder = LinearGradient(
    begin: Alignment.bottomRight,
    end: Alignment.topLeft,
    colors: <Color>[Color(0x99FC7304), Color(0x99964402)],
  );

  /// Audio-preview readability scrim (TAM-62, node 285:3657) — handles run
  /// (0.5,1)→(0.5,0), i.e. BOTTOM→top: the artwork is darkened where the mini
  /// player sits and left fully clear at the top so the deity's face is never
  /// covered (same dignity rule as [wallpaperOverlay]).
  static const LinearGradient homeAudioScrim = LinearGradient(
    begin: Alignment.bottomCenter,
    end: Alignment.topCenter,
    colors: <Color>[
      Color(0x99000000), // #000000 @ 0.60 (bottom)
      Color(0x33000000), // #000000 @ 0.20 (middle)
      Color(0x00000000), // #000000 @ 0.00 (top)
    ],
    stops: <double>[0.0, 0.5, 1.0],
  );

  /// Mini-player v2 bar surface (TAM-N-mini-player-v2, node 1950:20911 fill) —
  /// vertical GRADIENT_LINEAR with handles (0.5,0) → (0.5,1). Stops read from
  /// the node tree because the file's variables endpoint is 403 for our token
  /// (semantic tokens exist but can't be read — figma-flutter Phase-1 fallback).
  ///
  /// Figma also carries a `BACKGROUND_BLUR: 81.5` effect on this node, which
  /// this token INTENTIONALLY OMITS: the bar mounts over a solid bottom-nav
  /// surface (AppShellScaffold.bottomNavigationBar Column) so there is no
  /// bleed-through to blur. Spec-authorized divergence — see the sweep table.
  static const LinearGradient miniPlayerV2 = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: <Color>[
      AppColors.miniPlayerV2GradientTop, // #FEFBF3 (top)
      AppColors.miniPlayerV2GradientBottom, // #FFBD6F (bottom)
    ],
  );
}

class AppSpacing {
  AppSpacing._();

  /// `Space/space-xxx-small` = 4
  static const double xxxSmall = 4;

  /// Interpolated 8 (Figma uses 8s throughout for gaps not explicitly variable-named).
  static const double xSmall = 8;

  /// `Space/space-small` = 12
  static const double small = 12;

  /// 16 — screen edge padding, common gap.
  static const double medium = 16;

  /// 24 — section gaps, top-of-card padding.
  static const double large = 24;

  /// 32 — hero vertical offsets.
  static const double xLarge = 32;
}

class AppRadius {
  AppRadius._();

  /// `Pixels/2px` = 2 — hairline (unused for radii but exposed for consistency).
  static const double pixel2 = 2;

  /// Card / plan / language card / paywall header — general soft rounding.
  static const double card = 16;

  /// Input / small button rounding.
  static const double input = 24;

  /// Pay Now shimmer CTA — pill-ish. Figma frame is 44px tall → 22 radius = full pill.
  static const double payNowCta = 22;

  /// Login card top corners — the bottom sheet-style panel on phone-choice/input/OTP.
  /// Figma uses 20px on the panel (`rounded-tl-[20px] rounded-tr-[20px]` on
  /// node 392:3161 / 397:2820 / 397:2617). Kept as `loginCardTop` since the
  /// paywall card uses a different radius.
  static const double loginCardTop = 20;

  /// Fully-rounded pill (phone number input, plan tabs). Figma: `rounded-[50px]`
  /// on node 397:2826 — 50 exceeds half-height so it clamps to full pill.
  static const double pill = 50;

  /// Outlined button — `rounded-[8px]` on the phone-choice "Continue with Phone
  /// Number" (node 392:3166) and the phone-input Get OTP CTA (node 397:2831).
  static const double button = 8;
}

/// Bottom-nav shell geometry (TAM-58). Extracted from Figma nav `750:6252`:
///   nav container 360×64 → height 64
///   each `Bottom Nav Buttons` 72×64, `Icon` frame 36×36, glyph 20×20
///   label sits below the icon (12/16 medium, `AppText.navLabel`)
class AppNav {
  AppNav._();

  /// Nav bar height (Figma nav container = 64, excludes the gesture bar).
  static const double height = 64;

  /// Glyph size inside each tab (Figma icon instance = 20×20).
  static const double iconSize = 20;

  /// Icon frame around the glyph (Figma `Icon` frame = 36×36).
  static const double iconFrame = 36;

  /// Gap between icon and label.
  static const double iconLabelGap = AppSpacing.xxxSmall;
}

/// Deity-filter row geometry (TAM-58). Extracted from Figma `412:2656`
/// (`Thumbnails` / `Dieties`):
///   row height 80, avatar circle 50×50 (r=37.5 → full circle), label 12/16.
class AppDeityRow {
  AppDeityRow._();

  /// Total row height (Figma `Dieties` instance = 74–86 × 80).
  static const double height = 80;

  /// Circular avatar diameter (Figma `Frame 1000001670` = 50×50).
  static const double avatarSize = 50;

  /// Inner avatar ring on `Ellipse 664` (Figma strokeWeight = 1.5625, CENTER):
  /// grey500 in `state=default`, white in `state=active`.
  static const double avatarInnerBorderWidth = 1.5625;

  /// Active-only outer selection ring on `Frame 1000001670` (Figma
  /// strokeWeight = 3.125, OUTSIDE, `AppGradient.ctaLR` gradient; `visible:false`
  /// in `state=default`).
  static const double avatarActiveRingWidth = 3.125;

  /// Gap between avatar and caption.
  static const double avatarLabelGap = AppSpacing.xxxSmall;

  /// Horizontal gap between deity chips.
  static const double itemGap = AppSpacing.small;

  /// Horizontal padding at the row's leading/trailing edge.
  static const double horizontalPadding = AppSpacing.medium;
}

/// Aarti & Bhajans geometry (TAM-64). Extracted from Figma nodes 412:2656 (main),
/// 420:2909 (listing) and 423:4387/423:4384 (player) — bounding boxes, corner
/// radii, auto-layout gaps and paddings from the REST tree dump.
class AppAarti {
  AppAarti._();

  /// Screen edge padding (Header/Frame pad = 16 on nodes 412:2842, 420:3101).
  static const double screenPadding = AppSpacing.medium; // 16

  /// Vertical gap between a section header row and its content (node 412:2842 gap=12).
  static const double sectionHeaderGap = AppSpacing.small; // 12

  /// Vertical gap between sections.
  static const double sectionGap = AppSpacing.large; // 24

  /// Section header row height (node 412:2843 = 328×28).
  static const double sectionHeaderHeight = 28;

  // Horizontal audio card (node 412:2912) — 100 wide, 100×100 art (r=12), 7px gap.
  static const double hCardWidth = 100;
  static const double hCardArt = 100;
  static const double hCardGap = 19; // row itemSpacing (node 412:2911)
  static const double hCardInnerGap = 7; // art→text gap (node 412:2912)
  static const double cardArtRadius = 12; // nodes 412:2913 / 420:3104

  // Category card (node 412:3001) — 2-col grid, 159×100, r=8, orange fill.
  static const double categoryCardWidth = 159;
  static const double categoryCardHeight = 100;
  static const double categoryCardRadius = 8;
  static const double categoryThumb = 76; // node 412:3002 (78×76)
  static const double gridGap = 10; // 328 − 159×2 = 10

  // Listing 2-col grid card (node 420:3103) — 159 wide, 159×159 art (r=12), 7px gap.
  static const double listCardWidth = 159;
  static const double listCardArt = 159;
  static const double listCardInnerGap = 7;

  // Player (node 423:4387).
  static const double playerCover = 300; // node 425:4842 (r=12)
  static const double playerCoverRadius = 12;
  static const double playerBlockGap = 16; // node 425:4840
  static const double playerSectionGap =
      73; // node 425:4839 (cover-block → controls)

  // Progress bar (node 425:4871) — 4px track, 16px thumb.
  static const double progressTrackHeight = 4;
  static const double progressThumb = 16;

  // Controls (node 423:4384) — 52px centre circle, 44px side tap targets, 24px glyph.
  static const double playCircle = 52;
  static const double controlTap = 44; // ≥44 tap target (§12)
  static const double controlGlyph = 24;
  // Control bar pill (node 425:4876 = 308×81, #3F3F3F): rounded ~full-pill.
  static const double controlBarRadius = 40;
  static const double controlBarPaddingH = AppSpacing.medium;
  // Vertical breathing room inside the pill — the Figma node measures ~14-16px
  // top/bottom, and 8 (xSmall) was cramping the 24px glyphs + 52px play circle
  // against the pill edge.
  static const double controlBarPaddingV = AppSpacing.medium;
  static const double engagementGlyph =
      18; // like/share glyph (nodes 425:4859/4863)
  static const double backArrowFrame = 36; // Leading Icon frame
  static const double backArrowGlyph = 20;
}

/// Mantras & Stutis geometry (TAM-66). Extracted from Figma nodes 425:4944
/// (main), 1066:3358 (listing), 438:3074 (player) and 1054:4130 (counter sheet)
/// — bounding boxes, corner radii and gaps from the REST tree dump. Reuses
/// [AppAarti] where the two modules share a card (horizontal audio card,
/// 2-col grid card, back-arrow) — only the mantras-specific chrome is here.
class AppMantras {
  AppMantras._();

  static const double screenPadding = AppSpacing.medium; // 16

  // Player artwork block (node 438:3076) — 328×150 peach card, r=8, 150×150 art.
  static const double artworkBlockHeight = 150;
  static const double artworkBlockRadius = 8;
  static const double artworkCover = 150; // node 438:3078 (150×150)
  static const double artworkCoverRadius = 8;
  static const double artworkGap = 16; // cover → metadata gap

  // Counter pill (node 457:3419) — 115×40, r=31 (full pill), 0.82px border,
  // 12h/6v pad, icon + "0/N times".
  static const double counterPillHeight = 40;
  static const double counterPillRadius = 31;
  static const double counterPillBorder = 0.82;
  static const double counterPillPaddingH = 12;
  static const double counterPillGap = 6;
  static const double counterPillIcon =
      20; // node 457:3420 (28×28 frame, ~20 glyph)

  // Devanagari mantra text block (node 438:3199) — 16/28 w500, orange.
  static const double mantraTextGap = 24; // block → text gap

  // Next-track card (node 457:3481) — 328×76, r=8, 14h/12v pad, 50×50 thumb,
  // 52px play circle.
  static const double nextCardHeight = 76;
  static const double nextCardRadius = 8;
  static const double nextCardPaddingH = 14;
  static const double nextThumb = 50;
  static const double nextThumbRadius = 8;
  static const double nextCircle = 52;
  static const double nextCircleGlyph = 20;
  static const double nextInnerGap = 12;

  // Controls (node 438:3113) — reuse the Aarti control geometry (52px centre,
  // 44px side taps, 24px glyph) but only prev / play-pause / next are rendered.
  static const double playCircle = AppAarti.playCircle; // 52
  static const double controlTap = AppAarti.controlTap; // 44
  static const double controlGlyph = AppAarti.controlGlyph; // 24
  static const double controlBarRadius = AppAarti.controlBarRadius; // 40
  static const double controlBarPaddingH = AppAarti.controlBarPaddingH;
  static const double controlBarPaddingV = AppAarti.controlBarPaddingV;
  static const double engagementGlyph = 18; // like/share (nodes 438:3189/3193)
  static const double backArrowFrame = AppAarti.backArrowFrame; // 36
  static const double backArrowGlyph = AppAarti.backArrowGlyph; // 20

  // Counter bottom sheet (node 1054:4130) — 328 content, radio rows 328×48,
  // 26px radio, r=16 sheet top.
  static const double sheetRadius = 16;
  static const double sheetPadding = AppSpacing.medium;
  static const double counterRowHeight = 48;
  static const double radioSize = 26;

  // Playlist bottom sheet item (node 1054:4350) — 328×74, 50×50 thumb.
  static const double playlistItemHeight = 74;
  static const double playlistThumb = 50;
  static const double playlistThumbRadius = 8;
  static const double playlistInnerGap = 12;

  // Main-page section/card geometry — shared with Aarti (nodes 425:4951 etc.).
  static const double sectionHeaderHeight = AppAarti.sectionHeaderHeight; // 28
  static const double sectionHeaderGap = AppAarti.sectionHeaderGap; // 12
  static const double sectionGap = AppAarti.sectionGap; // 24
  static const double hCardWidth = AppAarti.hCardWidth; // 100
  static const double hCardArt = AppAarti.hCardArt; // 100
  static const double hCardGap = AppAarti.hCardGap; // 19
  static const double hCardInnerGap = AppAarti.hCardInnerGap; // 7
  static const double cardArtRadius = AppAarti.cardArtRadius; // 12
  static const double categoryCardHeight = AppAarti.categoryCardHeight; // 100
  static const double categoryCardRadius = AppAarti.categoryCardRadius; // 8
  static const double gridGap = AppAarti.gridGap; // 10
  static const double listCardInnerGap = AppAarti.listCardInnerGap; // 7
}

/// Ringtone module geometry (TAM-68) — bounding boxes from the Figma frames
/// 670:4481 (Home), 1073:3472 (Search), 683:4775 (Preview) via the REST tree
/// dump (scratch/rt-*.json). Not eyeballed.
class AppRingtone {
  AppRingtone._();

  static const double screenPadding =
      AppSpacing.medium; // 16 (328 content in 360)

  // Search field (node 670:4608) — pill input, r=9999, 1px stroke, 53 tall.
  static const double searchHeight = 48;
  static const double searchRadius = 9999;
  static const double searchBorder = 1;
  static const double searchIcon = 17; // node 670:4613 (17×17)
  static const double searchInnerGap = AppSpacing.small; // icon → text

  // Nav (node 683:4816 "Basic Nav") — 36px back-arrow frame, 20px glyph.
  static const double backArrowFrame = AppMantras.backArrowFrame; // 36
  static const double backArrowGlyph = AppMantras.backArrowGlyph; // 20
  static const double navHeight = AppNav.height;

  // Card (node 676:4711) — 103×179, r=8, 1px orange border, 103×103 thumbnail,
  // 52px centre play overlay, title 14/20, 12×12 count icons, 12/16 counts.
  static const double cardWidth = 103;
  static const double cardRadius = 8;
  static const double cardBorder = 1;
  static const double cardThumb = 103; // square thumbnail (node 676:4694)
  static const double cardPlayOverlay = 52; // ellipse (node 676:4764)
  static const double cardPlayGlyph = 24; // play frame (node 676:4767)
  static const double cardInnerPadding = 6; // container inset for title/counts
  static const double cardTitleGap = 4; // thumbnail → title
  // Two lines of `labelMd` (14/20) = 40. Reserved so single-line and two-line
  // titles occupy the same footprint → the counts row anchors to the same y
  // across every card in the grid.
  static const double cardTitleReservedHeight = 40;
  static const double cardCountIcon =
      12; // headphones/ringtone (nodes 683:4688/4557)
  static const double cardCountGap = 4; // icon → number
  static const double cardCountDividerWidth =
      1; // vertical divider (node 676:4704)
  static const double cardCountDividerHeight = 12;
  static const double gridGap = 10; // 3-col grid spacing
  static const int gridColumns = 3;

  // Preview (node 683:4775) — 300×300 hero (r=12), title 24/32, set-count row,
  // 3 metric buttons, 52px play/pause circle, 328×44 Set-Ringtone CTA (r=8).
  static const double previewHeroSize = 300;
  static const double previewHeroRadius = 12;
  static const double previewBlockGap = AppSpacing.large; // 24
  static const double previewTitleGap = AppSpacing.small; // title → set-count
  static const double previewMetricIcon =
      18; // like/play/share (nodes 683:4797 etc.)
  static const double previewMetricGap = AppSpacing.xSmall;
  static const double previewSetCountIcon = 18; // node 683:4898
  static const double playCircle = 52; // node 683:4282 (52×52)
  static const double playGlyph = 24; // node 683:4286
  static const double setCtaHeight = 48; // node 683:4904 (44+pad)
  static const double setCtaRadius = 8;
  static const double setCtaIcon = 20; // node 683:4916
  static const double setCtaGap = AppSpacing.xSmall;
}

/// Wallpaper module geometry (TAM-70) — bounding boxes from the Figma frames
/// 704:5223 (Home), 707:6427 (Listing), 282:2812 (Static preview), 712:6622
/// (Live preview) via the REST tree dump (scratch/wp-*.json). Not eyeballed.
class AppWallpaper {
  AppWallpaper._();

  static const double screenPadding = AppSpacing.medium; // 16

  // Basic Nav (node 704:5786) — 64 tall, 36px back-arrow frame, 20px glyph.
  static const double navHeight = AppNav.height; // 64
  static const double backArrowFrame = 36;
  static const double backArrowGlyph = 20;

  // Home CMS row (node 707:6137 = 360×270) — header metadata row (28) + card
  // strip (198). Cards 111×198, r=8 (node 707:6173), ~12px gap (Container 605
  // holds 5×111).
  static const double rowHeaderHeight = 28; // node 707:6138
  static const double rowHeaderIcon =
      16; // node 707:6140 (fi_1687795, Top Live only)
  static const double rowHeaderGap = AppSpacing.small; // 12 (header → cards)
  static const double rowCardStripHeight = 198; // node 707:6171
  static const double homeCardWidth = 111; // node 707:6173
  static const double homeCardHeight = 198;
  static const double homeCardRadius = 8; // node 707:6173 cornerRadius
  static const double homeCardGap = AppSpacing.small; // 12
  static const double sectionGap = AppSpacing.medium; // 16 (row → row)

  // Listing 2-col grid (node 707:6451) — cards 159×284, image 157×282, r≈7.4→8,
  // grid pad ~15→16, ~14px gap.
  static const int listColumns = 2;
  static const double listCardWidth = 159; // node 707:6452
  static const double listCardHeight = 284;
  static const double listCardRadius = 8; // node 707:6452 (7.38 → 8)
  static const double listGridGap = 14; // (360 − 2×159 − 2×16)/1
  static const double listCardAspectRatio = 159 / 284;

  // LIVE badge (node 712:6808 = 45×18) — translucent white pill, r=2, 6h/2v pad,
  // 3.7px glyph→text gap, 10px glyph, 8px "LIVE" text. Inset from the card edge.
  static const double liveBadgeRadius =
      4; // node 712:6808 (2, softened for stroke)
  static const double liveBadgePaddingH = 6;
  static const double liveBadgePaddingV = 2;
  static const double liveBadgeGap = 4; // node 712:6808 itemSpacing (3.69)
  static const double liveBadgeGlyph = 10; // node I712:6808;712:6716
  static const double liveBadgeInset = AppSpacing.xSmall; // 8

  // Preview immersive image + chrome (nodes 282:2812 / 712:6622).
  static const double previewNavHeight = 64; // node 282:2819
  static const double previewFooterPaddingH = AppSpacing.large; // 24
  static const double previewFooterPaddingBottom = 40; // node 282:2816 (48)
  static const double previewFooterGap =
      AppSpacing.small; // 12 (set-count → buttons)
  static const double setBtnHeight = 44; // node 282:2818 (36 + tap padding)
  static const double setBtnRadius = 8; // node 282:2818 cornerRadius
  static const double setBtnGap =
      AppSpacing.small; // 12 (between the two buttons)
  static const double setBtnPaddingH = AppSpacing.small; // 12

  // Right engagement rail (node 282:2832 = 56×133) — buttons stacked, 24px gap,
  // like glyph 24×22, whatsapp glyph 24×24, dark scrim behind glyph, count 12/16.
  static const double railGap =
      AppSpacing.large; // 24 (node 282:2832 itemSpacing)
  static const double railIconSize = 24; // nodes 282:2835/2843
  static const double railScrim = 40; // node 282:2834 backing frame
  static const double railScrimRadius = 12;
  static const double railCountGap = AppSpacing.xxxSmall; // 4 (icon → count)
  static const double railInset = AppSpacing.medium; // 16 from screen edge
}

/// Status module geometry (TAM-72), from the Figma bounding boxes of
/// `302:4384` (Status Home), `371:2185` (Personal), `371:3567` (Business).
///
/// NOTE on the odd fractional numbers: the `Status-swipe` instance (330:6125) is
/// placed at a **0.8193386 scale** inside the 360-wide Home frame, so the card's
/// rendered metrics are the master's × 0.8193 (e.g. the 16/24 name style renders
/// at 13.11/19.66). The values below are the RENDERED numbers — what the design
/// actually shows — not the unscaled master's.
class AppStatus {
  AppStatus._();

  static const double screenPadding =
      AppSpacing.medium; // 16 (Frame 1000002470 = 328 of 360)

  // Header "Basic Nav" (node 302:4928) — 64 tall, 16 left / 8 right padding.
  static const double headerHeight = 64;
  static const double headerPaddingLeft = AppSpacing.medium; // 16
  static const double headerPaddingRight = AppSpacing.xSmall; // 8

  // Edit Details pill (node I302:4928;5186:10469) — 119×36, r999, 12h/8v pad.
  static const double editPillHeight = 36;
  static const double editPillRadius = 999;
  static const double editPillPaddingH = AppSpacing.small; // 12
  static const double editPillGap = 2; // itemSpacing between pencil + label
  static const double editPillGlyph = 16; // node I302:4928;5186:10469;5183:8514
  static const double editPillBorder = 1;

  // Deity row block (node 307:1405) — 80 tall + 10 gap down to the feed.
  static const double deityRowHeight = AppDeityRow.height; // 80
  static const double deityRowToFeedGap = 10; // 19755 − 19745

  // Status card (node 330:6125 / I330:6125;322:1721) — 294.96×505.88, inset 32.8
  // from the frame's left edge (≈ centred in the 360 frame).
  static const double cardWidth = 294.96;
  static const double cardHeight = 505.88;
  static const double cardInset = 32.8;
  static const double cardBorder = 0.82; // #FCDBD3
  static const double cardRadius = 0; // the Figma card is square-cornered

  // Actions & Engagement block (node I330:6125;322:1722) — 57.19 tall.
  static const double actionsHeight = 57.19;
  static const double actionsPaddingH = 6.03;
  static const double actionsPaddingV = 10.06;

  // Engagement footer (node I330:6125;322:1723) — 282.89×37.08, SPACE_BETWEEN.
  static const double footerHeight = 37.08;

  // Share CTA (node I330:6125;322:1724) — 86.23×37.08, r8.04, ctaLR gradient.
  static const double shareBtnHeight = 37.08;
  static const double shareBtnRadius = 8.04;
  static const double shareBtnPaddingH = 12.06;
  static const double shareBtnGap =
      8.04; // node I330:6125;322:1724;5178:7450 itemSpacing
  static const double shareBtnGlyph = 16; // node I330:6125;322:1724;5178:7451
  /// Guaranteed minimum width for the Share pill. Prevents the pill from
  /// shrinking below its intrinsic content (icon + "Share") on 411dp screens
  /// where a Row layout quirk was ellipsizing the label to "S…".
  static const double shareBtnMinWidth = 90;

  // Like / view clusters (nodes I330:6125;322:1725 / 1729) — 14px glyph + 3.28 gap.
  static const double countGlyph = 14;
  static const double countGap = 3.28;

  // Next pill (node I330:6125;322:1740) — 46.1×29.06, r8.04, 10.05h/6.03v pad.
  static const double nextBtnHeight = 29.06;
  static const double nextBtnRadius = 8.04;
  static const double nextBtnPaddingH = 10.05;
  static const double nextBtnBorder = 1.005;

  // Hero preview (node I330:6125;322:1741) — 294.96×448.69 (≈9:16 media box).
  static const double heroHeight = 448.69;

  // Overlay template band (node I330:6125;322:1743) — 294.96×63.83 pinned to the
  // media's bottom edge, top corners r9.83, 9.83h/4.92v padding.
  //
  // 63.83 / 448.69 = 0.1423 — i.e. the band height IS the seeded
  // `overlaySafeArea.bottom` (0.14). The band is therefore laid out from the
  // item's LIVE safe-area fractions (TAM-71 contract), and these constants are
  // the Figma fallback/минimum when a card ships a zeroed safe area.
  static const double overlayBandHeight = 63.83;
  static const double overlayBandRadius = 9.83;
  static const double overlayPaddingH = 9.83;
  static const double overlayPaddingV = 4.92;
  static const double overlayBorder = 0.82;
  static const double overlayTextInset =
      77.02; // node I330:6125;322:1747 paddingLeft (clears the avatar)
  static const double overlayNameSize =
      13.11; // 16 × 0.8193 (node I330:6125;322:1749)
  static const double overlayNameHeight = 19.66;
  static const double overlayDetailSize =
      11.47; // 14 × 0.8193 (nodes I330:6125;322:1758/1765)
  static const double overlayDetailHeight = 16.39;

  // Overlay avatar (node I330:6125;322:1768) — 67.19 circle overlapping ABOVE the
  // band by 18.84 (band y 20196.78 − avatar y 20177.93), 9.83 in from the left.
  static const double overlayAvatarSize = 67.19;
  static const double overlayAvatarInner = 60.19; // node I330:6125;322:1770
  static const double overlayAvatarRing = 0.7;
  static const double overlayAvatarGlyph = 33; // node I330:6125;322:1771
  static const double overlayAvatarRise = 18.84;
  static const double overlayAvatarInset = 9.83;
  static const double overlayBadgeSize = 19.6; // node I330:6125;322:1772
  static const double overlayBadgeGlyph = 11; // node I330:6125;322:1773

  // ---- Details screens (371:2185 / 371:3567) -------------------------------

  // Basic Nav (node 371:2371) — 64 tall; 44 back frame with a 20 glyph.
  static const double detailsNavHeight = 64;
  static const double backArrowFrame = 44;
  static const double backArrowGlyph = 20;

  // Tab group (node 371:3531) — 360×48; two 180 tabs; 3px active underline over
  // a 1px group hairline.
  static const double tabHeight = 48;
  static const double tabActiveUnderline = 3; // individualStrokeWeights.bottom
  static const double tabGroupLine = 1;

  // Content block (nodes 371:3443 / 371:3571) — 328 wide, 16 below the tabs,
  // 32 above the Save CTA; 24 between stacked fields.
  static const double contentWidth = 328;
  static const double tabsToContentGap =
      AppSpacing.medium; // 16 (19729 − 19713)
  static const double contentToSaveGap =
      AppSpacing.xLarge; // 32 (19977 − 19945)
  static const double fieldGap = AppSpacing.large; // 24 (node 371:3718)
  static const double sectionLabelGap = AppSpacing.medium; // 16 (node 371:3670)

  // Field (nodes 371:3448 focused / 371:3713 default) — 328×56, r50, floating
  // label straddling the top border 20 in from the left.
  static const double fieldHeight = 56;
  static const double fieldRadius = 50;
  static const double fieldBorder = 1; // default (#EAEBEE)
  static const double fieldBorderFocused = 1.5; // focused (#FE8A02)
  static const double fieldPaddingH = 20; // label x −20679 vs field x −20699
  static const double fieldLabelSize = 12;
  static const double fieldTextSize = 16;

  // Avatar picker (node 371:3556) — 128 circle + a 44 camera badge (20 glyph).
  static const double pickerSize = 128;
  static const double pickerInner = 114.7; // node I371:3556;371:3539
  static const double pickerRing = 1.33;
  static const double pickerGlyph = 64; // node I371:3556;371:3540
  static const double pickerBadge = 44; // node 371:3549
  static const double pickerBadgeBorder = 2;
  static const double pickerBadgeGlyph = 20; // node I371:3556;371:3550
  static const double pickerToFieldGap =
      AppSpacing.xLarge; // 32 (216 − 128 − 56)

  // Save CTA (nodes 371:3724 / 371:3738) — 328×44, r8, ctaLR gradient.
  static const double saveBtnHeight = 44;
  static const double saveBtnRadius = 8;
}

/// Report sheet geometry (TAM-N), read off Figma `4118:16914` (Report User,
/// empty) and its three siblings. All four frames are 360 wide with the sheet
/// body inset 16 each side, so every width below is 328.
class AppStatusReport {
  AppStatusReport._();

  /// 16 each side of a 360 frame.
  static const double sheetPadding = AppSpacing.medium;

  /// Drag handle — 32×4, centred, 16 from the sheet top.
  static const double handleWidth = 32;
  static const double handleHeight = 4;
  static const double handleTopGap = AppSpacing.medium; // 16

  /// The 48×48 report glyph, centred.
  static const double iconSize = 48;

  /// Vertical rhythm, top → bottom (Figma deltas, not eyeballed).
  static const double handleToIcon = AppSpacing.medium; // 16
  static const double iconToTitle = AppSpacing.small; // 12
  static const double titleToSubtitle = AppSpacing.small; // 12
  static const double subtitleToField = AppSpacing.xLarge; // 32
  static const double fieldToField = AppSpacing.xLarge; // 32
  static const double fieldToCta = AppSpacing.xLarge; // 32
  static const double ctaToFooter = AppSpacing.xSmall; // 8

  /// Email field — 328×56, pill.
  static const double emailFieldHeight = 56;
  static const double emailFieldRadius = 50;

  /// Reason field — 328×112, rounded rect (NOT a pill).
  static const double reasonFieldHeight = 112;
  static const double reasonFieldRadius = AppRadius.card; // 16

  static const double fieldBorder = 1;
  static const double fieldBorderFocused = 1.5;
  static const double fieldPaddingH = 20; // label inset from the left edge
  static const double fieldTextPaddingH = 24; // typed value inset
  static const double fieldLabelSize = 12;
  static const double fieldTextSize = 16;

  /// Report CTA — 328×48, full pill.
  static const double ctaHeight = 48;
  static const double ctaRadius = 24;

  /// Hard cap on the reason, mirroring the server's Zod `max(1000)`.
  static const int reasonMaxLength = 1000;
}

/// Horoscope module geometry (TAM-74), from the Figma bounding boxes of
/// `371:3796` (Main) and `387:2571` (Result — the canonical result frame).
/// Every offset below is frame-relative (the frames sit at absolute
/// x=-18657/-17747 in the section; the dumps subtract the frame origin).
class AppHoroscope {
  AppHoroscope._();

  static const double screenPadding =
      AppSpacing.medium; // 16 (grid frame 375:2270 paddingLeft)

  // ---- Main (371:3796) ------------------------------------------------------

  // Basic Nav (node 371:3798) — 64 tall, 16 left pad, title vertically centred.
  // Its Avatar + all three trailing icons are `visible:false`: the Horoscope
  // main header is title-ONLY (no back arrow, no actions).
  static const double navHeight = AppNav.height; // 64
  static const double navPaddingLeft = AppSpacing.medium; // 16

  // Date block (node 379:2576) — 328×36 at y=124; the text (379:2578) is 20/28.
  static const double dateBlockHeight = 36;
  static const double dateBlockTop = 8; // 124 − (52 + 64) nav bottom
  static const double dateToGridGap =
      3; // grid frame y=163 − date block bottom (160)

  // Zodiac grid (node 375:2270) — layoutMode GRID, 3 columns, gridRowGap 10,
  // gridColumnGap 10, padding 16. Cards are square (103×103).
  static const int gridColumns = 3; // node 375:2270 gridColumnCount
  static const double gridColumnGap = 10; // node 375:2270 gridColumnGap
  static const double gridRowGap = 10; // node 375:2270 gridRowGap
  static const double gridPaddingTop =
      AppSpacing.medium; // 16 (cards start y=179, frame y=163)

  // Zodiac card (node 379:2333) — 103×103, r8, #B8B8B8 w1 hairline, NO fill
  // (the frame's cream fill is `visible:false`). Icon 42 at +12 from the top,
  // horizontally centred ((103−42)/2 = 30.5); label band 103×24 at +67.
  //
  // 3×103 + 2×10 = 329 vs the 328 available (360 − 2×16) — the Figma grid
  // overflows its own frame by 1px, so the cards flex to (328−20)/3 = 102.67
  // and `cardAspectRatio` keeps them square.
  static const double cardSize = 103;
  static const double cardRadius = 8;
  static const double cardBorder = 1;
  static const double cardAspectRatio = 1; // 103×103
  static const double cardIconSize = 42; // node I379:2333;379:2410
  static const double cardIconTop = 12; // node 379:2333 paddingTop
  static const double cardLabelTop = 67; // 246 − 179 (node I379:2333;379:2331)
  static const double cardLabelHeight = 24;

  // ---- Result (387:2571) ----------------------------------------------------

  // Background: the video/still is 450×800 at x=−45 — i.e. full-bleed COVER on
  // the 360 frame, not letterboxed. The scrim (387:2573) is flat #000000 @0.50
  // across the whole screen.
  static const double resultNavHeight = 64; // node 1173:4536, y=52
  static const double backArrowFrame = 44; // node I1173:4536;5186:10373
  static const double backArrowGlyph = 20; // r8 frame, 12 pad → 20 glyph
  static const double navPaddingLeftResult = 8; // back frame x=8
  static const double ttsFrame = 44; // node I1173:4536;5186:10379 (x=308)
  static const double ttsGlyph = 20;

  // Zodiac header (node 387:2610) — 360×74 at y=116, itemSpacing 10:
  // pill (32) + 10 + date row (32) = 74.
  static const double headerTop = 116; // 52 status + 64 nav
  static const double headerHeight = 74;
  static const double headerGap = 10; // node 387:2610 itemSpacing

  // Zodiac pill (node 387:2611) — 122×32, r36, 16h pad, 2 gap; icon 32 + text.
  // Its 2px stroke is `visible:false` — the pill renders BORDERLESS.
  static const double pillHeight = 32;
  static const double pillRadius = 36;
  static const double pillPaddingH = AppSpacing.medium; // 16
  static const double pillGap = 2; // node 387:2611 itemSpacing
  static const double pillIcon = 32; // node 387:2612

  // Date row (node 387:2614) — 328×32; the inner box (387:2615) is 101×32 r8,
  // centred, with NO visible fill (text-only).
  static const double dateRowHeight = 32;

  // Vertical rhythm below the header (all frame-relative; subtract the 52px
  // status bar for safe-area coords). The design's column adds up exactly:
  //   64 nav + 74 header + 32 + 482 art + 24 + 37 CTA + 35 = 748 = 800 − 52.
  static const double headerToCardGap = AppSpacing.xLarge; // 32 (222 − 190)
  static const double cardToCtaGap = AppSpacing.large; // 24 (728 − 704)

  // Decorative card art (node 1162:4407) — 361×482 at y=222, full-bleed. The
  // step body text is 262 wide, centred, and vertically centred on the art
  // (415..511 for a 96-tall block ⇒ centre 463 = 222 + 241).
  static const double cardArtTop = 222;
  static const double cardArtWidth = 361;
  static const double cardArtHeight = 482;
  static const double cardTextWidth = 262; // node 1162:4436

  // Step title pill (node 1162:4437) — 40 tall, r8, #000000 @0.50, 12h/8v pad,
  // centred horizontally and sitting ON the card art's top border (same y=222,
  // so its centre ≈ the drawn border at y≈240).
  static const double stepPillHeight = 40;
  static const double stepPillRadius = 8;
  static const double stepPillPaddingH = AppSpacing.small; // 12
  static const double stepPillPaddingV = AppSpacing.xSmall; // 8

  // Next / Finish (node 1162:4461) — hugs its label (55 for "Next", 62 for
  // "Finish"), 37 tall, r8.04, white fill + #B8B8B8 w1.005 hairline, 12h/8v pad.
  static const double nextBtnHeight = 37;
  static const double nextBtnRadius = 8.04;
  static const double nextBtnBorder = 1.005;
  static const double nextBtnPaddingH = AppSpacing.small; // 12
  static const double nextBtnBottom = 35; // 800 − (728 + 37)
}

/// Books & Scriptures geometry (TAM-76). Every number is read from the REST tree
/// dumps (`tools/figma-export.ts tree`) of the coverage-set frames — never
/// eyeballed. Full provenance table: `lib/features/books/TOKENS.md`.
class AppBooks {
  AppBooks._();

  /// Screen edge padding — every Books section frame uses 16 (node 534:5063).
  static const double screenPadding = AppSpacing.medium; // 16

  // ---- Book card (component set 562:5675) -----------------------------------
  //
  // The set's three variants are ONE design scaled by width/120:
  //   Book    120 wide → cover 120×176, r9,      gap 14,    title 12/16
  //   Book-lg 159 wide → cover 159×233, r11.925, gap 18.55, title 15.9/21.2
  //   sm      100 wide → cover 100×147, r7.5,    gap 11.67, title 10/13.3
  // so the card widget derives everything from `width` via these base ratios
  // (verified against all three variants to <0.5px).

  /// `Property 1=Book` base width — the ratio denominator (node 534:5504).
  static const double cardBaseWidth = 120;

  /// Carousel + contents-hero card width (node 534:5505).
  static const double cardWidth = 120;

  /// 2-column listing card width (node 562:5676).
  static const double cardWidthLg = 159;

  /// Drawer-header card width (node 637:4420).
  static const double cardWidthSm = 100;

  static const double cardCoverRatio = 176 / 120; // 1.4667
  static const double cardRadiusRatio = 9 / 120; // 0.075
  static const double cardGapRatio = 14 / 120; // 0.11667
  static const double cardTitleSizeRatio = 12 / 120; // 0.1
  static const double cardTitleLineRatio = 16 / 120; // 0.13333

  /// Cover drop shadow (node I534:5505;534:5223 effect) at the 120 base:
  /// #000000 @0.10, offset (−9, 7.5), blur 16.5. Scaled by width/120.
  static const double cardShadowDxRatio = -9 / 120;
  static const double cardShadowDyRatio = 7.5 / 120;
  static const double cardShadowBlurRatio = 16.5 / 120;

  // ---- Books Home (534:5061) ------------------------------------------------

  /// Section frame padding (node 534:5063) — 16 on every edge.
  static const double sectionPadding = AppSpacing.medium; // 16

  /// Section header row → content gap (node 534:5063 itemSpacing).
  static const double sectionHeaderGap = AppSpacing.small; // 12

  /// Section header row height (node 534:5064).
  static const double sectionHeaderHeight = 28;

  /// Horizontal carousel item gap (node 534:5475 itemSpacing).
  static const double carouselGap = 10;

  /// Carousel row height (node 534:5471) — card 206 + the frame's own slack.
  static const double carouselHeight = 206;

  /// Browse-Categories grid (node 534:5111, layoutMode GRID): 2 columns,
  /// 10/10 gaps, cards 159×100 r8.
  static const int categoryColumns = 2;
  static const double categoryGap = 10; // node 534:5111 grid row/column gap
  static const double categoryCardWidth = 159; // node 534:5112
  static const double categoryCardHeight = 100;
  static const double categoryCardRadius = 8;

  /// Category label inset (node 534:5115 at +10,+10 inside the card).
  static const double categoryLabelInset = 10;

  /// Category artwork (nodes 534:5114/5118/5122/5126) — identical placement for
  /// all four cards.
  ///
  /// The image is rotated 15° in Figma and BLEEDS off the card, which clips it
  /// (`clipsContent: true`): its AABB runs to right=188.5 / bottom=108.8 on a
  /// 159×100 card. Two traps here, both caught by the Phase-6 crop sweep:
  ///  * `absoluteRenderBounds` (70.1×89.8) is the CLIPPED region, not the art —
  ///    sizing the export to it shrinks the artwork and re-inserts the very
  ///    margin the design deletes;
  ///  * `/v1/images` exports the node UNCLIPPED, at its own ink extent
  ///    (98.5×97.5 logical), which is what these numbers must describe.
  /// So: place the export at its ink origin, at its natural size, and let the
  /// card's `ClipRRect` cut the overflow — exactly as Figma composites it.
  static const double categoryArtLeft = 88.88;
  static const double categoryArtTop = 10.17;
  static const double categoryArtWidth = 98.5;
  static const double categoryArtHeight = 97.5;

  // ---- Listing (562:5565) ---------------------------------------------------

  /// 2-column grid (node 562:5566, layoutMode GRID) — 16 padding, 10/10 gaps.
  static const int listColumns = 2;
  static const double listGap =
      10; // 26227 − 25943 − 274 (row) = 169 − 159 (col)

  /// Listing card total height (node 562:5676) — cover 233 + 18.55 + title 22.
  static const double listCardHeight = 274;

  // ---- Contents (639:3947) --------------------------------------------------

  /// Hero book card top, frame-relative (node 639:4019 y=24751 − 24652).
  /// NOTE: this is 99 — ABOVE the nav's bottom edge (116) — so the cover
  /// deliberately overlaps the nav bar and must paint after it in the Stack.
  static const double contentsCardTop = 99;

  /// Start Reading button (node 639:4105) — 95×29, r8.04, centred, y=320.
  static const double contentsCtaTop = 320; // 24972 − 24652
  static const double contentsCtaHeight = 29;
  static const double contentsCtaPaddingH = 10.05; // node 639:4105 paddingLeft
  static const double contentsCtaPaddingV = 6.03;

  /// Chapters panel (node 639:4029) — full-bleed white, starts at y=393.
  static const double contentsPanelTop = 393; // 25045 − 24652

  /// Kanda/chapter row (node 639:4045) — 360×48, 20h/16v padding.
  static const double contentsRowHeight = 48;
  static const double contentsRowPaddingH = 20;
  static const double contentsRowPaddingV = AppSpacing.medium; // 16

  // ---- Reader (620:3904 / 647:4133) -----------------------------------------

  /// Reader column (node 620:4077): 16 h-padding, 32 top, 10 bottom, gap 22.
  static const double readerPaddingH = AppSpacing.medium; // 16
  static const double readerPaddingTop = AppSpacing.xLarge; // 32
  static const double readerPaddingBottom = 10;
  static const double readerBlockGap = 22; // node 620:4077 itemSpacing

  /// Gradient CTA (Listen / Previous / Next / Start Reading) — node 315:2813:
  /// r8.04, 12.06 h-pad, 8.04 v-pad, 37 tall, icon 16, icon→label gap 8.04.
  static const double buttonHeight = 37;
  static const double buttonRadius = 8.04;
  static const double buttonPaddingH = 12.06;
  static const double buttonPaddingV = 8.04;
  static const double buttonGlyph = 16;
  static const double buttonGap = 8.04;

  /// Reader nav (node 620:3917) — back 36 frame / 20 glyph; the two trailing
  /// action frames are 44 with a 20 glyph (≥44 tap target, §12).
  static const double navHeight = AppNav.height; // 64
  static const double navPaddingH = AppSpacing.xSmall; // 8
  static const double navLeadingFrame = 36;
  static const double navGlyph = 20;
  static const double navActionFrame = 44;

  /// Body line-height ratio (node 620:4076: 16/28) — preserved as the reader
  /// font size scales, so the Devanagari body keeps its designed rhythm.
  static const double readerBodyLineRatio = 28 / 16; // 1.75

  // ---- Chapters drawer (637:4191) -------------------------------------------

  /// Panel (node 637:4366) — 280 wide, right-aligned, full content height.
  static const double drawerWidth = 280;

  /// Header (node 637:4417) — 280×179, 16 padding, card + 8-inset details.
  static const double drawerHeaderHeight = 179;
  static const double drawerHeaderPadding = AppSpacing.medium; // 16
  static const double drawerDetailsInset =
      AppSpacing.xSmall; // 8 (node 637:4421 paddingLeft)
  static const double drawerDetailsTop =
      AppSpacing.xSmall; // 8 (node 637:4422 paddingTop)

  /// Header texture (node 637:4418) — OVERLAY @0.30 over the header gradient.
  static const double drawerTextureOpacity = 0.30;

  /// Chapter row (node 637:4371) — 280×47/48, 20h/16v padding.
  static const double drawerRowHeight = 48;
  static const double drawerRowPaddingH = 20;
  static const double drawerRowPaddingV = AppSpacing.medium; // 16

  // ---- Font-size overlay (637:4463) -----------------------------------------

  /// Panel (node 620:3844) — full width, 64 tall, bottom corners r16, drops
  /// straight below the nav.
  static const double fontPanelHeight = 64;
  static const double fontPanelRadius =
      AppRadius.card; // 16 (rectangleCornerRadii [0,0,16,16])
  static const double fontPanelPaddingH = 20; // node 620:3854
  static const double fontPanelPaddingV = AppSpacing.medium; // 16
  static const double fontPanelGap =
      AppSpacing.medium; // 16 (node 620:3854 itemSpacing)
  static const double fontIconSize = 24; // node 634:4097
  static const double fontTrackHeight = 4; // node 620:3859
  static const double fontTrackRadius = 2;
  static const double fontThumbSize = 24; // node 620:3860
  static const double fontValueBoxWidth = 51; // node 620:3861
  static const double fontValueBoxHeight = 32;
  static const double fontValueBoxRadius = 4;
  static const double fontValueBoxBorder =
      2; // node 620:3861 strokeWeight (NOT 1)
  static const double fontTrackWidth = 212; // node 620:3859
  static const double fontThumbBorder = 1; // node 620:3860 strokeWeight
  static const double fontThumbShadowBlur = 4; // node 620:3860 effect radius
  static const double fontThumbShadowDy = 2; // node 620:3860 effect offset.y
  static const double fontPanelShadowBlur = 30; // node 620:3844 effect radius
  static const double fontPanelShadowDy = 8; // node 620:3844 effect offset.y

  /// Reader body font-size range.
  ///
  /// #PLAN_UNCERTAINTY: Figma pins only ONE state of this slider — "18px" with
  /// the fill at 68/212 = 32.1% of the track (nodes 620:3862 / 621:4081). A
  /// 14–26 range puts 18px at 33.3%, i.e. within 1.7px of the mock's thumb on a
  /// 212px track — the closest fit of any round pair (12–24 ⇒ 50%, 16–28 ⇒
  /// 16.7%, 14–28 ⇒ 28.6%), so it is adopted and logged in the sweep table.
  /// [readerFontDefault] is NOT a guess: it is the size the design's own reader
  /// body renders at (node 620:4076 = 16/28).
  static const double readerFontMin = 14;
  static const double readerFontMax = 26;
  static const double readerFontDefault = 16; // node 620:4076
  static const int readerFontDivisions = 12; // 1px steps across 14..26
}

/// Home geometry (TAM-62). Every number is a bounding box / padding / itemSpacing
/// read from the `285:3464` REST tree dump — see `features/home/TOKENS.md` for
/// the node ↔ token table.
class AppHome {
  AppHome._();

  /// Frame-wide edge padding (nodes 285:3482 / 285:3506 / 285:3508 all pad 16).
  static const double screenPadding = AppSpacing.medium; // 16

  // --- Header (285:3482) -----------------------------------------------------
  // The Figma frame is 108 tall = 12 pad + 40 row + 12 gap + 32 search + 12 pad.
  // Search (285:3499) is OUT of Phase 1 (PRD §6), so the rendered header is
  // 12 + 40 + 12 = 64.
  static const double headerHeight = 64;
  static const double headerPaddingV = AppSpacing.small; // 12
  static const double headerRowHeight = 40; // node 285:3483
  static const double logoSize = 36; // node 285:3485
  static const double logoRingWidth = 0.5; // node 285:3485 stroke
  static const double logoWordmarkGap =
      AppSpacing.xSmall; // 8 (node 285:3484 itemSpacing)
  static const double wordmarkSize = 24; // node 285:3493
  static const double helpGlyph = 20; // node 285:3495
  static const double headerTrailingGap = 15.99; // node 285:3494 itemSpacing
  static const double avatarSize = 40; // node 285:3497
  static const double avatarInitialSize = 16; // node 285:3498

  // --- Banner carousel (285:3506 / 285:3507) ---------------------------------
  static const double bannerBlockPaddingTop = AppSpacing.small; // 12
  static const double bannerBlockPaddingBottom = AppSpacing.medium; // 16
  static const double bannerWidth = 328; // node 285:3507
  static const double bannerHeight = 170;
  static const double bannerRadius = AppRadius.button; // 8
  static const double bannerDotSize = 8; // node I285:3507;224:1358
  static const double bannerDotGap =
      AppSpacing.xxxSmall; // 4 (node I285:3507;224:1357 itemSpacing)
  static const double bannerDotRadius = 12;
  // The dots are pinned to the banner's bottom-RIGHT corner, not centred: node
  // I285:3507;224:1357 spans x=−22645..−22613 / y=19622..19630 inside a banner
  // (285:3507) spanning x=−22925..−22597 / y=19496..19646 ⇒ right inset 16,
  // bottom inset 16 (left inset 280, so centring is off by 132px). Confirmed by
  // the frame render `figma-refs/banner-carousel.png`.
  static const double bannerDotsRightInset = AppSpacing.medium; // 16
  static const double bannerDotsBottomInset = AppSpacing.medium; // 16

  // --- Feature shortcut grid (285:3508 / 300:4338) ---------------------------
  static const double shortcutGridPaddingBottom =
      AppSpacing.xSmall; // 8 (node 285:3508)
  // TAM-132: bumped 2 → 3 columns per Figma frame 2569:15302 (6-tile system).
  // The 328 dp inner width now divides into three 103 dp cards separated by two
  // 10 dp gaps (328 = 103·3 + 10·2 − 5 rounding on device-pixel alignment).
  static const int shortcutColumns = 3;
  static const double shortcutGap = 10; // unchanged (2569:15302 same 10 dp gap)
  // TAM-132: cardWidth 159 → 103 (Figma 2569:15302 inner tile).
  static const double shortcutCardWidth = 103;
  static const double shortcutCardHeight = 117;
  static const double shortcutCardRadius = AppRadius.button; // 8
  static const double shortcutCardBorder = 1;
  static const double shortcutCardPadding = 10; // node 767:6580 padding*
  static const double shortcutCardGap =
      AppSpacing.small; // 12 (node 767:6580 itemSpacing)
  static const double shortcutLabelSize = 18; // node I767:6580;767:6553
  static const double shortcutLabelLineHeight = 21.78;
  static const double shortcutArtWidth = 113; // node I767:6580;767:6576
  static const double shortcutArtHeight = 85;

  // --- TAM-174 gradient grid (Figma 3760:28482, section "Colored Feature Cards")
  //
  // The A/B treatment's card. EVERY value below is a RATIO of the card's base
  // width, never a device-pixel size: `GridView.count` already derives the card
  // width from the available space, so the tile scales with the screen and only
  // its ASPECT is fixed. Hard-coding the interior at the 104 dp design width
  // would look right on a 360 dp frame and wrong on every other device.
  //
  // Same pattern as `AppBooks.card*Ratio` (one widget serving three Figma
  // variants) — see `features/books/presentation/books_widgets.dart`.
  //
  // The CONTROL arm keeps the constants above untouched, so a user in control
  // sees byte-identical pixels to what shipped before this experiment.

  /// The ratio denominator — the design card's width (node 3760:28483).
  static const double shortcutBaseWidth = 104;

  /// Card aspect for the gradient arm — its OWN Figma frame, 104×94
  /// (node 3760:28483).
  ///
  /// The arms deliberately differ in footprint (product decision, 2026-09-11):
  /// the new variant's tiles are shorter, so its grid block is ~47 dp shorter
  /// than control's at 360 dp and the feed below it starts higher. That is part
  /// of the redesign being tested, not a side effect.
  ///
  /// Briefly matched to control's 103×117 and reverted — if that is ever
  /// revisited, note what it costs: at the control card's height the art band
  /// gains ~24 dp of slack the design never had, because the artwork is a
  /// fixed-aspect 104×68 band. At THIS aspect the band and the asset match
  /// exactly and there is no slack at all.
  ///
  /// The reason to keep them apart is fidelity; the reason to match them would
  /// be experiment hygiene (size, palette, copy and art all move together, so a
  /// conversion delta cannot be attributed to any one of them). That trade is
  /// recorded in `home_shortcut_grid_gradient_test.dart`.
  static const double shortcutCardAspect =
      104 / 94; // 1.10638 — Figma 3760:28483

  static const double shortcutRadiusRatio = 8 / 104; // 0.07692
  static const double shortcutLabelPadTopRatio = 6 / 104; // 0.05769
  static const double shortcutLabelPadXRatio = 8 / 104; // 0.07692
  static const double shortcutLabelSizeRatio = 14 / 104; // 0.13462
  static const double shortcutLabelLineRatio = 20 / 104; // 0.19231
  // NOTE: Figma's art band has a 4 dp top padding and holds a 70×70 illustration
  // inset within its 104 dp width — but the CMS asset is an export of the BAND
  // ITSELF, so both of those are already baked into the image's transparent
  // margins. The widget therefore lets the asset fill the band and applies
  // NEITHER. The ratios are kept only to document the design; applying them
  // would inset the art twice.
  static const double shortcutArtPadTopRatio =
      4 / 104; // 0.03846 — baked into the asset
  static const double shortcutIconRatio =
      70 / 104; // 0.67308 — baked into the asset

  /// Letter spacing as a fraction of the FONT SIZE (-0.42 at 14 px), not of the
  /// card — tracking that scaled with width would drift away from the type it
  /// belongs to at both ends of the device range.
  static const double shortcutLabelTrackingEm = -0.42 / 14; // -0.03

  /// Bounds on the derived label size.
  ///
  /// Pure ratio scaling would render the label at ~12.2 px on a 320 dp phone and
  /// ~17.1 px on a foldable. The first is below comfortable reading size and the
  /// second overwhelms a 94-tall tile, so the scale factor is clamped even
  /// though every other dimension is left free. Layout stays exact; only type
  /// stops tracking the card at the extremes.
  static const double shortcutLabelScaleMin = 0.85;
  static const double shortcutLabelScaleMax = 1.25;

  /// The gradient grid's gap — node 3760:28482 itemSpacing, 8 (control uses 10).
  ///
  /// A FIXED spacing token rather than a ratio: `childAspectRatio` is a ratio,
  /// so the card's shape holds whatever the gap is, and fixed spacing matches
  /// `AppSpacing` everywhere else. The cards absorb all remaining width —
  /// 104×3 + 8×2 = 328, which is exactly the content width at 360 dp.
  static const double shortcutGapGradient = AppSpacing.xSmall; // 8

  /// The themed card's single shadow (node 3760:28483) — #000000 @0.05, (0,+1)
  /// blur 2. The control card paints a SECOND, heavier grid-block shadow and a
  /// 1 px gradient stroke; the new design has neither.
  static const double shortcutGradientShadowBlur = 2;

  // --- Feed card shared chrome (285:3539 → 285:3541 …) -----------------------
  static const double cardBorder = 1; // node 285:3539 stroke
  static const double headerBlockHeight = 72; // node 285:3541
  static const double headerBlockPadding = AppSpacing.medium; // 16
  static const double thumbSize = 40; // node 285:3544
  static const double thumbRadius = 10;
  static const double thumbTextGap =
      AppSpacing.small; // 12 (node 285:3543 itemSpacing)
  static const double cardTitleGap =
      AppSpacing.xxxSmall; // 4 (node 285:3546 itemSpacing)
  static const double badgeGlyph = 14; // node 285:3552
  static const double badgeGap = 2; // node 285:3551 itemSpacing
  static const double badgeRadius = 12;

  /// Hero preview for the wallpaper + status cards (nodes 285:3555 / 285:3590)
  /// — 360×574 in a 360-wide frame.
  static const double heroHeight = 574;
  static const double heroAspect = 360 / 574;

  /// Audio preview area (nodes 285:3655 / 3705 / 3755) — 360×360, square.
  static const double audioAreaHeight = 360;

  // --- Primary CTA (`Main Buttons`) ------------------------------------------
  // Hero variant (node 285:3557) — 112×36.
  static const double ctaHeight = 36;
  static const double ctaRadius = AppRadius.button; // 8
  static const double ctaBorder = 1;
  static const double ctaPaddingH = AppSpacing.small; // 12
  static const double ctaBottomInset =
      20; // 20560 (hero bottom) − 20492 − 36 − 12
  // Audio variant (node 285:3672) — 98×28, tighter padding + a 12/16 label.
  static const double ctaAudioHeight = 28;
  static const double ctaAudioPaddingH = 10;

  // --- Engagement footer (285:3558 / 285:3559) -------------------------------
  static const double actionsPaddingH = AppSpacing.medium; // 16
  static const double actionsPaddingTop = AppSpacing.small; // 12
  static const double actionsPaddingBottom = AppSpacing.medium; // 16
  static const double footerHeight = 24; // node 285:3559
  static const double footerPaddingH = AppSpacing.xSmall; // 8
  static const double footerPaddingTop = AppSpacing.xxxSmall; // 4
  static const double footerItemGap =
      AppSpacing.xxxSmall; // 4 (nodes 285:3560/3565/3570 itemSpacing)
  static const double likeGlyphWidth = 18.33; // node 285:3562
  static const double likeGlyphHeight = 16.82;
  static const double viewGlyphWidth = 20.17; // node 285:3567
  static const double viewGlyphHeight = 13.75;
  static const double shareGlyphWidth = 17.72; // node 285:3571
  static const double shareGlyphHeight = 18;

  // --- Audio mini player (285:3658) ------------------------------------------
  static const double miniPlayerPadding = AppSpacing.medium; // 16
  static const double miniPlayerGap = AppSpacing.small; // 12 (itemSpacing)
  static const double progressHeight = 6; // node 285:3664
  static const double progressRadius = 12;
  static const double progressThumb = 12; // node 285:3666
  static const double playButtonSize = 48; // node 285:3668
  static const double playButtonRadius = 12;
  static const double playGlyphWidth = 13.75; // node 285:3671
  static const double playGlyphHeight = 17.5;

  // --- Behaviour thresholds (spec, not Figma) --------------------------------
  /// A feed item counts as VIEWED after 2s at ≥50% visibility (AC / pattern §5).
  static const Duration viewThreshold = Duration(seconds: 2);

  /// Visibility fraction a card must reach to count toward the view timer.
  static const double viewVisibleFraction = 0.5;

  /// Viewport-driven audio preview hysteresis (pattern §4): play at ≥0.6,
  /// pause at ≤0.2 — the gap stops a card straddling the threshold from
  /// thrashing the shared player.
  static const double audioPlayFraction = 0.6;
  static const double audioPauseFraction = 0.2;

  /// Prefetch the next feed page this many cards from the tail.
  static const int prefetchTailDistance = 3;
}

/// Chat module geometry (TAM-164). Derived from Figma frames listed under
/// [AppColors] chat section. Measured off the staged reference PNGs (specs/
/// evidence/TAM-164/figma/) — the Slice 2 execution environment did not expose
/// the Figma MCP tools, so Slice 3 Phase 6 verifies these against a live
/// `get_metadata` sweep and any drift lands as an amendment here.
class AppChat {
  AppChat._();

  // Screen edge padding — matches the other module scaffolds (aarti/mantras/…).
  // Also matches the horizontal 16 pad on `Main - ChatContent` inside every
  // chat frame.
  static const double screenPadding = AppSpacing.medium; // 16

  // App bar (back arrow + "Prabhuji Chat"): 64px tall (Figma Basic Nav
  // container is 360×64), back-arrow 24 in a 36 frame, title 20/28 w600.
  static const double appBarHeight = 64;
  static const double appBarBackArrow = 24;
  static const double appBarTitleGap = AppSpacing.small; // 12

  // Bubble — 2612:17963. User is right-aligned orange; bot is left-aligned
  // peach. Both have `pad 16/16/16/16`. Max width is per-variant so a bot
  // reply can grow wider than a user turn (user 235/328 ≈ 0.72, bot 300/328
  // ≈ 0.92 in Figma; rounded to 0.75 / 0.92 for legibility).
  static const double bubbleUserMaxWidthFraction = 0.75;
  static const double bubbleBotMaxWidthFraction = 0.92;
  // Kept for callers that don't distinguish variant (typing bubble in
  // particular). Same value as [bubbleBotMaxWidthFraction] so the typing
  // pill has enough room to render the three dots.
  static const double bubbleMaxWidthFraction = 0.75;
  static const double bubblePaddingH = AppSpacing.medium; // 16
  static const double bubblePaddingV = AppSpacing.medium; // 16
  // Every bubble corner is 16 EXCEPT the tail corner (bottom-left on bot,
  // bottom-right on user) which is 2 — Figma `rCorners=[16,16,16,2]` (bot)
  // / `[16,16,2,16]` (user). ChatBubble builds `BorderRadius.only(…)` from
  // these two constants.
  static const double bubbleCornerLarge = 16;
  static const double bubbleTailRadius = 2;
  // Kept for the typing bubble (uniform radius — no tail in Figma
  // 2612:17934 Background frame, which uses `rCorners=[16,16,16,2]` on its
  // pill but is rendered without a tail overlay).
  static const double bubbleRadius = 16;
  static const double bubbleGap =
      AppSpacing.medium; // 16 vertical gap between bubbles
  // Every bubble (user + bot + typing) carries an identical subtle drop shadow
  // per Figma `2612:17963` — `drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]`.
  // Verified via live Figma MCP on 2026-09-02 (Slice 3 REST fallback missed
  // it). Kept as a single BoxShadow token so the widget stays const-friendly.
  static final List<BoxShadow> bubbleShadow = <BoxShadow>[
    BoxShadow(
      color: const Color(0x0D000000), // rgba(0,0,0,0.05) = 5% black
      offset: const Offset(0, 1),
      blurRadius: 1,
    ),
  ];

  // --- TAM-177: in-thread intro video card + khoj question label -------------
  //
  // Gap between a bubble's `leading` slot (the video card) and its message
  // text. Figma `3934:14677` — the caption sits directly under the video with
  // one 12dp step, tighter than the 16dp inter-bubble gap.
  static const double bubbleLeadingGap = AppSpacing.small; // 12

  /// Gap between the `N/6` label and the question text inside a khoj bubble
  /// (Figma `3938:26855`).
  static const double bubbleLabelGap = 4;

  /// The intro video card's aspect ratio (w / h), taken from the Figma frame
  /// rather than from any single asset.
  ///
  /// DELIBERATELY FIXED, not read off the video's intrinsic size: the three
  /// intro videos are different files (Content_Chat.mp4 is 832×1088 ≈ 0.765)
  /// and letting each pick its own ratio would give the same thread three
  /// different card heights. The video is cover-cropped into this box —
  /// TAM-177 #RESOLVED R8.
  static const double introVideoAspectRatio = 242 / 306.5; // ≈ 0.790

  /// A bubble carrying MEDIA is narrower than a text bubble, and hugs its
  /// media much more tightly.
  ///
  /// MEASURED off the shared `Message bubble` component as used at Figma
  /// `3975:24028` (gita) and `3975:23837` (content): in a 360 frame the bubble
  /// is 250 wide — 0.694, not the 0.92 a text bubble gets — and the media
  /// inside it is 242 x 306.5 with only 4dp of bubble padding around it.
  ///
  /// Reusing the text bubble's 0.92 + 16dp padding is what made the video card
  /// span nearly the full screen and tower over the thread.
  static const double mediaBubbleMaxWidthFraction = 250 / 360; // ≈ 0.694
  static const double mediaBubblePadding = 4;

  /// The caption under the media sits in its own inset (Figma: text at x=6
  /// inside the 242-wide frame, 2dp below the media).
  static const double mediaBubbleCaptionInsetH = 6;
  static const double mediaBubbleCaptionGap = 2;

  /// Corner radius of the video card inside the bubble (Figma `3934:14677`).
  static const double introVideoRadius = 12;

  /// The `0:27` duration badge — the app's first video duration badge.
  static const double introVideoBadgeInset = 8;
  static const double introVideoBadgePaddingH = 6;
  static const double introVideoBadgePaddingV = 2;
  static const double introVideoBadgeRadius = 4;
  static const double introVideoBadgeGlyph = 12;

  /// Diameter of the centred play/pause overlay circle.
  static const double introVideoPlayOverlay = 56;

  // --- TAM-178: intro-block suggestion chips --------------------------------
  //
  // MEASURED off Figma `3975:23838` (content) and `3975:24029` (gita). Each
  // chip is `text width + 20` wide — 230 / 208 / 166 and 235 / 160 / 200 — so
  // they HUG their label and each is a different width. They are not a
  // full-width list, and getting that wrong is what makes the block read as
  // the old RECOMMENDED card stack instead of the new design.
  static const double introChipMinHeight = 40;
  static const double introChipPaddingH = 10;
  static const double introChipGap = 8;
  static const double introChipRadius = 8;

  /// Extra left inset so a chip lines up with the bubble's text rather than
  /// the bubble's edge (Figma: container at x=8, chip at x=16 within it, so 24
  /// from the frame edge — the transcript already supplies 16).
  static const double introChipInset = 8;

  // Card + composer outer surface shadow — Figma `2612:17876` /
  // `2612:17847` / `2612:17905` `stroke=Normal` + `stroke=Highlighted` +
  // composer `2612:18010` `Background+Border+Shadow` all carry an identical
  // `type: DROP_SHADOW, color: #000 @0.05, offset: (0,1), radius: 2`.
  // Confirmed via Figma REST /v1/files inspection on 2026-09-02 (the earlier
  // Slice-3 "intentional divergence" for cards was incorrect — Figma does
  // paint this shadow on cards too). Kept const-friendly.
  static final List<BoxShadow> surfaceShadow = <BoxShadow>[
    BoxShadow(
      color: const Color(0x0D000000), // rgba(0,0,0,0.05)
      offset: const Offset(0, 1),
      blurRadius: 2,
    ),
  ];

  // Empty-state suggestion chip shadow — Figma `2612:17647`
  // `Button - Suggestion Card {1,2,3}` all carry a lighter
  // `DROP_SHADOW, color: #000 @0.02, offset: (0,1), radius: 2`.
  static final List<BoxShadow> emptyChipShadow = <BoxShadow>[
    BoxShadow(
      color: const Color(0x05000000), // rgba(0,0,0,0.02)
      offset: const Offset(0, 1),
      blurRadius: 2,
    ),
  ];

  // Composer mic / send action button elevation — Figma `2612:18010`
  // `Button:shadow` (40×40 circle) carries a two-layer elevation stack
  // matching Tailwind's `shadow-md`:
  //   1. #000 @0.10, offset (0,2), blur 4, spread -2
  //   2. #000 @0.10, offset (0,4), blur 6, spread -1
  static final List<BoxShadow> composerButtonShadow = <BoxShadow>[
    BoxShadow(
      color: const Color(0x1A000000), // rgba(0,0,0,0.10)
      offset: const Offset(0, 2),
      blurRadius: 4,
      spreadRadius: -2,
    ),
    BoxShadow(
      color: const Color(0x1A000000),
      offset: const Offset(0, 4),
      blurRadius: 6,
      spreadRadius: -1,
    ),
  ];
  // Typing bubble (2612:17934) — smaller pill hugging the three dots
  // (`pad 12/16/12/16` in Figma).
  static const double typingBubblePaddingH = 16;
  static const double typingBubblePaddingV = 12;
  static const double typingDotSize = 6;
  static const double typingDotGap = 4;

  // Card (2612:17847 mantra / 2612:17876 aarti-bhajan / 2612:17905 wallpaper)
  // — 328×143 in the 360-wide frame (leaves 16px screen padding on each
  // side). Container header (thumb + title + subtitle) is 326×88, CTA
  // HorizontalBorder row is 326×53. Both `stroke=Normal` and
  // `stroke=Highlighted` use `strokeWeight: 1` — the states differ only in
  // stroke colour (`#B8B8B8` → `#FC7304`).
  static const double cardRadius = 12;
  static const double cardBorderWidth = 1;
  static const double cardBorderWidthActive = 1;
  static const double cardHeaderPaddingH = 16;
  static const double cardHeaderPaddingV = 16;
  static const double cardHeaderGap = 12;
  static const double cardThumb = 56;
  static const double cardThumbRadius = 8;
  static const double cardHeaderMinHeight = 88; // Container 326×88
  static const double cardCtaMinHeight = 53; // HorizontalBorder 326×53
  static const double cardCtaPaddingH = 16;
  static const double cardCtaChevron = 20;

  // Composer (2612:18010) — Figma renders ONE 328×50 pill (`fills #F8F8F8`,
  // `r=9999` full pill, `pad 4/4/4/4`) enclosing BOTH the text field and
  // the mic/send circle. The outer `Footer - InputArea` is 360×71 with an
  // outer pad `10/16/10/16` (white surface + `#EAEBEE` 1px stroke).
  static const double composerMinHeight = 71;
  static const double composerPaddingH = AppSpacing.medium; // 16
  static const double composerPaddingV = 10;
  static const double composerFieldMinHeight = 50; // outer pill height
  // Inner pill padding is 4 on all sides (per Figma `pad 4/4/4/4`); the
  // TextField itself gets an additional lead pad so the caret has breathing
  // room away from the pill's rounded end.
  static const double composerFieldPaddingH = 4;
  static const double composerFieldTextLeadPad = 14;
  static const double composerFieldRadius = 25; // ≥ height/2 clamps to pill
  static const double composerActionButton = 40; // mic / send circle diameter
  static const double composerActionIcon = 20; // glyph size inside circle
  static const double composerFieldActionGap = AppSpacing.xxxSmall; // 4

  // Date separator (2612:18005) — centred "TODAY" caption. Figma pad is
  // `2/10/2/10` — the airy vertical space around a separator comes from
  // adjacent bubble gaps, not from the separator's own padding.
  static const double dateSeparatorPaddingV = 2;
  static const double dateSeparatorLetterSpacing =
      0.96; // Figma tracking on "TODAY"

  // Empty state (2612:17647) — deity roundel 128×128 (peach fill + orange
  // inner ring), 24 gap to the Namaste title, 8 gap to the subtitle, 32 gap
  // to the RECOMMENDED chips block.
  static const double emptyDeityRoundel = 128;
  static const double emptyDeityInnerRingWidth = 1.5;
  static const double emptyDeityGlyph = 56; // temple + om inside the ring
  static const double emptyTitleGap = AppSpacing.large; // 24
  static const double emptySubtitleGap = AppSpacing.xSmall; // 8
  static const double emptyRecommendedGap = AppSpacing.xLarge; // 32
  static const double emptyRecommendedLabelGap = AppSpacing.medium; // 16
  static const double emptyChipMinHeight = 64;
  static const double emptyChipPaddingH = 12;
  static const double emptyChipPaddingV = 12;
  static const double emptyChipRadius = 12;
  static const double emptyChipIconTile = 40;
  static const double emptyChipIconRadius = 8;
  static const double emptyChipIconGlyph = 20;
  static const double emptyChipGap = AppSpacing.medium; // 16 gap between chips

  // Behaviour thresholds (spec, not Figma).
  /// Client-authoritative message length ceiling — mirrors
  /// `chat.schemas.ts:73` server bound. Send button disabled outside this.
  static const int messageMaxChars = 4000;

  /// The minimum time gap (in hours) between two consecutive messages that
  /// forces a date-separator row between them. 6h keeps a normal conversation
  /// as one block while day-old context (per 2612:17716 long-history frame)
  /// gets a "27 JULY 2026" / "Yesterday" / "Today" separator.
  static const Duration dateSeparatorThreshold = Duration(hours: 6);
}

/// Typography — Inter for all UI copy, Libre Caslon Text for the wordmark.
/// All sizes/weights/line-heights cited from Figma text-style variables:
///   `Headings/heading-sm` = 24/32 semibold (600)
///   `Headings/heading-xs` = 20/28 semibold (600)
///   `Body/body-md`        = 16/24 regular  (400)
///   `Body/body-sm`        = 14/20 regular  (400)
///   `Body/body-xs`        = 12/16 regular  (400)
///   `Label/label-lg`      = 16/24 medium   (500)
///   `Label/label-md`      = 14/20 medium   (500)
///   `Label/label-sm`      = 12/16 medium   (500)
///
/// letterSpacing on Figma tokens is `-3` in the token dump — interpreted as
/// -3% tracking (Figma's default). Translated to Flutter via `-0.03 * fontSize`
/// per style; small enough to be barely visible but preserves the design's
/// tight typographic feel.
class AppText {
  AppText._();

  static const String _fontFamily = 'Inter';
  static const String _wordmarkFamily = 'Libre Caslon Text';

  static TextStyle _base({
    required double fontSize,
    required FontWeight fontWeight,
    required double lineHeight,
    Color color = AppColors.grey500,
    String family = _fontFamily,
    double? letterSpacing,
  }) {
    return GoogleFonts.getFont(
      family,
      fontSize: fontSize,
      fontWeight: fontWeight,
      height: lineHeight / fontSize,
      color: color,
      letterSpacing: letterSpacing ?? fontSize * -0.03,
    );
  }

  // Headings
  static TextStyle headingSm({Color color = AppColors.grey500}) => _base(
    fontSize: 24,
    fontWeight: FontWeight.w600,
    lineHeight: 32,
    color: color,
  );
  static TextStyle headingXs({Color color = AppColors.grey500}) => _base(
    fontSize: 20,
    fontWeight: FontWeight.w600,
    lineHeight: 28,
    color: color,
  );

  // Body
  static TextStyle bodyMd({Color color = AppColors.grey500}) => _base(
    fontSize: 16,
    fontWeight: FontWeight.w400,
    lineHeight: 24,
    color: color,
  );
  static TextStyle bodySm({Color color = AppColors.grey500}) => _base(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    lineHeight: 20,
    color: color,
  );
  static TextStyle bodyXs({Color color = AppColors.grey500}) => _base(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    lineHeight: 16,
    color: color,
  );

  // Labels (medium weight)
  static TextStyle labelLg({Color color = AppColors.grey500}) => _base(
    fontSize: 16,
    fontWeight: FontWeight.w500,
    lineHeight: 24,
    color: color,
  );
  static TextStyle labelMd({Color color = AppColors.grey500}) => _base(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    lineHeight: 20,
    color: color,
  );
  static TextStyle labelSm({Color color = AppColors.grey500}) => _base(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    lineHeight: 16,
    color: color,
  );

  /// Bottom-nav tab caption (TAM-58) — Figma nav label `Name` = 12/16 medium.
  /// Active tabs pass `AppColors.navActive`, inactive `AppColors.navInactive`.
  static TextStyle navLabel({Color color = AppColors.navInactive}) => _base(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    lineHeight: 16,
    color: color,
  );

  /// Deity-avatar caption (TAM-58) — Figma deity label = 12/16, `Colors/Grey/500`.
  static TextStyle deityLabel({Color color = AppColors.deityLabel}) => _base(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    lineHeight: 16,
    color: color,
  );

  /// Feed/content card title (TAM-58) — shared card chrome (`285:3641`),
  /// `Label/label-lg` = 16/24 medium.
  static TextStyle cardTitle({Color color = AppColors.grey500}) => _base(
    fontSize: 16,
    fontWeight: FontWeight.w500,
    lineHeight: 24,
    color: color,
  );

  /// Aarti audio-card subtitle "Luna" (TAM-64, node 412:2916) — 11/16.5. Figma
  /// uses Light (300); the app bundles only Inter 400/500/600 and disables
  /// runtime font fetching (main.dart), so we render Regular (400) — near-
  /// identical at 11px. Recorded as an intentional divergence in the sweep.
  static TextStyle aartiCardSubtitle({
    Color color = AppColors.aartiCardSubtitle,
  }) => _base(
    fontSize: 11,
    fontWeight: FontWeight.w400,
    lineHeight: 16.5,
    color: color,
  );

  /// Aarti player elapsed/total time (TAM-64, nodes 425:4869/4870) — 14/17 regular.
  static TextStyle aartiTime({Color color = AppColors.aartiPlayerTime}) =>
      _base(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        lineHeight: 17,
        color: color,
      );

  /// Horoscope zodiac-card label (TAM-74, node I379:2333;379:2331) — 18/24 w500.
  /// Not on the shared ramp (which jumps 16 → 20), so it's declared here.
  static TextStyle horoscopeZodiacLabel({
    Color color = AppColors.horoscopeCardLabel,
  }) => _base(
    fontSize: 18,
    fontWeight: FontWeight.w500,
    lineHeight: 24,
    color: color,
  );

  /// Horoscope step-title pill (TAM-74, node 1162:4438) — 16/24 **w600**.
  ///
  /// 7 of the 8 example step frames use w600; the first ("Namaste", node
  /// 1162:4214) uses w500. That lone 500 is a stale-frame inconsistency — the
  /// step list is backend-driven, so a per-step weight isn't expressible in the
  /// contract. We follow the dominant design; recorded in the sweep table.
  static TextStyle horoscopeStepTitle({
    Color color = AppColors.horoscopeStepPillLabel,
  }) => _base(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    lineHeight: 24,
    color: color,
  );

  /// Horoscope step BODY (TAM-74, node 1162:4436) — 16/24 w500, centred.
  /// The `number` content type overrides the size — see [horoscopeResultNumber].
  static TextStyle horoscopeResultBody({
    Color color = AppColors.horoscopeResultText,
  }) => _base(
    fontSize: 16,
    fontWeight: FontWeight.w500,
    lineHeight: 24,
    color: color,
  );

  /// Horoscope step body for `contentType: "number"` (TAM-74, node 1162:4276 —
  /// the "Lucky number" frame's `7`) — **32**/24 w500, centred.
  ///
  /// This is why the contract carries `contentType` (`text | number | color`):
  /// the design renders a number step's value at double the body size. `text`
  /// and `color` (e.g. "Sky Blue", node 1162:4244) both stay at 16.
  ///
  /// Figma really does set lineHeight 24 under a 32px glyph (its text box is
  /// 262×24) — kept verbatim; the value is a single centred line with the whole
  /// card as slack, so the shorter line box never clips.
  static TextStyle horoscopeResultNumber({
    Color color = AppColors.horoscopeResultText,
  }) => _base(
    fontSize: 32,
    fontWeight: FontWeight.w500,
    lineHeight: 24,
    color: color,
  );

  /// Horoscope Next/Finish label (TAM-74, node I1162:4461;5178:7620). Figma says
  /// 14.068/20.098 — the `Main Buttons` instance is placed at ×1.0049 scale.
  /// Rounded to the ramp's 14/20 (a 0.07px delta); recorded in the sweep table.
  static TextStyle horoscopeNextLabel({
    Color color = AppColors.horoscopeNextBtnLabel,
  }) => _base(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    lineHeight: 20,
    color: color,
  );

  // ---- Books & Scriptures (TAM-76) ------------------------------------------

  /// Book-card title (node I534:5505;534:5403). The card scales by width/120, so
  /// the title scales with it: 12/16 at the 120 base, 15.9/21.2 at 159, 10/13.3
  /// at 100 — hence the explicit [fontSize]/[lineHeight] rather than a fixed
  /// ramp entry.
  static TextStyle booksCardTitle({
    required double fontSize,
    required double lineHeight,
    Color color = AppColors.booksCardTitle,
  }) => _base(
    fontSize: fontSize,
    fontWeight: FontWeight.w500,
    lineHeight: lineHeight,
    color: color,
  );

  /// Gradient-CTA label — Listen Audio / Previous / Next (node
  /// I663:4269;5178:7452). Figma says 14.068/20.098 because the `Main Buttons`
  /// instance is placed at ×1.0049; rounded to the ramp's 14/20 exactly as
  /// TAM-74 did for the same component (0.07px delta, logged in the sweep).
  static TextStyle booksButtonLabel({
    Color color = AppColors.booksButtonLabel,
  }) => _base(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    lineHeight: 20,
    color: color,
  );

  /// "Start Reading" (node I639:4105;5183:7896) — the same component at the
  /// contents screen's smaller 12.059/16.078 placement → ramp 12/16.
  static TextStyle booksCtaSmall({Color color = AppColors.booksButtonLabel}) =>
      _base(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        lineHeight: 16,
        color: color,
      );

  /// Reader chapter title (nodes 621:4078 / 647:4135) — 20/28 w600.
  static TextStyle booksReaderTitle({
    Color color = AppColors.booksReaderTitle,
  }) => _base(
    fontSize: 20,
    fontWeight: FontWeight.w600,
    lineHeight: 28,
    color: color,
  );

  /// Reader Devanagari body (node 620:4076) — 16/28 w500 at the design's default
  /// size; [fontSize] is driven by the persisted font-size preference and the
  /// line-height follows via [AppBooks.readerBodyLineRatio] so the designed
  /// rhythm survives scaling.
  static TextStyle booksReaderBody({
    double fontSize = AppBooks.readerFontDefault,
    Color color = AppColors.booksReaderBody,
  }) => _base(
    fontSize: fontSize,
    fontWeight: FontWeight.w500,
    lineHeight: fontSize * AppBooks.readerBodyLineRatio,
    color: color,
  );

  /// Contents kanda/chapter row title (node 639:4046) — 12/16 w500.
  static TextStyle booksContentsItem({
    Color color = AppColors.booksContentsItemTitle,
  }) => _base(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    lineHeight: 16,
    color: color,
  );

  /// Contents chapter count (node 639:4080) — 12/16 w400.
  static TextStyle booksContentsCount({
    Color color = AppColors.booksContentsItemCount,
  }) => _base(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    lineHeight: 16,
    color: color,
  );

  /// Drawer book title (node 637:4424) — 16/20 w700.
  static TextStyle booksDrawerTitle({
    Color color = AppColors.booksDrawerBookTitle,
  }) => _base(
    fontSize: 16,
    fontWeight: FontWeight.w700,
    lineHeight: 20,
    color: color,
  );

  /// Drawer metadata: the kanda line (node 637:4427) + "Total Chapters: N"
  /// (node 637:4431) — 12/16 w400.
  static TextStyle booksDrawerMeta({Color color = AppColors.booksDrawerMeta}) =>
      _base(
        fontSize: 12,
        fontWeight: FontWeight.w400,
        lineHeight: 16,
        color: color,
      );

  /// Drawer chapter row (nodes 637:4370 active / 637:4372 idle) — 12/16 w500.
  /// Figma renders the idle rows at 11/14 purely because the auto-layout text
  /// shrinks to fit the mock's longer strings; the ACTIVE row (the unclipped
  /// one) is the true 12/16. Recorded in the sweep table.
  static TextStyle booksDrawerChapter({
    Color color = AppColors.booksDrawerChapterIdle,
  }) => _base(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    lineHeight: 16,
    color: color,
  );

  /// Font-overlay value box "18px" (node 620:3862) — 14/20 w400.
  static TextStyle booksFontValue({
    Color color = AppColors.booksFontValueText,
  }) => _base(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    lineHeight: 20,
    color: color,
  );

  /// Home feature-shortcut card title (TAM-62, node I767:6580;767:6553) —
  /// 18/21.78 **w600**, centred. Not on the shared ramp (which jumps 16 → 20),
  /// so it is declared here; ls −0.54 = 18 × −0.03 matches [_base] exactly.
  static TextStyle homeShortcutLabel({
    Color color = AppColors.homeShortcutLabel,
  }) => _base(
    fontSize: 18,
    fontWeight: FontWeight.w600,
    lineHeight: 21.78,
    color: color,
  );

  /// TAM-174 — the gradient grid's tile label (node 3760:28486): Inter SemiBold
  /// 14/20, tracking -0.42, in the tile's own palette colour.
  ///
  /// `fontSize`/`lineHeight` are REQUIRED and passed by the caller because they
  /// are derived from the measured card width, not fixed — see the
  /// `AppHome.shortcut*Ratio` constants. Same shape as [booksCardTitle], the
  /// other scale-driven style in this file.
  ///
  /// Letter spacing is left to [_base]'s default, which is `fontSize * -0.03` —
  /// identical to the design's -0.42 at 14 px, and it stays proportional as the
  /// size scales.
  static TextStyle homeShortcutLabelThemed({
    required double fontSize,
    required double lineHeight,
    required Color color,
  }) => _base(
    fontSize: fontSize,
    fontWeight: FontWeight.w600,
    lineHeight: lineHeight,
    color: color,
  );

  /// Home audio-preview elapsed/total time (TAM-62, nodes 285:3661/3663).
  ///
  /// Figma specifies **Plus Jakarta Sans** 12/16 w500 with ls 0. The app bundles
  /// only Inter + Libre Caslon Text and disables runtime font fetching
  /// (main.dart), so this renders Inter at the same size/weight — the same
  /// intentional divergence already recorded for [aartiCardSubtitle]. The ls-0
  /// IS honoured (the shared ramp's −3% tracking is overridden here).
  static TextStyle homeAudioTime({Color color = AppColors.homeAudioTime}) =>
      GoogleFonts.getFont(
        _fontFamily,
        fontSize: 12,
        fontWeight: FontWeight.w500,
        height: 16 / 12,
        color: color,
        letterSpacing: 0,
      );

  /// Home profile-avatar initial (TAM-62, node 285:3498) — Figma says Plus
  /// Jakarta Sans 16/24 w400 ls 0; same substitution + ls note as [homeAudioTime].
  static TextStyle homeAvatarInitial({
    Color color = AppColors.homeAvatarInitial,
  }) => GoogleFonts.getFont(
    _fontFamily,
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 24 / 16,
    color: color,
    letterSpacing: 0,
  );

  /// Downloads list-item title (Figma `2632:21373`, node `I2632:21386;2612:20569`
  /// "Ganesh Aarti") — Inter SemiBold 17/25.5, letterSpacing 0, #000000. Off
  /// the shared ramp (which jumps 16 → 20), so declared here per convention.
  static TextStyle downloadRowTitle({Color color = AppColors.black}) => _base(
    fontSize: 17,
    fontWeight: FontWeight.w600,
    lineHeight: 25.5,
    letterSpacing: 0,
    color: color,
  );

  /// Downloads list-item subtitle (node `I2632:21386;2612:20571`
  /// "Aarti · 5:52 · 6.2 MB") — Inter Regular 12/21, letterSpacing 0, #767676.
  /// The 21 line-height (not 16) is what widens the row.
  static TextStyle downloadRowSubtitle({Color color = AppColors.grey400}) =>
      _base(
        fontSize: 12,
        fontWeight: FontWeight.w400,
        lineHeight: 21,
        letterSpacing: 0,
        color: color,
      );

  /// Downloads list-item status label ("Queued" / "22%" / "Failed" — nodes
  /// `2591:13023 / 2591:13011 / 2591:13036`) — Inter SemiBold 10/12,
  /// letterSpacing 0. Caller passes the state colour (`grey400` for Queued,
  /// `brand300` for %, `error200` for Failed).
  static TextStyle downloadRowStatus({Color color = AppColors.grey400}) =>
      _base(
        fontSize: 10,
        fontWeight: FontWeight.w600,
        lineHeight: 12,
        letterSpacing: 0,
        color: color,
      );

  /// Downloads filter chip label ("All 12" — node `2632:21378`) — Inter
  /// Medium 15/22.5, letterSpacing 0. Selected chip passes `white`,
  /// unselected passes `grey500`.
  static TextStyle downloadsFilterChip({Color color = AppColors.grey500}) =>
      _base(
        fontSize: 15,
        fontWeight: FontWeight.w500,
        lineHeight: 22.5,
        letterSpacing: 0,
        color: color,
      );

  /// Mini-player v2 title (TAM-N-mini-player-v2, node 1950:20915) — Montserrat
  /// SemiBold (w600), 12/14.6, letterSpacing -0.263, colour #000000. The
  /// Montserrat family is bundled at `assets/fonts/Montserrat-Variable.ttf`
  /// (pubspec `family: Montserrat`, weight 600); we call it via a bare
  /// [TextStyle] with a literal `fontFamily` rather than `GoogleFonts.getFont`
  /// so the runtime never attempts a network fetch (main.dart sets
  /// `GoogleFonts.config.allowRuntimeFetching = false`; the figma-flutter Trap
  /// "google_fonts in tests" applies otherwise).
  static TextStyle miniPlayerTitle({Color color = AppColors.miniPlayerV2Text}) {
    return TextStyle(
      fontFamily: 'Montserrat',
      fontSize: 12,
      fontWeight: FontWeight.w600,
      height: 14.6 / 12,
      letterSpacing: -0.263,
      color: color,
    );
  }

  /// Mini-player v2 subtitle (TAM-N-mini-player-v2, node 1950:20916) — Inter
  /// Regular (w400), 10/16, letterSpacing -0.3, colour #000000. Inter is
  /// already bundled (pubspec `family: Inter`, weight 400). Uses a literal
  /// TextStyle for parity with [miniPlayerTitle] — same reason: no runtime
  /// google_fonts fetch, no test-time throw.
  static TextStyle miniPlayerSubtitle({
    Color color = AppColors.miniPlayerV2Text,
  }) {
    return TextStyle(
      fontFamily: 'Inter',
      fontSize: 10,
      fontWeight: FontWeight.w400,
      height: 16 / 10,
      letterSpacing: -0.3,
      color: color,
    );
  }

  /// Wordmark — Libre Caslon Text Bold. Figma splash uses size 24 / weight 700 /
  /// line-height 31.2 / letter-spacing -0.6, color `Colors/Brand/400` (deep orange).
  static TextStyle wordmarkFigma({
    double fontSize = 24,
    Color color = AppColors.brand400,
  }) {
    return GoogleFonts.getFont(
      _wordmarkFamily,
      fontSize: fontSize,
      fontWeight: FontWeight.w700,
      height: 31.2 / 24, // scales with fontSize
      color: color,
      letterSpacing: fontSize / 24 * -0.6,
    );
  }

  // ---- Chat module (TAM-164) ------------------------------------------------

  /// App-bar title "Prabhuji Chat" (2612:17647 / 17716 header) — 20/28 w600.
  static TextStyle chatAppBarTitle({Color color = AppColors.chatAppBarTitle}) =>
      _base(
        fontSize: 20,
        fontWeight: FontWeight.w600,
        lineHeight: 28,
        color: color,
      );

  /// Bubble text — both user and bot (2612:17963). 16/24 w400 in Figma; the
  /// user variant renders on orange with slightly heavier w500 in the design
  /// to keep contrast on the darker fill. We keep w500 for the user bubble
  /// and w400 for the bot bubble via the [weight] override.
  static TextStyle chatBubbleText({
    required Color color,
    FontWeight weight = FontWeight.w400,
  }) => _base(fontSize: 16, fontWeight: weight, lineHeight: 24, color: color);

  /// Typing hint line ("Aapke liye theek cheez dhoondh raha hoon…") —
  /// 14/20 w400 grey (2612:17837).
  static TextStyle chatTypingHint({Color color = AppColors.chatTypingHint}) =>
      _base(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        lineHeight: 20,
        color: color,
      );

  /// Khoj question progress label `1/6` (TAM-177, Figma `3938:26855`) —
  /// 14/20 w600 orange, sitting above the question text in the same bubble.
  static TextStyle chatKhojLabel({Color color = AppColors.chatKhojLabel}) =>
      _base(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        lineHeight: 20,
        color: color,
      );

  /// Intro video duration badge `0:27` (TAM-177, Figma `3934:14677`) —
  /// 11/14 w500 white on a translucent plate.
  static TextStyle chatVideoBadge({
    Color color = AppColors.chatVideoBadgeText,
  }) => _base(
    fontSize: 11,
    fontWeight: FontWeight.w500,
    lineHeight: 14,
    color: color,
  );

  /// Card title "Hanuman Mantra" (2612:17847 header) — 16/24 w600.
  static TextStyle chatCardTitle({Color color = AppColors.chatCardTitle}) =>
      _base(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        lineHeight: 24,
        color: color,
      );

  /// Card subtitle "Mantra · 108 baar" — 14/20 w400.
  static TextStyle chatCardSubtitle({
    Color color = AppColors.chatCardSubtitle,
  }) => _base(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    lineHeight: 20,
    color: color,
  );

  /// Card CTA "Jaap shuru karein →" — 14/20 w500 orange.
  static TextStyle chatCardCta({Color color = AppColors.chatCardCta}) => _base(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    lineHeight: 20,
    color: color,
  );

  /// Date separator "TODAY" / "27 JULY 2026" (2612:18005) — 12/16 w500
  /// grey letter-spaced (see [AppChat.dateSeparatorLetterSpacing]).
  static TextStyle chatDateSeparator({
    Color color = AppColors.chatDateSeparator,
  }) => _base(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    lineHeight: 16,
    color: color,
    letterSpacing: AppChat.dateSeparatorLetterSpacing,
  );

  /// Empty-state title "Namaste" (2612:17647) — **24/32 w600** near-black
  /// (read off the Welcome Section text node — earlier Slice-2 doc-string
  /// claimed 32/40 based on a PNG guess; live Figma is 24/32).
  static TextStyle chatEmptyTitle({Color color = AppColors.chatEmptyTitle}) =>
      _base(
        fontSize: 24,
        fontWeight: FontWeight.w600,
        lineHeight: 32,
        color: color,
      );

  /// Empty-state subtitle "Aaj kya poochhna chahenge?" — 16/24 **w500**
  /// grey `#666666`.
  static TextStyle chatEmptySubtitle({
    Color color = AppColors.chatEmptySubtitle,
  }) => _base(
    fontSize: 16,
    fontWeight: FontWeight.w500,
    lineHeight: 24,
    color: color,
  );

  /// "RECOMMENDED" label — 12/16 **w600** uppercase letter-spaced grey
  /// (Figma tracking 0.96 = [AppChat.dateSeparatorLetterSpacing]).
  static TextStyle chatEmptyRecommendedLabel({
    Color color = AppColors.chatEmptyRecommendedLabel,
  }) => _base(
    fontSize: 12,
    fontWeight: FontWeight.w600,
    lineHeight: 16,
    color: color,
    letterSpacing: AppChat.dateSeparatorLetterSpacing,
  );

  /// Recommended-chip label — 16/24 w400 near-black.
  static TextStyle chatEmptyChip({Color color = AppColors.chatEmptyChipText}) =>
      _base(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        lineHeight: 24,
        color: color,
      );

  /// Composer field placeholder + typed text — 16/24 w400.
  static TextStyle chatComposerText({
    Color color = AppColors.chatComposerText,
  }) => _base(
    fontSize: 16,
    fontWeight: FontWeight.w400,
    lineHeight: 24,
    color: color,
  );

  /// Read-only banner "Chat is not available for you right now" — 14/20 w400.
  static TextStyle chatReadOnlyBanner({
    Color color = AppColors.chatReadOnlyBanner,
  }) => _base(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    lineHeight: 20,
    color: color,
  );

  /// Inline error bubble copy — 14/20 w400 red.
  static TextStyle chatError({Color color = AppColors.chatErrorBanner}) =>
      _base(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        lineHeight: 20,
        color: color,
      );

  // ---------------------------------------------------------------------------
  // Legacy const TextStyles — used by pre-fidelity phone/OTP screens. Each
  // gets replaced by an Inter/Libre-Caslon variant as the owning screen's
  // fidelity pass lands.
  // ---------------------------------------------------------------------------
  static const TextStyle wordmark = TextStyle(
    fontSize: 48,
    fontWeight: FontWeight.w700,
    color: AppColors.white,
    letterSpacing: 1.2,
  );
  static const TextStyle screenTitle = TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.w600,
    color: AppColors.white,
  );
  static const TextStyle onOrangeBody = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: AppColors.white,
  );
  static const TextStyle legalLink = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: AppColors.white,
    decoration: TextDecoration.underline,
  );
}

/// Handy MaterialApp theme wrapper.
class AppTheme {
  AppTheme._();

  static ThemeData light() {
    final base = ThemeData.light(useMaterial3: true);
    return base.copyWith(
      scaffoldBackgroundColor: AppColors.scaffoldWarm,
      colorScheme: base.colorScheme.copyWith(
        primary: AppColors.brand300,
        secondary: AppColors.brand400,
        error: AppColors.error200,
        surface: AppColors.white,
        onSurface: AppColors.grey500,
      ),
      textTheme: GoogleFonts.interTextTheme(
        base.textTheme,
      ).apply(bodyColor: AppColors.grey500, displayColor: AppColors.grey500),
    );
  }
}

/// Kuldevta discovery flow (TAM-166). Figma frames under section
/// `3217:9467`; sourced side-by-side against the PNGs at
/// `specs/evidence/kuldevta-discovery/` because the Figma file's REST/MCP
/// budget was on a 4-day retry-after during implementation. Any raw hex
/// declared here should be re-verified via `get_variable_defs` once the
/// budget resets — the values below are gestalt-picked from the reference
/// PNGs and cross-checked against the app's existing brand ramp.
class AppKuldevta {
  AppKuldevta._();

  // ---- Layout constants ----
  static const double screenPadding = AppSpacing.medium; // 16
  static const double appBarHeight = 56;
  static const double sectionGap = AppSpacing.large; // 24
  static const double innerGap = AppSpacing.medium; // 16
  static const double tightGap = AppSpacing.small; // 12
  static const double progressBarHeight = 4;
  static const double progressBarRadius = 2;

  // ---- Wizard input ----
  static const double inputRadius = AppRadius.pill;
  static const double inputMultiLineRadius = AppRadius.card;
  static const double inputPaddingH = AppSpacing.medium;
  static const double inputPaddingV = 14;
  static const double inputMultiLineMinHeight = 96;

  // ---- CTAs ----
  static const double primaryCtaHeight = 56;
  static const double primaryCtaRadius = AppRadius.card;
  static const double secondaryCtaHeight = 56;
  static const double secondaryCtaRadius = AppRadius.card;
  static const double secondaryCtaBorderWidth = 1.5;

  // ---- Result screen ----
  /// Hero image occupies approx. top 60% of the screen (spec §Layout intent).
  static const double heroHeightFraction = 0.6;

  /// Sun-ray fallback is ~50% of the screen (spec-locked).
  static const double sunRayHeightFraction = 0.5;
  static const double resultCardOverlap = 24;
  static const double resultCardRadius = 20;
  static const double resultCardPaddingH = 20;
  static const double resultCardPaddingV = 20;
  static const double reasonCardRadius = AppRadius.card;
  static const double reasonCardPaddingH = 14;
  static const double reasonCardPaddingV = 12;
  static const double reasonCardIconSize = 24;
  static const double reasonCardIconGap = 12;
  static const double dashedDividerHeight = 20;

  // ---- Bottom actions ----
  static const double bottomActionRowHeight = 64;
  static const double shareButtonSize = 56;
  static const double shareButtonRadius = 14;

  // ---- Loading screen ----
  static const double loadingSpinnerSize = 96;
  static const double loadingSubtitleGap = AppSpacing.large;

  // ---- Chat persona header ----
  static const double personaAvatarSize = 40;
  static const double personaAvatarGap = AppSpacing.small;

  // ---- Colours ----
  /// Result-screen decorative card fill (Figma cream — close to brand100 in
  /// the reference PNGs). Kept its own token so a Figma re-inspection can
  /// swap it without touching brand ramp aliases.
  static const Color resultCardFill = AppColors.white;

  /// Reason card fill — the cream/peach tint in `Bg Image + Name.png`.
  static const Color reasonCardFill = Color(0xFFFFF5E8);
  static const Color reasonCardIconTint = AppColors.brand400;

  /// Deity name in the result card (`nameRoman`) — deep orange serif.
  static const Color deityNameColor = AppColors.brand400;

  /// Location line below the deity name.
  static const Color locationColor = AppColors.grey400;

  /// Dashed divider stroke for the "Ye aapki kuldevi kyu he?" header.
  static const Color dashedDivider = AppColors.brand400;

  /// Green square share button — the WhatsApp glyph square.
  static const Color shareButtonFill = Color(0xFF25D366);

  /// Wizard input border + subtitle helper text.
  static const Color inputBorder = AppColors.grey200;
  static const Color inputPlaceholder = AppColors.grey300;
  static const Color helperText = AppColors.grey400;

  /// Sun-ray fallback backdrop tint.
  static const Color sunRayBackdrop = AppColors.brand100;
  static const Color sunRay = AppColors.brand300;

  // ---------------------------------------------------------------------
  // Result card OVERLAY (TAM-177, Figma `3975:24204` — "Kudevta Khoj -
  // Chat version"). Distinct from the TAM-166 result SCREEN constants
  // above: the overlay floats over the live chat thread rather than
  // occupying a route, so it has its own insets, radius and artwork box.
  // Every value below is read off the node tree, not eyeballed.
  // ---------------------------------------------------------------------

  /// Dim behind the floating card. `#000000` @ 60% — derived from the
  /// Phase-0 render: the status-bar and composer zones sample
  /// `rgb(102,102,102)` over the chat's white surface ⇒ 1 - 102/255 = 0.6.
  static const Color resultOverlayScrim = Color(0x99000000);

  /// Overlay insets (node `3975:24540`, VERTICAL auto-layout on the
  /// 360×800 frame). The card does NOT bleed to the status bar — it
  /// floats, with the dimmed app bar above and the dimmed composer below
  /// still visible.
  ///
  /// Top is the node's declared 70. Bottom is DERIVED, not declared: the
  /// node declares `paddingBottom: 110`, but its child hugs at 663 tall
  /// from y=70, so the padding never binds and the real gap under the
  /// card is 800 − 70 − 663 = 67. Using the declared 110 would cap the
  /// card 43 dp short and force it to scroll at 800 dp, which the design
  /// does not do.
  static const double resultOverlayPaddingTop = 70;
  static const double resultOverlayPaddingBottom = 67;

  /// The floating card itself (node `3975:24541`, 328×663, r24).
  static const double resultOverlayRadius = 24;

  /// Deity artwork bounding box 328×335 (node `3975:24542`). Expressed as
  /// an aspect ratio rather than a screen-height fraction so the artwork
  /// keeps its proportions inside the inset card at every device height.
  static const double resultOverlayArtworkAspect = 328 / 335;

  /// Sun-ray fallback keeps TAM-166's 5:6 ratio against the image variant
  /// (`sunRayHeightFraction / heroHeightFraction`): 335 × 5 / 6 ≈ 279.
  static const double resultOverlaySunRayAspect = 328 / 279;

  /// Dashed header → reason list gap (node `3975:24546`, itemSpacing 12).
  static const double resultOverlayDashedGap = 12;

  /// Reason-card → reason-card gap (node `3975:24552`, itemSpacing 6).
  static const double resultOverlayReasonGap = 6;

  /// Primary CTA (node `3975:24572` "Main Buttons"): r8, gradient
  /// `brand400 → brand300`. Its HEIGHT is deliberately not a token —
  /// the CTA uses `minHeight: primaryCtaHeight` so it grows with text
  /// scale instead of clipping.
  static const double resultOverlayCtaRadius = 8;
}
