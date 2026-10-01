#!/usr/bin/env bash
# TAM-56 — Design Fidelity Gate: every committed asset traces to a Figma node.
#
# Fails (non-zero) when an asset under apps/mobile/assets/ has no provenance
# entry in tools/figma-assets.manifest.json, when an entry points at a missing
# file, or when an entry lacks a real node/fileKey/format.
# Run by `pnpm verify:mobile`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/apps/mobile"

exec dart run tool/figma_assets_audit.dart "$@"
