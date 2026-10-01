// TAM-56 — the mechanical "no raw colour literals" gate (Design Fidelity Gate).
//
// The STRICT rule every FE ticket's DoD cites: a colour rendered by this app
// must come from a token in lib/core/theme.dart, whose dartdoc cites the Figma
// node/variable it was extracted from. A colour spelled at the call site has no
// provenance — nobody can tell whether it came from the design or from a
// developer's eye. This gate makes that mechanical instead of a review promise.
//
// SANCTIONED HOME: lib/core/theme.dart — the ONE file allowed to hold colour
// literals (AppColors / AppGradient). Everything else under lib/ must reference
// a token.
//
// FAILS (exit 1) on, anywhere under lib/ except the sanctioned home:
//
//   1. HEX INT      — `0xRRGGBB` / `0xAARRGGBB`, i.e. `Color(0xFFFE8A02)` or a
//                     bare hex int. The raw-colour spelling.
//   2. LITERAL Color — `Color.fromARGB(255, 216, 58, 0)` /
//                     `Color.fromRGBO(...)` where EVERY argument is a numeric
//                     literal. This is the decimal spelling of rule 1 and closes
//                     the otherwise trivial bypass.
//   3. HEX STRING   — `'#RRGGBB'` / `'#AARRGGBB'` inside a string literal (a
//                     colour smuggled through as text).
//
// Comments are stripped before scanning (shared with the analytics gate), so
// documenting `// #FC7304 (node 285:3545)` above a token is encouraged, not
// punished — the provenance notes ARE the point.
//
// THERE IS NO ALLOWLIST. Scope is structural: one sanctioned file, everything
// else must tokenise. If a colour genuinely cannot be a token, that is a design
// conversation, not a suppression comment.
//
// DELIBERATE NON-TARGET (documented so it is not mistaken for a hole): a `Color`
// built with a RUNTIME argument — e.g. `Color.fromRGBO(0, 0, 0, _opacity)` in
// lib/shared/widgets/blend_layer.dart, where the RGB is ignored by `saveLayer`
// and only the computed alpha carries a Figma fill opacity. That is not a fixed
// design colour, cannot be a `const` token, and so is out of scope by rule 2's
// all-literals condition — not by exception.
//
// Run: dart run tool/no_hex_literals.dart   (from apps/mobile)
//      scripts/no-hex-literals.sh           (from the repo root; CI entry point)

import 'dart:io';

import 'analytics_audit.dart' show stripComments;

/// The ONE file allowed to spell a colour literally.
const String kSanctionedHome = 'lib/core/theme.dart';

const String kLibDir = 'lib';

class Violation {
  Violation(this.file, this.line, this.rule, this.text);
  final String file;
  final int line;
  final String rule;
  final String text;
}

void main(List<String> args) {
  final root = Directory.current;
  final libDir = Directory('${root.path}/$kLibDir');
  if (!libDir.existsSync()) {
    stderr.writeln('FAIL: no $kLibDir/ here. Run this from apps/mobile (or via '
        'scripts/no-hex-literals.sh).');
    exit(1);
  }

  final dartFiles = libDir
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'))
      .toList()
    ..sort((a, b) => a.path.compareTo(b.path));

  if (dartFiles.isEmpty) {
    stderr.writeln('FAIL: scanned 0 Dart files — refusing to pass a toothless '
        'gate.');
    exit(1);
  }

  // The sanctioned home must actually exist, or "everything outside theme.dart"
  // is vacuously clean.
  if (!File('${root.path}/$kSanctionedHome').existsSync()) {
    stderr.writeln('FAIL: sanctioned token home $kSanctionedHome not found — '
        'refusing to pass a toothless gate.');
    exit(1);
  }

  final violations = <Violation>[];
  var scanned = 0;
  for (final file in dartFiles) {
    final rel = _rel(file.path, root.path);
    if (rel == kSanctionedHome) continue;
    scanned++;
    violations.addAll(scan(rel, file.readAsStringSync()));
  }

  violations.sort((a, b) => a.file == b.file
      ? a.line.compareTo(b.line)
      : a.file.compareTo(b.file));

  stdout.writeln('');
  stdout.writeln('no-hex-literals — scanned $scanned Dart files under $kLibDir/ '
      '(sanctioned home: $kSanctionedHome)');

  if (violations.isEmpty) {
    stdout.writeln('PASS: every colour outside the token home comes from a '
        'theme token.');
    exit(0);
  }

  stderr.writeln('');
  stderr.writeln('FAIL: ${violations.length} raw colour literal'
      '${violations.length == 1 ? "" : "s"} outside $kSanctionedHome.');
  stderr.writeln('');
  for (final v in violations) {
    stderr.writeln('  ${v.file}:${v.line}  [${v.rule}]  ${v.text}');
  }
  stderr.writeln('');
  stderr.writeln('Every colour must be a token in $kSanctionedHome whose '
      'dartdoc cites the Figma node/variable it came from.');
  stderr.writeln('Move the value there and reference the token — do not '
      'suppress this.');
  exit(1);
}

/// Hex int literal: `0xFFFE8A02`, `0xFC7304`. 6 digits (RGB) or 8 (ARGB).
/// Bounded so a 4-digit mask or a 16-digit id is not swept up.
final RegExp _hexInt = RegExp(r'\b0x[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b');

/// `#RRGGBB` / `#AARRGGBB` inside a string literal.
final RegExp _hexString = RegExp(
  '''(['"])([^'"]*?#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\\b[^'"]*?)\\1''',
);

/// `Color.fromARGB(` / `Color.fromRGBO(`.
final RegExp _colorCtor = RegExp(r'\bColor\.from(?:ARGB|RGBO)\s*\(');

/// A single numeric literal argument (int or double), nothing else.
final RegExp _numericLiteral = RegExp(r'^-?\d+(?:\.\d+)?$');

List<Violation> scan(String rel, String rawSrc) {
  final out = <Violation>[];
  final src = stripComments(rawSrc);

  for (final m in _hexInt.allMatches(src)) {
    out.add(Violation(rel, _lineAt(src, m.start), 'hex-int', m.group(0)!));
  }

  for (final m in _hexString.allMatches(src)) {
    out.add(Violation(rel, _lineAt(src, m.start), 'hex-string', m.group(0)!));
  }

  for (final m in _colorCtor.allMatches(src)) {
    final args = _balanced(src, m.end - 1);
    if (args == null) continue;
    final parts = _splitArgs(args);
    if (parts.isEmpty) continue;
    // Only a colour built ENTIRELY from literals is a hardcoded design colour a
    // token could replace. Any runtime argument (e.g. a computed opacity) means
    // this is not a fixed colour — see the header's deliberate non-target note.
    if (!parts.every((p) => _numericLiteral.hasMatch(p))) continue;
    out.add(Violation(
      rel,
      _lineAt(src, m.start),
      'literal-color',
      '${src.substring(m.start, m.end)}${parts.join(", ")})',
    ));
  }

  return out;
}

/// Contents between the `(` at [openIndex] and its match. String-aware.
String? _balanced(String src, int openIndex) {
  var depth = 0;
  for (var i = openIndex; i < src.length; i++) {
    final ch = src[i];
    if (ch == "'" || ch == '"') {
      i = _skipString(src, i);
      continue;
    }
    if (ch == '(') depth++;
    if (ch == ')') {
      depth--;
      if (depth == 0) return src.substring(openIndex + 1, i);
    }
  }
  return null;
}

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
    if ('([{'.contains(ch)) depth++;
    if (')]}'.contains(ch)) depth--;
    if (ch == ',' && depth == 0) {
      out.add(args.substring(start, i));
      start = i + 1;
    }
  }
  final last = args.substring(start).trim();
  if (last.isNotEmpty) out.add(last);
  return out.map((a) => a.trim()).where((a) => a.isNotEmpty).toList();
}

int _skipString(String src, int i) {
  final quote = src[i];
  for (var j = i + 1; j < src.length; j++) {
    if (src[j] == r'\') {
      j++;
      continue;
    }
    if (src[j] == quote) return j;
    if (src[j] == '\n') return j;
  }
  return src.length;
}

int _lineAt(String src, int offset) =>
    '\n'.allMatches(src.substring(0, offset.clamp(0, src.length))).length + 1;

String _rel(String path, String root) =>
    path.startsWith(root) ? path.substring(root.length + 1) : path;
