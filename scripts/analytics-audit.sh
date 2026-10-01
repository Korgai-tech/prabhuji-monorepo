#!/usr/bin/env bash
# TAM-77 — analytics catalog drift gate.
#
# Fails (non-zero) when docs/ANALYTICS-MODULES.md and apps/mobile/lib disagree:
# a catalog event with no constant, a constant no call site ever fires, or a
# module event the catalog doesn't document. Run by `pnpm verify:mobile`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/apps/mobile"

exec dart run tool/analytics_audit.dart "$@"
