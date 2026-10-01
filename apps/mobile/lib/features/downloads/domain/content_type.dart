/// Content-type discriminator used by the Downloads module — mirrors the
/// server-side Zod enum in `apps/api/src/core/downloads/routes/downloads.schemas.ts`
/// (`aarti | bhajan | mantra`). The wire value is the client display label
/// AND the manifest lookup discriminator (per the spec's `#PLAN_UNCERTAINTY`
/// note — aarti + bhajan share `AudioItem` server-side; mantra hits the
/// separate `MantraAudioItem` table).
///
/// Kept as a pure enum with `fromWire` / `wire` so the presentation layer
/// (filter chips + row subtitle) can render display labels through a `switch`
/// without ever comparing bare strings.
enum DownloadContentType {
  aarti('aarti', 'Aarti'),
  bhajan('bhajan', 'Bhajan'),
  mantra('mantra', 'Mantra');

  const DownloadContentType(this.wire, this.displayLabel);

  /// Wire value — hits the backend path `/content/:type/:id/download`
  /// (spec §Backend endpoint contract). Also the analytics `content_type`
  /// value on every downloads event (Sheet 1 rows 130–141).
  final String wire;

  /// Human label rendered in the row's `type · duration · size` subtitle
  /// (filter chip labels use the plural on the chip itself, via
  /// [DownloadContentTypeX.pluralLabel]).
  final String displayLabel;

  static DownloadContentType? fromWire(String? wire) {
    if (wire == null) return null;
    for (final t in DownloadContentType.values) {
      if (t.wire == wire) return t;
    }
    return null;
  }
}

/// Pluralised label for the filter-chip row (Figma `2632:21376` — "Aarti"
/// chip labelled "Aarti", "Bhajan" chip labelled "Bhajan", "Mantra" chip
/// labelled "Mantra" per the design — but reserved here for future plural
/// UI callers who want "Aartis / Bhajans / Mantras" strings without
/// touching the presentation layer).
extension DownloadContentTypeX on DownloadContentType {
  String get pluralLabel {
    switch (this) {
      case DownloadContentType.aarti:
        return 'Aarti';
      case DownloadContentType.bhajan:
        return 'Bhajan';
      case DownloadContentType.mantra:
        return 'Mantra';
    }
  }
}
