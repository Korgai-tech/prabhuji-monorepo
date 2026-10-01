#!/usr/bin/env bash
# TAM-266 — where does the media CDN's egress go?
#
# Syncs the media distribution's CloudFront standard access logs for the last N
# days (default 1) and prints:
#   1. bytes by top-level prefix + extension   (status/…mp4, aarti/…mp3, …)
#   2. bytes by client                         (libmpv = video, ExoPlayer = audio, Dart = images)
#   3. top objects by bytes
#   4. the REPEAT-FETCH signal: object fetches that start at byte 0 (full GET or
#      a range from 0) for the same client IP + object within the same 5-minute
#      window. A looping player that re-downloads per loop (TAM-264) shows up
#      here as many starts per pair; a player that loops from its buffer doesn't.
#
# Usage:  scripts/cdn-log-report.sh <stage|prod> [days]
# Needs:  AWS credentials (AWS_PROFILE=…) that can read the log bucket.
# Logs are cached under $TMPDIR/cdn-logs/<env>; re-runs only fetch new files.
set -euo pipefail

ENV="${1:-}"
DAYS="${2:-1}"
case "$ENV" in
  stage | prod) ;;
  *)
    echo "usage: $0 <stage|prod> [days]" >&2
    exit 2
    ;;
esac

REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="app-$ENV-media-cdn-logs-$ACCOUNT"
DEST="${TMPDIR:-/tmp}/cdn-logs/$ENV"
mkdir -p "$DEST"

# Legacy log keys are media/<distribution-id>.YYYY-MM-DD-HH.<id>.gz — include
# only the requested days so a 1-day report doesn't pull 90 days of logs.
INCLUDES=()
for ((i = 0; i < DAYS; i++)); do
  d="$(date -u -v-"${i}"d +%Y-%m-%d 2>/dev/null || date -u -d "-$i day" +%Y-%m-%d)"
  INCLUDES+=(--include "*.${d}-*")
done
echo "==> syncing s3://$BUCKET/media/ (last $DAYS day(s)) → $DEST"
aws s3 sync "s3://$BUCKET/media/" "$DEST" --region "$REGION" --exclude "*" "${INCLUDES[@]}" --only-show-errors

FILES=()
for ((i = 0; i < DAYS; i++)); do
  d="$(date -u -v-"${i}"d +%Y-%m-%d 2>/dev/null || date -u -d "-$i day" +%Y-%m-%d)"
  for f in "$DEST"/*."${d}"-*.gz; do [ -e "$f" ] && FILES+=("$f"); done
done
if [ "${#FILES[@]}" -eq 0 ]; then
  echo "no log files for the last $DAYS day(s) yet (CloudFront delivers within ~1h of a request)" >&2
  exit 1
fi
echo "    ${#FILES[@]} log files"

# Standard log fields (tab-separated, 1-based): 1 date · 2 time · 4 sc-bytes ·
# 5 c-ip · 8 cs-uri-stem · 9 sc-status · 11 cs(User-Agent) · 14 x-edge-result-type
# · 32 sc-range-start. Comment lines start with '#'.
gzip -dc "${FILES[@]}" | awk -F'\t' '
  function human(b) {
    if (b >= 1e9) return sprintf("%.2f GB", b / 1e9)
    if (b >= 1e6) return sprintf("%.1f MB", b / 1e6)
    return sprintf("%.0f KB", b / 1e3)
  }
  function client(ua) {
    if (ua ~ /libmpv|mpv/) return "libmpv (video)"
    if (ua ~ /ExoPlayer/) return "ExoPlayer (audio)"
    if (ua ~ /AppleCoreMedia|AVPlayer/) return "AVPlayer (iOS audio)"
    if (ua ~ /Dart/) return "Dart http (images/downloads)"
    if (ua ~ /Mozilla/) return "browser"
    return "other"
  }
  /^#/ { next }
  {
    bytes = $4 + 0; total += bytes; reqs++
    uri = $8
    n = split(uri, seg, "/"); top = seg[2] "/" seg[3]
    m = split(uri, dot, "."); ext = (m > 1) ? tolower(dot[m]) : "-"
    byType[top " ." ext] += bytes
    byClient[client($11)] += bytes
    byObj[uri] += bytes; objReqs[uri]++

    # A fetch START: status 200, or 206 with range-start 0.
    if ($9 == 200 || ($9 == 206 && ($32 == "0"))) {
      split($2, t, ":"); bucket = $1 " " t[1] ":" int(t[2] / 5)
      k = $5 SUBSEP uri SUBSEP bucket
      starts[k]++; startBytes[k] += bytes
    }
  }
  END {
    printf "\n== total: %s over %d requests (%.0f KB avg)\n", human(total), reqs, total / reqs / 1e3

    print "\n== bytes by prefix + extension"
    for (k in byType) printf "%14.0f\t%s\t%5.1f%%\t%s\n", byType[k], human(byType[k]), 100 * byType[k] / total, k | "sort -rn | head -20 | cut -f2-"
    close("sort -rn | head -20 | cut -f2-")

    print "\n== bytes by client"
    for (k in byClient) printf "%14.0f\t%s\t%5.1f%%\t%s\n", byClient[k], human(byClient[k]), 100 * byClient[k] / total, k | "sort -rn | cut -f2-"
    close("sort -rn | cut -f2-")

    print "\n== top 15 objects by bytes"
    for (k in byObj) printf "%14.0f\t%s\t%6d req\t%s\n", byObj[k], human(byObj[k]), objReqs[k], k | "sort -rn | head -15 | cut -f2-"
    close("sort -rn | head -15 | cut -f2-")

    # Repeat-fetch: every start after the first for a (client, object, 5-min)
    # key is a re-download. Its bytes are what a buffer-looping player saves.
    for (k in starts) {
      pairs++
      if (starts[k] > 1) { repeatPairs++; repeatStarts += starts[k] - 1; repeatBytes += startBytes[k] * (starts[k] - 1) / starts[k] }
      hist[starts[k] >= 10 ? "10+" : (starts[k] >= 3 ? "3-9" : starts[k])]++
    }
    print "\n== repeat fetches (same client IP + object, same 5-min window, starting at byte 0)"
    printf "   (client,object,window) keys: %d · with >1 start: %d (%.1f%%)\n", pairs, repeatPairs, pairs ? 100 * repeatPairs / pairs : 0
    printf "   starts per key: 1=%d  2=%d  3-9=%d  10+=%d\n", hist[1], hist[2], hist["3-9"], hist["10+"]
    printf "   re-downloaded bytes: %s (%.1f%% of total)\n", human(repeatBytes), total ? 100 * repeatBytes / total : 0
  }
'
