import 'package:flutter/material.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/theme.dart';

/// Plan tabs "pill" selector — Figma node `493:4823;493:4492` "Switcher".
///
/// Wrapper: 328 wide, `Colors/Brand/200` bg, radius 8, padding 8.
/// Contains a row of tab pills, each 102.667 wide; the selected pill sits on
/// a `Colors/Brand/400` bg with white text, others transparent bg with
/// `Colors/Grey/500` text. Inter SemiBold 12/20.
///
/// Used by the `card_hero` variant only — v2 has no plan card, v3/v4 use the
/// compact trial section instead.
class PaywallPlanTabsPill extends StatelessWidget {
  const PaywallPlanTabsPill({
    super.key,
    required this.plans,
    required this.selectedPlanId,
    required this.onSelect,
  });

  final List<PaywallPlanDisplay> plans;
  final String selectedPlanId;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('paywall-plan-tabs'),
      padding: const EdgeInsets.all(AppSpacing.xSmall),
      decoration: BoxDecoration(
        color: AppColors.brand200,
        borderRadius: BorderRadius.circular(AppRadius.button),
      ),
      child: Row(
        children: <Widget>[
          for (final plan in plans)
            Expanded(
              child: _PlanTab(
                planId: plan.planId,
                label: plan.localizedLabel,
                isSelected: plan.planId == selectedPlanId,
                onTap: () => onSelect(plan.planId),
              ),
            ),
        ],
      ),
    );
  }
}

class _PlanTab extends StatelessWidget {
  const _PlanTab({
    required this.planId,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  final String planId;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: Key('paywall-plan-tab-$planId'),
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 32,
        decoration: BoxDecoration(
          color: isSelected ? AppColors.brand400 : Colors.transparent,
          borderRadius: BorderRadius.circular(AppRadius.button),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 12,
            fontWeight: FontWeight.w600,
            height: 20 / 12,
            color: isSelected ? AppColors.white : AppColors.grey500,
          ),
        ),
      ),
    );
  }
}
