import 'package:flutter/material.dart';

import '../../../../core/theme.dart';
import '../../domain/kuldevta_result.dart';

/// The "name plate" that overlaps the deity artwork upward — `nameRoman`
/// plus the optional server-joined `location` line ("Nagana, Barmer,
/// Rajasthan").
///
/// Lifted verbatim (geometry + tokens) out of the now-deleted
/// `kuldevta_result_screen.dart`'s private `_DeityCard` so the result
/// **card overlay** (TAM-177, Figma `3975:24204` → node `3975:24575`) can
/// reuse it without reimplementing it.
///
/// The upward overlap is [AppKuldevta.resultCardOverlap] applied with
/// `Transform.translate`, which is PAINT-ONLY: the widget still occupies
/// its full intrinsic height in the parent `Column`, so the translate
/// doubles as the gap to whatever follows it. Callers should therefore not
/// add their own top padding to the next sibling.
///
/// Known Figma deltas carried forward from TAM-166 (logged, not fixed here
/// — fixing them changes the widget's geometry, which the TAM-177 lift was
/// explicitly scoped not to do): node `3975:24575` uses an 8dp radius, an
/// `#FE8A02` 1px border, four orange corner-ornament vectors and a
/// 47dp lift; this lift renders the TAM-166 white/20dp/shadow/24dp plate.
class KuldevtaDeityCard extends StatelessWidget {
  const KuldevtaDeityCard({super.key, required this.result});

  final KuldevtaResult result;

  @override
  Widget build(BuildContext context) {
    final location = result.location;
    return Transform.translate(
      offset: const Offset(0, -AppKuldevta.resultCardOverlap),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppKuldevta.screenPadding,
        ),
        child: Container(
          decoration: BoxDecoration(
            color: AppKuldevta.resultCardFill,
            borderRadius: BorderRadius.circular(AppKuldevta.resultCardRadius),
            boxShadow: <BoxShadow>[
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.08),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          padding: const EdgeInsets.symmetric(
            horizontal: AppKuldevta.resultCardPaddingH,
            vertical: AppKuldevta.resultCardPaddingV,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                result.nameRoman,
                key: const Key('kuldevta-result-name'),
                textAlign: TextAlign.center,
                style: AppText.headingSm(color: AppKuldevta.deityNameColor),
              ),
              if (location != null && location.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.xxxSmall),
                  child: Text(
                    location,
                    key: const Key('kuldevta-result-location'),
                    textAlign: TextAlign.center,
                    style: AppText.bodySm(color: AppKuldevta.locationColor),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
