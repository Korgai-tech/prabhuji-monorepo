#!/usr/bin/env bash
# TAM-56 — Design Fidelity Gate: no raw colour literals outside the token home.
#
# Fails (non-zero) when a colour is spelled at a call site instead of coming from
# a Figma-cited token in apps/mobile/lib/core/theme.dart. Catches hex ints
# (0xFF...), all-literal Color.fromARGB/fromRGBO, and '#RRGGBB' strings.
# Run by `pnpm verify:mobile`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/apps/mobile"

exec dart run tool/no_hex_literals.dart "$@"
