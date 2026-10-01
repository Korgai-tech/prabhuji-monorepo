#!/usr/bin/env bash
set -euo pipefail

# Build the ffmpeg Lambda layer for apps/media-optimizer (TAM-267):
#
#   apps/media-optimizer/dist-layer/ffmpeg-layer.zip
#     bin/ffmpeg    bin/ffprobe    LICENSE.ffmpeg (GPLv3)    README.ffmpeg
#
# A layer's contents are mounted at /opt, so the function finds the binaries at
# /opt/bin/ffmpeg and /opt/bin/ffprobe (its FFMPEG_PATH / FFPROBE_PATH defaults).
# Terraform (infra/terraform/modules/stack/media-optimizer.tf) uploads the zip;
# scripts/deploy-infra.sh runs this before `terraform plan`.
#
# THE BUILD IS PINNED, NOT "LATEST". John Van Sickle's static linux builds are the
# de-facto standard static ffmpeg, but johnvansickle.com only serves the CURRENT
# release — a versioned URL there disappears on the next ffmpeg release. The
# `ffmpeg-static` npm project republishes exactly those builds as GitHub release
# assets, which are immutable per tag, so the URLs below keep working. Tag b6.1.1
# carries Van Sickle's `ffmpeg-7.0.2-arm64-static` build (see README.ffmpeg in the
# zip). Both binaries are fully static (glibc included), so they run on the Lambda
# nodejs22.x (Amazon Linux 2023, arm64) runtime with no shared libraries.
#
# ENCODERS. The optimizer needs libx264 (video), aac (audio in mp4 — ffmpeg's
# native encoder, always built in) and libmp3lame (mp3). They cannot be checked
# with `ffmpeg -encoders` on an x86 or macOS host (the binary is linux/arm64), so
# the pin relies on the build's documented configuration — its README lists
# libx264 0.164.3191 and libmp3lame 3.100. When Docker can run linux/arm64
# (natively on Apple Silicon, or via qemu), the check below DOES run the binaries
# inside the actual Lambda base image and fails the build if an encoder is
# missing; otherwise it warns and skips. SKIP_LAYER_VERIFY=1 skips it explicitly.
#
# SIZE. ~51 MB zipped / ~102 MB unzipped. Lambda's limits are 250 MB unzipped
# (function + all layers) and 50 MB for a zip uploaded inline — this is over the
# inline limit, which is why Terraform uploads it to S3 and publishes the layer
# from there.
#
# Upgrading ffmpeg = new tag + new sha256s below (the sha256 is also shown on the
# GitHub release page), then re-run and check the verification output.
#
# Downloads are cached in $FFMPEG_LAYER_CACHE (default ~/.cache/prabhuji/ffmpeg-layer)
# and re-verified against the pinned sha256 on every run.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/apps/media-optimizer/dist-layer"
OUT_ZIP="$OUT_DIR/ffmpeg-layer.zip"
CACHE_DIR="${FFMPEG_LAYER_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/prabhuji/ffmpeg-layer}"

RELEASE="b6.1.1"
BASE_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/$RELEASE"
# name → sha256 of the downloaded asset
ASSETS=(
  "ffmpeg-linux-arm64.gz 754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0"
  "ffprobe-linux-arm64.gz 2ab6aba60ee84412dff9188720703376cb4e7aaf7e0b5e43aa8249f2acae5bf8"
  "linux-arm64.LICENSE 8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903"
  "linux-arm64.README d6777d2fd276b23f0ac6666fa619e88ffe4826521881c7ff83836e30cb4acec2"
)

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

for tool in curl gunzip zip; do
  command -v "$tool" >/dev/null || {
    echo "❌ $tool not found on PATH" >&2
    exit 1
  }
done

mkdir -p "$CACHE_DIR/$RELEASE" "$OUT_DIR"

echo "==> ffmpeg layer: $RELEASE (cache: $CACHE_DIR/$RELEASE)"
for entry in "${ASSETS[@]}"; do
  name="${entry%% *}"
  want="${entry##* }"
  file="$CACHE_DIR/$RELEASE/$name"
  if [ ! -f "$file" ] || [ "$(sha256 "$file")" != "$want" ]; then
    echo "    downloading $name"
    curl -fsSL --retry 3 -o "$file.part" "$BASE_URL/$name"
    mv "$file.part" "$file"
  fi
  got="$(sha256 "$file")"
  if [ "$got" != "$want" ]; then
    rm -f "$file"
    echo "❌ sha256 mismatch for $name: expected $want, got $got" >&2
    exit 1
  fi
done

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/bin"
gunzip -c "$CACHE_DIR/$RELEASE/ffmpeg-linux-arm64.gz" >"$STAGE/bin/ffmpeg"
gunzip -c "$CACHE_DIR/$RELEASE/ffprobe-linux-arm64.gz" >"$STAGE/bin/ffprobe"
cp "$CACHE_DIR/$RELEASE/linux-arm64.LICENSE" "$STAGE/LICENSE.ffmpeg"
cp "$CACHE_DIR/$RELEASE/linux-arm64.README" "$STAGE/README.ffmpeg"
chmod 755 "$STAGE/bin/ffmpeg" "$STAGE/bin/ffprobe"
chmod 644 "$STAGE/LICENSE.ffmpeg" "$STAGE/README.ffmpeg"

# --- verify the binaries in the real Lambda runtime (best effort) -------------
LAMBDA_IMAGE="public.ecr.aws/lambda/nodejs:22"
if [ "${SKIP_LAYER_VERIFY:-}" = "1" ]; then
  echo "    verification skipped (SKIP_LAYER_VERIFY=1)"
elif command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  echo "    verifying encoders inside $LAMBDA_IMAGE (linux/arm64)"
  if ! encoders="$(docker run --rm --platform linux/arm64 -v "$STAGE:/opt:ro" --entrypoint /opt/bin/ffmpeg \
    "$LAMBDA_IMAGE" -hide_banner -encoders 2>&1)"; then
    echo "⚠  could not run the arm64 binary under Docker (no arm64 support?) — skipping verification" >&2
    echo "$encoders" | tail -3 >&2
  else
    for enc in libx264 aac libmp3lame; do
      echo "$encoders" | grep -Eq "^ [A-Z.]{6} $enc( |$)" || {
        echo "❌ encoder $enc missing from the pinned ffmpeg build" >&2
        exit 1
      }
    done
    docker run --rm --platform linux/arm64 -v "$STAGE:/opt:ro" --entrypoint /opt/bin/ffprobe \
      "$LAMBDA_IMAGE" -hide_banner -version | head -1 | sed 's/^/    /'
    echo "    ✅ libx264, aac, libmp3lame present; ffprobe runs"
  fi
else
  echo "⚠  Docker not available — encoders NOT verified (relying on the build's documented config)" >&2
fi

# --- deterministic zip ---------------------------------------------------------
# Fixed mtimes + no extra attributes (-X) + fixed file order, so the same inputs
# always produce a byte-identical zip: Terraform keys the layer version on the
# zip's hash, and a non-deterministic zip would publish a new layer version (and
# roll the function) on every deploy.
export TZ=UTC
find "$STAGE" -exec touch -t 202001010000 {} +
rm -f "$OUT_ZIP"
(cd "$STAGE" && zip -q -X -9 "$OUT_ZIP" bin/ffmpeg bin/ffprobe LICENSE.ffmpeg README.ffmpeg)

echo "    ✅ $OUT_ZIP ($(du -h "$OUT_ZIP" | cut -f1), sha256 $(sha256 "$OUT_ZIP"))"
