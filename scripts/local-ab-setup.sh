#!/usr/bin/env bash
#
# TAM-174 — set this machine up to demo the shortcut-grid A/B on a PHYSICAL
# device, with two accounts that land in opposite arms.
#
# ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────────
# Everything in the local stack is addressed as `localhost`, which a phone on
# your Wi-Fi cannot reach. Three separate things have to agree on the laptop's
# LAN address before a device sees anything at all:
#
#   1. the API's own base URL          → the app's `env/staging.json`
#   2. the media base URL              → `MEDIA_PUBLIC_BASE_URL`, baked into the
#                                        icon URLs the API serves
#   3. the icon URLs already in the DB → re-seeded here, because they were
#                                        written with whatever base was in
#                                        effect at the time
#
# Miss any one and the failure is silent-ish: the grid renders with labels and
# no artwork, or the app cannot reach the API at all.
#
# ── WHAT IT DOES ─────────────────────────────────────────────────────────────
#   • detects the LAN IP (override with LAN_IP=…)
#   • brings up compose (postgres, redis, floci-aws)
#   • applies migrations
#   • uploads the tile artwork to floci under control/ and gradient_v1/
#   • seeds Home (both arms) + the two pinned A/B accounts
#   • turns the experiment ON
#   • prints exactly what to put in env/staging.json and who to log in as
#
# Idempotent: safe to re-run after a `docker compose down -v`.
#
# Usage:  bash scripts/local-ab-setup.sh
#         LAN_IP=192.168.1.50 bash scripts/local-ab-setup.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

# ---------------------------------------------------------------- LAN address
# `ipconfig getifaddr en0` is the Wi-Fi interface on macOS. It is empty on
# ethernet-only or on Linux, hence the fallback and the override.
LAN_IP="${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || true)}"
if [ -z "$LAN_IP" ]; then
  LAN_IP="$(ifconfig 2>/dev/null | awk '/inet /{if($2!="127.0.0.1"){print $2; exit}}' || true)"
fi
if [ -z "$LAN_IP" ]; then
  echo "✗ Could not detect a LAN IP. Re-run as: LAN_IP=<your-ip> bash $0" >&2
  exit 1
fi

API_PORT="${API_PORT:-3300}"
MEDIA_BUCKET="${MEDIA_BUCKET:-app-local-media}"

# The address the DEVICE will use to reach this machine. Two ways to connect,
# and they need different hosts:
#
#   Wi-Fi        the LAN IP (default). Phone and laptop on the same network.
#   adb reverse  `localhost` — `adb reverse tcp:3300 tcp:3300` (and 4566) maps
#                the device's own loopback back here over USB, so the LAN IP is
#                wrong even though it looks more "correct".
#
#   HOST=localhost bash scripts/local-ab-setup.sh
HOST="${HOST:-$LAN_IP}"
MEDIA_BASE="http://${HOST}:4566/${MEDIA_BUCKET}"
ICON_BASE="${MEDIA_BASE}/seed/home/shortcuts"

echo "▸ Device host   : ${HOST}$([ "$HOST" = "localhost" ] && echo '   (adb reverse mode)' || echo '   (Wi-Fi mode)')"
echo "▸ API           : http://${HOST}:${API_PORT}"
echo "▸ Media base    : ${MEDIA_BASE}"
echo

# ------------------------------------------------------------------- services
echo "▸ Starting postgres / redis / floci-aws…"
docker compose up -d postgres redis floci-aws floci-init >/dev/null
# floci needs a moment before the bucket exists; poll rather than sleep blindly.
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:4566/${MEDIA_BUCKET}" >/dev/null 2>&1; then break; fi
  sleep 1
done

# ----------------------------------------------------------------- migrations
echo "▸ Applying migrations…"
(cd apps/api && npx prisma migrate deploy >/dev/null)

# ----------------------------------------------------------------------- icons
# Both arms get REAL artwork, uploaded to separate prefixes so the wire actually
# serves a different URL per arm — which is the thing under test.
#
# ONLY the gradient arm's art is uploaded.
#
# The control arm deliberately has NO artwork of its own: it is the design
# already shipping, so it renders whatever ops has published on the base
# `home_shortcuts` row. Uploading "control art" here replaced those live icons
# with 3x TAM-132 scratchpad PNGs — which are OPAQUE (corner alpha 255) and at
# three different sizes — and produced white-boxed tiles on the control grid.
# That is a data mistake this script is no longer able to make.
#
# Swap the gradient art with no code change:
#   GRADIENT_SRC=/path/to/art bash scripts/local-ab-setup.sh
GRADIENT_SRC="${GRADIENT_SRC:-$ROOT/scratchpad/tam174/gradient-3x}"

KEYS="aarti_bhajans mantras_stutis set_wallpaper set_status horoscope set_ringtone"

upload_gradient_icons() {
  local src="$1"
  for key in $KEYS; do
    if [ ! -f "$src/$key.png" ]; then
      echo "  ✗ missing $src/$key.png" >&2
      return 1
    fi
    curl -fsS -X PUT \
      -H 'Content-Type: image/png' \
      --data-binary "@$src/$key.png" \
      "http://127.0.0.1:4566/${MEDIA_BUCKET}/seed/home/shortcuts/gradient_v1/${key}.png" >/dev/null
  done
  echo "  ✓ gradient_v1  ($(basename "$src"))"
}

echo "▸ Uploading gradient-arm artwork to floci…"
upload_gradient_icons "$GRADIENT_SRC"
echo "  · control arm inherits the base row's live CMS icons (nothing uploaded)"

# ------------------------------------------------------------------ seed data
# `SEED_MEDIA_BASE_URL` is what makes the seeded icon URLs point at the LAN
# address instead of loopback — the single reason a phone can load them.
# LOCAL-ONLY RESET. The seed fills gaps but never overwrites (so it cannot
# clobber a CMS edit), which means a machine that already has arm rows — e.g.
# the theme-only rows the migration carries across from the first cut — would
# keep them and never pick up the seeded copy or artwork. For a demo box we DO
# want the seed's intent, so the arms are cleared first. This is why this line
# lives in a local setup script and not in the seed.
echo "▸ Resetting arm rows to the seed's intent (local only)…"
docker compose exec -T postgres psql -U postgres -d "${POSTGRES_DB:-app}" -q \
  -c "DELETE FROM home_shortcut_variants;" >/dev/null 2>&1 || true

echo "▸ Seeding Home (both arms) + A/B accounts…"
export SEED_MEDIA_BASE_URL="$ICON_BASE"
(cd apps/api && pnpm run seed:home >/dev/null)
(cd apps/api && pnpm run seed:ab-users)

# ------------------------------------------------- switch the experiment on
# Seeding a palette must not start an experiment, so the seed leaves the switch
# off. Turning it on is the deliberate step, and this is it.
# The database name comes from compose (`POSTGRES_DB: app`), not from a guess —
# a wrong name here fails silently-ish and the tester sees control on both
# accounts with no clue why.
echo "▸ Enabling the experiment…"
PGDB="${POSTGRES_DB:-app}"
if docker compose exec -T postgres psql -U postgres -d "$PGDB" -q \
     -c "UPDATE home_settings SET shortcut_grid_gradient_enabled = TRUE;" >/dev/null 2>&1; then
  echo "  ✓ experiment ON"
else
  echo "  ! could not flip the switch via psql — turn it on in Admin ▸ Home ▸ Settings"
fi

# ----------------------------------------------------------------- next steps
cat <<EOF

────────────────────────────────────────────────────────────────────────────
  Ready. Two more steps, both on your side:

  1. Point the app at this machine — edit (do NOT commit):
       apps/mobile/env/staging.json
         "apiUrl": "http://${HOST}:${API_PORT}"

  2. Make sure the API serves LAN-reachable media URLs — in apps/api/.env:
         MEDIA_PUBLIC_BASE_URL=${MEDIA_BASE}
     then start it:
         pnpm nx serve api

  Then run the app on the device:
       cd apps/mobile && flutter run -d <device-id>

  Log in with either account — OTP is 1234:

       +91 9000000001  →  gradient_v1   the NEW coloured grid
       +91 9000000002  →  control       the CURRENT grid

  Both accounts are pre-verified, so OTP 1234 drops you straight in.

  To flip the whole experiment off (everyone sees control):
       Admin ▸ Home ▸ Settings ▸ "Shortcut grid — colour experiment"
────────────────────────────────────────────────────────────────────────────
EOF
