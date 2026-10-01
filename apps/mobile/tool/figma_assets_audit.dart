// TAM-56 — the mechanical "every icon came from Figma" gate (Design Fidelity
// Gate). This is the check that makes the STRICT no-invented-art rule provable
// rather than promised.
//
// tools/figma-assets.manifest.json records, per committed asset, the Figma node
// it was DOWNLOADED from. This gate holds the manifest and the asset tree to
// each other, in BOTH directions:
//
//   1. UNMANIFESTED — a file under apps/mobile/assets/ with no manifest entry.
//      An asset nobody can trace to a node is, as far as review can tell, drawn
//      by hand. This is the invented-art bug class.
//   2. PHANTOM      — a manifest entry whose file does not exist. Provenance for
//      art we do not ship: the manifest has drifted and its claims are stale.
//   3. INCOMPLETE   — an entry missing `node`, `fileKey` or `format`, or with an
//      empty/placeholder node. An entry that proves nothing is worse than none,
//      because it looks like proof.
//
// SCOPE — stated honestly, because this gate's whole value is that it does not
// lie about what it covers:
//
//   * assets/fonts/ is EXCLUDED, structurally: those are licensed typeface
//     binaries (Inter, Libre Caslon) bundled so google_fonts resolves offline.
//     A typeface is not a Figma node and can never have a node id. Not debt.
//
//   * kPreManifestDebt pins the 23 assets committed by TAM-49..59, BEFORE the
//     manifest existed (it arrived with the export pipeline in TAM-60). Their
//     commits say they came from Figma Dev Mode, but their node ids were never
//     recorded, and this gate will not invent them — fabricating provenance is
//     precisely the sin it exists to catch.
//
//     This pin is a RATCHET, not an allowlist. The set is pinned by exact path,
//     so the debt can only ever SHRINK:
//       - a NEW file in those dirs is NOT covered and FAILS (rule 1);
//       - manifesting a pinned file properly FAILS as a stale pin, forcing the
//         list to shrink (rule 4);
//       - deleting a pinned file FAILS the same way.
//     Every run prints the outstanding debt count. Clear it by re-exporting the
//     23 through tools/figma-export.ts to capture their real node ids.
//
// Run: dart run tool/figma_assets_audit.dart   (from apps/mobile)
//      scripts/figma-tokens-committed.sh       (from the repo root; CI entry)

import 'dart:convert';
import 'dart:io';

const String kManifestPath = '../../tools/figma-assets.manifest.json';
const String kAssetsDir = 'assets';

/// Repo-relative prefix the manifest uses for asset paths.
const String kAssetPrefix = 'apps/mobile/assets/';

/// Structural exclusion — typeface binaries are not Figma nodes. See header.
const List<String> kNonNodeDirs = ['apps/mobile/assets/fonts/'];

/// TAM-49..59 assets committed before the manifest existed. RATCHET: shrink-only,
/// never extend. See the header before touching this list.
const List<String> kPreManifestDebt = [
  // TAM-59 — shared audio engine + mini-player glyphs.
  'apps/mobile/assets/audio/close.svg',
  'apps/mobile/assets/audio/pause.svg',
  'apps/mobile/assets/audio/play.svg',
  'apps/mobile/assets/audio/skip-next.svg',
  'apps/mobile/assets/audio/skip-prev.svg',
  // TAM-49 — splash brand logo composite pieces.
  'apps/mobile/assets/logo/logo-arch.svg',
  'apps/mobile/assets/logo/logo-base.svg',
  'apps/mobile/assets/logo/logo-flag.svg',
  'apps/mobile/assets/logo/logo-om.svg',
  'apps/mobile/assets/logo/logo-vector.svg',
  // TAM-50..52 — phone-choice / phone-input / OTP / name-language glyphs.
  'apps/mobile/assets/onboarding/checkbox-check.svg',
  'apps/mobile/assets/onboarding/exclamation.svg',
  'apps/mobile/assets/onboarding/language-check.svg',
  'apps/mobile/assets/onboarding/mobile-notch.svg',
  'apps/mobile/assets/onboarding/security-shield.svg',
  // TAM-53 — paywall.
  'apps/mobile/assets/paywall/benefit-check.svg',
  'apps/mobile/assets/paywall/cross.svg',
  'apps/mobile/assets/paywall/dropdown-chevron.svg',
  'apps/mobile/assets/paywall/gpay-icon.png',
  'apps/mobile/assets/paywall/om-right.svg',
  'apps/mobile/assets/paywall/om.svg',
  'apps/mobile/assets/paywall/sparkle.png',
  'apps/mobile/assets/paywall/trial-check.svg',
];

/// A node id that would prove nothing.
bool _isPlaceholderNode(String node) {
  final n = node.trim();
  if (n.isEmpty) return true;
  return const ['tbd', 'todo', 'unknown', 'n/a', 'none', '?']
      .contains(n.toLowerCase());
}

void main(List<String> args) {
  final root = Directory.current;

  final manifestFile = File('${root.path}/$kManifestPath');
  if (!manifestFile.existsSync()) {
    _fail('Manifest not found at ${manifestFile.path}. Run this from '
        'apps/mobile (or via scripts/figma-tokens-committed.sh).');
  }

  final Map<String, dynamic> manifest =
      jsonDecode(manifestFile.readAsStringSync()) as Map<String, dynamic>;
  final entries = (manifest['assets'] as List<dynamic>? ?? <dynamic>[])
      .cast<Map<String, dynamic>>();
  if (entries.isEmpty) {
    _fail('Manifest parsed to 0 assets — it is missing or malformed. '
        'Refusing to pass a toothless audit.');
  }

  final assetsDir = Directory('${root.path}/$kAssetsDir');
  if (!assetsDir.existsSync()) {
    _fail('No $kAssetsDir/ here. Run this from apps/mobile.');
  }

  // --- the asset tree, as repo-relative paths --------------------------------
  final onDisk = assetsDir
      .listSync(recursive: true)
      .whereType<File>()
      .map((f) => '$kAssetPrefix${_rel(f.path, assetsDir.path)}')
      .where((p) => !kNonNodeDirs.any(p.startsWith))
      .toSet();

  final manifested = <String>{};
  final incomplete = <String>[];
  for (final e in entries) {
    final asset = (e['asset'] as String?)?.trim() ?? '';
    if (asset.isEmpty) {
      incomplete.add('(entry with no "asset" field)');
      continue;
    }
    manifested.add(asset);
    final missingFields = <String>[
      for (final f in ['node', 'fileKey', 'format'])
        if ((e[f] as String?)?.trim().isEmpty ?? true) f,
    ];
    if (missingFields.isNotEmpty) {
      incomplete.add('$asset — missing ${missingFields.join(", ")}');
    } else if (_isPlaceholderNode(e['node'] as String)) {
      incomplete.add('$asset — placeholder node "${e['node']}"');
    }
  }

  final debt = kPreManifestDebt.toSet();

  // 1. UNMANIFESTED — on disk, no entry, not pinned debt.
  final unmanifested = onDisk.difference(manifested).difference(debt).toList()
    ..sort();

  // 2. PHANTOM — manifest entry with no file.
  final phantom = manifested
      .where((p) => !File('${root.path}/../../$p').existsSync())
      .toList()
    ..sort();

  // 4. STALE PIN — debt entry that is now manifested, or gone from disk. Keeps
  //    the ratchet honest: the list must shrink as the debt is paid.
  final stalePins = debt
      .where((p) => manifested.contains(p) || !onDisk.contains(p))
      .toList()
    ..sort();

  incomplete.sort();

  stdout.writeln('');
  stdout.writeln('figma-tokens-committed — ${manifested.length} manifest '
      'entries, ${onDisk.length} node-eligible assets on disk');
  stdout.writeln('  excluded (not Figma nodes): ${kNonNodeDirs.join(", ")}');
  stdout.writeln('  pre-manifest debt outstanding (TAM-49..59, shrink-only): '
      '${debt.length} assets');

  final failures = <String>[];
  if (unmanifested.isNotEmpty) {
    failures.add(_section(
      'Assets with NO provenance entry (${unmanifested.length}) — nothing '
      'proves these came from Figma rather than being hand-drawn:',
      unmanifested,
    ));
  }
  if (phantom.isNotEmpty) {
    failures.add(_section(
      'Manifest entries pointing at MISSING files (${phantom.length}) — stale '
      'provenance claims:',
      phantom,
    ));
  }
  if (incomplete.isNotEmpty) {
    failures.add(_section(
      'Manifest entries that prove nothing (${incomplete.length}) — an entry '
      'without a real node/fileKey/format only looks like proof:',
      incomplete,
    ));
  }
  if (stalePins.isNotEmpty) {
    failures.add(_section(
      'Stale pre-manifest pins (${stalePins.length}) — these are now manifested '
      'or deleted; remove them from kPreManifestDebt in '
      'tool/figma_assets_audit.dart so the ratchet reflects reality:',
      stalePins,
    ));
  }

  if (failures.isEmpty) {
    stdout.writeln('PASS: every committed asset outside the pinned '
        'pre-manifest debt traces to a Figma node.');
    exit(0);
  }

  stderr.writeln('');
  stderr.writeln('FAIL: Figma asset provenance drift detected.');
  for (final f in failures) {
    stderr.writeln('');
    stderr.writeln(f);
  }
  stderr.writeln('');
  stderr.writeln('Export assets with `pnpm figma:export` (tools/figma-export.ts) '
      'so the manifest records the node they came from.');
  stderr.writeln('Never hand-write an entry for art you did not download — a '
      'fabricated node defeats the entire gate.');
  exit(1);
}

String _rel(String path, String root) =>
    path.startsWith(root) ? path.substring(root.length + 1) : path;

String _section(String title, List<String> lines) =>
    '  $title\n${lines.map((l) => '    - $l').join('\n')}';

Never _fail(String message) {
  stderr.writeln('FAIL: $message');
  exit(1);
}
