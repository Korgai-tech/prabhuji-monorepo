// TAM-77 — the mechanical analytics drift gate.
//
// Compares THREE sets and fails (exit 1) on any disagreement:
//
//   1. CATALOG  — event names fenced in docs/ANALYTICS-MODULES.md (the single
//                 source of truth; product owns it).
//   2. DEFINED  — `static const String x = 'name';` in the 8 module
//                 `lib/features/*/*_analytics.dart` classes.
//   3. FIRED    — names reaching `Analytics.trackEvent` from a real call site
//                 anywhere under `lib/` (module code, the shell, the router).
//
// Drift caught in BOTH directions:
//   * catalog event not DEFINED            → the code never got written.
//   * catalog event DEFINED but not FIRED  → a dead constant (the TAM-77 bug
//                                            class: a name that exists but no
//                                            user action ever emits).
//   * module event FIRED/DEFINED but not in the catalog → undocumented drift.
//
// There is NO allowlist. Scope is defined structurally, not by exception list:
// the catalog covers the 8 Phase-1 feature modules (the 8 name prefixes below).
// Onboarding/paywall events (`onboarding_*`, `paywall_*`) are TAM-55's scope and
// are documented in docs/ANALYTICS-ONBOARDING-PAYWALL.md — they are not silently
// skipped, they are a different catalog.
//
// Run: dart run tool/analytics_audit.dart   (from apps/mobile)
//      scripts/analytics-audit.sh           (from the repo root; CI entry point)

import 'dart:io';

/// The 8 Phase-1 module prefixes this catalog governs. A fired event matching
/// one of these MUST be in the catalog; anything else is out of scope.
const List<String> kModulePrefixes = [
  'home_',
  'aarti_bhajans_',
  'mantras_',
  'ringtone_',
  'wallpaper_',
  'status_',
  'horoscope_',
  'books_',
  'book_',
];

const String kCatalogPath = '../../docs/ANALYTICS-MODULES.md';
const String kLibDir = 'lib';

void main(List<String> args) {
  final root = Directory.current;
  final catalogFile = File('${root.path}/$kCatalogPath');
  if (!catalogFile.existsSync()) {
    _fail('Catalog not found at ${catalogFile.path}. '
        'Run this from apps/mobile (or via scripts/analytics-audit.sh).');
  }

  final catalog = parseCatalog(catalogFile.readAsStringSync());
  if (catalog.isEmpty) {
    _fail('Catalog parsed to 0 events — the fences in ${catalogFile.path} are '
        'missing or malformed. Refusing to pass a toothless audit.');
  }

  final dartFiles = Directory('${root.path}/$kLibDir')
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'))
      .toList()
    ..sort((a, b) => a.path.compareTo(b.path));

  final defined = <String, String>{}; // event name -> defining file
  final constToName = <String, String>{}; // "RingtoneEvents.cardTapped" -> name
  for (final file in dartFiles) {
    if (!_isAnalyticsDefFile(file.path)) continue;
    final src = stripComments(file.readAsStringSync());
    for (final entry in parseDefinitions(src).entries) {
      constToName[entry.key] = entry.value;
      final name = entry.value;
      if (_isModuleEvent(name)) {
        defined[name] = _rel(file.path, root.path);
      }
    }
  }

  final fired = <String, List<String>>{}; // event name -> call sites
  for (final file in dartFiles) {
    // The seam itself defines trackEvent; its own doc/impl is not a call site.
    if (file.path.endsWith('core/analytics.dart')) continue;
    final src = stripComments(file.readAsStringSync());
    for (final site in findDispatches(src, constToName)) {
      (fired[site.event] ??= []).add('${_rel(file.path, root.path)}:${site.line}');
    }
  }

  // --- the three checks ------------------------------------------------------
  final missingDefinition = <String>[];
  final neverFired = <String>[];
  for (final event in catalog) {
    if (!defined.containsKey(event)) {
      missingDefinition.add(event);
      continue;
    }
    if (!fired.containsKey(event)) neverFired.add(event);
  }

  final undocumented = <String>[];
  for (final name in {...defined.keys, ...fired.keys}) {
    if (!_isModuleEvent(name)) continue; // out of catalog scope (TAM-55 etc.)
    if (!catalog.contains(name)) undocumented.add(name);
  }

  missingDefinition.sort();
  neverFired.sort();
  undocumented.sort();

  final verbose = args.contains('--verbose');
  if (verbose) {
    for (final event in catalog) {
      final sites = fired[event];
      stdout.writeln('  ${sites == null ? "MISS" : "ok  "}  $event'
          '${sites == null ? "" : "  ← ${sites.first}"}');
    }
  }

  final failures = <String>[];
  if (missingDefinition.isNotEmpty) {
    failures.add(_section(
      'Catalog events with NO constant defined '
      '(${missingDefinition.length}) — the code was never written:',
      missingDefinition.map((e) => e).toList(),
    ));
  }
  if (neverFired.isNotEmpty) {
    failures.add(_section(
      'Catalog events DEFINED but NEVER FIRED (${neverFired.length}) — dead '
      'constants; no user action emits these:',
      neverFired.map((e) => '$e   (defined in ${defined[e]})').toList(),
    ));
  }
  if (undocumented.isNotEmpty) {
    failures.add(_section(
      'Events in the code but NOT in the catalog (${undocumented.length}) — '
      'add them to docs/ANALYTICS-MODULES.md or remove them:',
      undocumented
          .map((e) => '$e   (${fired[e]?.first ?? "defined in ${defined[e]}"})')
          .toList(),
    ));
  }

  stdout.writeln('');
  stdout.writeln('analytics audit — catalog: ${catalog.length} events, '
      'defined: ${defined.length}, fired: ${fired.keys.where(_isModuleEvent).length}');

  if (failures.isEmpty) {
    stdout.writeln('PASS: every catalog event is defined and fired from a real '
        'call site; no undocumented module events.');
    exit(0);
  }
  stderr.writeln('');
  stderr.writeln('FAIL: analytics catalog drift detected.');
  for (final f in failures) {
    stderr.writeln('');
    stderr.writeln(f);
  }
  stderr.writeln('');
  stderr.writeln('The catalog (docs/ANALYTICS-MODULES.md) is the source of '
      'truth. Fix the code, or change the catalog deliberately.');
  exit(1);
}

// --- catalog ----------------------------------------------------------------

/// Reads ONLY the fenced regions:
///
///     <!-- analytics-catalog:begin module=ringtone -->
///     | `ringtone_module_opened` | ... |
///     <!-- analytics-catalog:end -->
///
/// so prose, mapping tables and the "dropped from the catalog" tables can name
/// events without accidentally becoming catalog entries.
Set<String> parseCatalog(String markdown) {
  final events = <String>{};
  final fence = RegExp(
    r'<!--\s*analytics-catalog:begin[^>]*-->(.*?)<!--\s*analytics-catalog:end\s*-->',
    dotAll: true,
  );
  // First column code span of a table row: | `event_name` | ...
  final row = RegExp(r'^\|\s*`([a-z][a-z0-9_]*)`\s*\|', multiLine: true);
  for (final block in fence.allMatches(markdown)) {
    for (final m in row.allMatches(block.group(1)!)) {
      events.add(m.group(1)!);
    }
  }
  return events;
}

// --- dart parsing -----------------------------------------------------------

bool _isAnalyticsDefFile(String path) =>
    RegExp(r'lib/features/[^/]+/[a-z_]+_analytics\.dart$').hasMatch(path);

bool _isModuleEvent(String name) =>
    kModulePrefixes.any((p) => name.startsWith(p));

/// `ClassName.fieldName` -> literal event name, for every
/// `static const String field = 'value';` in an EVENT class.
///
/// Only `*Events` classes hold event names; the sibling `*Props`/`*EventProps`
/// classes hold property keys (`content_id`, `font_size`) and must never be
/// mistaken for events.
Map<String, String> parseDefinitions(String src) {
  final out = <String, String>{};
  final classDecl = RegExp(r'\bclass\s+(\w+)');
  final constDecl =
      RegExp(r"static\s+const\s+String\s+(\w+)\s*=\s*'([^']*)'\s*;");
  final classes = classDecl.allMatches(src).toList();
  for (final m in constDecl.allMatches(src)) {
    // Owning class = the nearest class declaration before this const.
    String? owner;
    for (final c in classes) {
      if (c.start < m.start) {
        owner = c.group(1);
      } else {
        break;
      }
    }
    if (owner == null || !owner.endsWith('Events')) continue;
    out['$owner.${m.group(1)}'] = m.group(2)!;
  }
  return out;
}

class Dispatch {
  Dispatch(this.event, this.line);
  final String event;
  final int line;
}

/// Every event name reaching `trackEvent` from this source.
///
/// Handles the three shapes the codebase actually uses:
///   * `trackEvent(RingtoneEvents.cardTapped, properties: {...})`
///   * `trackEvent(nextLiked ? Events.likeTapped : Events.likeRemoved)` (ternary)
///   * `_track(ref, MantrasEvents.sectionShowAllTapped, {...})` — a forwarder.
///
/// Forwarders are DISCOVERED, not hardcoded: any function whose body passes one
/// of its own parameters as trackEvent's first argument is a tracking forwarder,
/// and that parameter's index is where its callers put the event name.
List<Dispatch> findDispatches(String src, Map<String, String> constToName) {
  final out = <Dispatch>[];

  void collect(String argExpr, int offset) {
    for (final m in RegExp(r'\b(\w+\.\w+)\b').allMatches(argExpr)) {
      final name = constToName[m.group(1)!];
      if (name != null) out.add(Dispatch(name, _lineAt(src, offset)));
    }
    for (final m in RegExp(r"'([a-z][a-z0-9_]*)'").allMatches(argExpr)) {
      out.add(Dispatch(m.group(1)!, _lineAt(src, offset)));
    }
  }

  // Direct trackEvent(...) sites.
  for (final call in _findCalls(src, 'trackEvent')) {
    final args = _splitArgs(call.args);
    if (args.isEmpty) continue;
    collect(args.first, call.start);
  }

  // Forwarders: name -> index of the parameter carrying the event name.
  for (final entry in _findForwarders(src).entries) {
    for (final call in _findCalls(src, entry.key)) {
      final args = _splitArgs(call.args);
      if (entry.value >= args.length) continue;
      collect(args[entry.value], call.start);
    }
  }
  return out;
}

Map<String, int> _findForwarders(String src) {
  final out = <String, int>{};
  final decl = RegExp(r'\b(\w+)\s*\(([^()]*)\)\s*(?:async\s*)?\{');
  for (final m in decl.allMatches(src)) {
    final name = m.group(1)!;
    if (name == 'trackEvent' || _dartKeywords.contains(name)) continue;
    final body = _balanced(src, m.end - 1, '{', '}');
    if (body == null) continue;
    final params = _splitArgs(m.group(2)!)
        .map((p) => RegExp(r'(\w+)\s*$').firstMatch(p.trim())?.group(1))
        .toList();
    for (final call in _findCalls(body, 'trackEvent')) {
      final args = _splitArgs(call.args);
      if (args.isEmpty) continue;
      final idx = params.indexOf(args.first.trim());
      if (idx >= 0) out[name] = idx;
    }
  }
  return out;
}

const Set<String> _dartKeywords = {
  'if', 'for', 'while', 'switch', 'catch', 'return', 'else', 'do', 'try'
};

class _Call {
  _Call(this.args, this.start);
  final String args;
  final int start;
}

/// Every `name(` call in [src], with its parenthesis-balanced argument source.
List<_Call> _findCalls(String src, String name) {
  final out = <_Call>[];
  // Must match the real shape `_analytics?.trackEvent(` — so a preceding `.` is
  // allowed; only a word char (another identifier) disqualifies.
  final pattern = RegExp('(?<!\\w)${RegExp.escape(name)}\\s*\\(');
  for (final m in pattern.allMatches(src)) {
    final args = _balanced(src, m.end - 1, '(', ')');
    if (args != null) out.add(_Call(args, m.start));
  }
  return out;
}

/// Contents between [open] at [openIndex] and its matching [close]. String-aware
/// so a bracket inside a literal can't unbalance the scan.
String? _balanced(String src, int openIndex, String open, String close) {
  var depth = 0;
  for (var i = openIndex; i < src.length; i++) {
    final ch = src[i];
    if (ch == "'" || ch == '"') {
      i = _skipString(src, i);
      continue;
    }
    if (ch == open) depth++;
    if (ch == close) {
      depth--;
      if (depth == 0) return src.substring(openIndex + 1, i);
    }
  }
  return null;
}

/// Splits an argument source at TOP-LEVEL commas only, so nested maps, generics
/// and ternaries stay in one piece.
List<String> _splitArgs(String args) {
  final out = <String>[];
  var depth = 0;
  var start = 0;
  for (var i = 0; i < args.length; i++) {
    final ch = args[i];
    if (ch == "'" || ch == '"') {
      i = _skipString(args, i);
      continue;
    }
    if ('([{<'.contains(ch)) depth++;
    if (')]}>'.contains(ch)) depth--;
    if (ch == ',' && depth == 0) {
      out.add(args.substring(start, i));
      start = i + 1;
    }
  }
  final last = args.substring(start).trim();
  if (last.isNotEmpty) out.add(last);
  return out.map((a) => a.trim()).where((a) => a.isNotEmpty).toList();
}

/// Index of the closing quote of the string starting at [i].
int _skipString(String src, int i) {
  final quote = src[i];
  final triple = src.startsWith(quote * 3, i);
  final raw = i > 0 && src[i - 1] == 'r';
  if (triple) {
    final end = src.indexOf(quote * 3, i + 3);
    return end == -1 ? src.length : end + 2;
  }
  for (var j = i + 1; j < src.length; j++) {
    if (!raw && src[j] == r'\') {
      j++;
      continue;
    }
    if (src[j] == quote) return j;
    if (src[j] == '\n') return j; // unterminated — bail rather than run away
  }
  return src.length;
}

/// Blanks out comments while preserving offsets and string literals — a naive
/// strip would maul `'prabhuji://ringtones/preview/42'`.
String stripComments(String src) {
  final out = StringBuffer();
  var i = 0;
  while (i < src.length) {
    final ch = src[i];
    if (ch == "'" || ch == '"') {
      final end = _skipString(src, i);
      out.write(src.substring(i, (end + 1).clamp(0, src.length)));
      i = end + 1;
      continue;
    }
    if (src.startsWith('//', i)) {
      final nl = src.indexOf('\n', i);
      final end = nl == -1 ? src.length : nl;
      out.write(' ' * (end - i));
      i = end;
      continue;
    }
    if (src.startsWith('/*', i)) {
      final close = src.indexOf('*/', i + 2);
      final end = close == -1 ? src.length : close + 2;
      for (var k = i; k < end; k++) {
        out.write(src[k] == '\n' ? '\n' : ' '); // keep line numbers honest
      }
      i = end;
      continue;
    }
    out.write(ch);
    i++;
  }
  return out.toString();
}

int _lineAt(String src, int offset) =>
    '\n'.allMatches(src.substring(0, offset.clamp(0, src.length))).length + 1;

String _rel(String path, String root) =>
    path.startsWith(root) ? path.substring(root.length + 1) : path;

String _section(String title, List<String> lines) =>
    '  $title\n${lines.map((l) => '    - $l').join('\n')}';

Never _fail(String message) {
  stderr.writeln('FAIL: $message');
  exit(1);
}
