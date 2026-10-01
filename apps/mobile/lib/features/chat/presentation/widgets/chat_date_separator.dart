import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme.dart';

/// Centred date separator rendered between transcript messages > N minutes
/// apart (Figma `2612:18005`). "TODAY" / "YESTERDAY" for the current +
/// previous day; "27 JULY 2026" for anything older.
class ChatDateSeparator extends StatelessWidget {
  const ChatDateSeparator({super.key, required this.timestamp});

  final DateTime timestamp;

  @override
  Widget build(BuildContext context) {
    final label = _label(timestamp);
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: AppChat.dateSeparatorPaddingV,
      ),
      child: Center(child: Text(label, style: AppText.chatDateSeparator())),
    );
  }

  /// Compute the display label. Kept static so callers (chat_transcript's
  /// date-separator insertion) can share the exact same rule.
  static String _label(DateTime ts) {
    final local = ts.toLocal();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final tsDay = DateTime(local.year, local.month, local.day);
    final diffDays = today.difference(tsDay).inDays;
    if (diffDays == 0) return 'TODAY';
    if (diffDays == 1) return 'YESTERDAY';
    // Figma uses long day+month+year, all caps (e.g. "27 JULY 2026").
    return DateFormat("d MMMM y").format(local).toUpperCase();
  }
}
