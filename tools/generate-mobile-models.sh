#!/usr/bin/env bash
set -euo pipefail

# openapi-generator only needs a modern JDK; it finds `java` via JAVA_HOME (if
# set) else PATH. Only resolve one if the caller has not already provided it, so
# CI / Docker / any pre-configured environment wins. The lookup order below is
# portable across macOS (system JDK or Homebrew on Apple Silicon / Intel) — on
# Linux/CI where JAVA_HOME is usually pre-set or `java` is on PATH we simply
# leave the environment untouched.
if [[ -z "${JAVA_HOME:-}" ]]; then
  if command -v /usr/libexec/java_home >/dev/null 2>&1 \
     && _java_home="$(/usr/libexec/java_home -v 17 2>/dev/null)"; then
    export JAVA_HOME="$_java_home"
  else
    for _candidate in \
      /opt/homebrew/opt/openjdk@17 /usr/local/opt/openjdk@17 \
      /opt/homebrew/opt/openjdk /usr/local/opt/openjdk; do
      if [[ -x "$_candidate/bin/java" ]]; then
        export JAVA_HOME="$_candidate"
        break
      fi
    done
  fi
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/apps/mobile/lib/api/generated"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# TAM-85: the PUBLIC doc — never `openapi.json`. This generator emits a model
# per schema in the document, so pointing it at the full contract ships every
# admin write schema inside the APK. `openapi.public.json` is emitted alongside
# the full doc by `pnpm nx run api:openapi` and drift-gated by `pnpm check:openapi`.
pnpm exec openapi-generator-cli generate \
  -i "$REPO_ROOT/apps/api/openapi.public.json" -g dart \
  --global-property models,supportingFiles=api_helper.dart \
  -o "$TMP" --additional-properties=pubName=api_models

# Stage into a scratch dir first so a mid-failure never leaves OUT_DIR half-wiped.
STAGE="$TMP/stage"
mkdir -p "$STAGE/models"

cp "$TMP"/lib/api_helper.dart "$STAGE/api_helper.dart"
cp "$TMP"/lib/model/*.dart "$STAGE/models/"

# The `--global-property models` mode only emits lib/model/*.dart + api_helper.dart
# (no library barrel file), so we assemble the barrel deterministically here rather
# than hand-authoring/committing it. Part list is sorted for reproducible diffs.
{
  echo "//"
  echo "// AUTO-GENERATED FILE, DO NOT MODIFY!"
  echo "//"
  echo "// @dart=2.18"
  echo
  echo "// ignore_for_file: unused_element, unused_import"
  echo "// ignore_for_file: always_put_required_named_parameters_first"
  echo "// ignore_for_file: constant_identifier_names"
  echo "// ignore_for_file: lines_longer_than_80_chars"
  echo
  echo "library openapi.api;"
  echo
  echo "import 'dart:async';"
  echo "import 'dart:convert';"
  echo "import 'dart:io';"
  echo
  echo "import 'package:collection/collection.dart';"
  echo "import 'package:http/http.dart';"
  echo "import 'package:intl/intl.dart';"
  echo "import 'package:meta/meta.dart';"
  echo
  echo "part 'api_helper.dart';"
  echo
  for f in $(cd "$STAGE/models" && ls *.dart | sort); do
    echo "part 'models/$f';"
  done
  echo
  echo "const _delimiters = {'csv': ',', 'ssv': ' ', 'tsv': '\\t', 'pipes': '|'};"
  echo "const _dateEpochMarker = 'epoch';"
  echo "const _deepEquality = DeepCollectionEquality();"
  echo "final _dateFormatter = DateFormat('yyyy-MM-dd');"
  echo "final _regList = RegExp(r'^List<(.*)>\$');"
  echo "final _regSet = RegExp(r'^Set<(.*)>\$');"
  echo "final _regMap = RegExp(r'^Map<String,(.*)>\$');"
  echo
  echo "bool _isEpochMarker(String? pattern) => pattern == _dateEpochMarker || pattern == '/\$_dateEpochMarker/';"
} > "$STAGE/openapi.dart"

rm -rf "$OUT_DIR"
mkdir -p "$(dirname "$OUT_DIR")"
mv "$STAGE" "$OUT_DIR"

echo "generated $OUT_DIR"
