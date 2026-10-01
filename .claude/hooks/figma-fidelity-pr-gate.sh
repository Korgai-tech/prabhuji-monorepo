#!/bin/bash
# PreToolUse gate (gh pr create): a Figma-sourced ticket that changed mobile UI
# cannot open a PR until design-fidelity evidence is recorded in the spec.
# Exit 2 = block, stderr goes to the agent.

BRANCH=$(git branch --show-current 2>/dev/null)
TICKET=$(printf '%s' "$BRANCH" | grep -oE '^[A-Z]+-[0-9]+')
[ -z "$TICKET" ] && exit 0
SPEC=$(ls specs/"${TICKET}"-*.md 2>/dev/null | head -1)
[ -z "$SPEC" ] && exit 0
grep -qiE 'figma\.com|figma-links|design execution package' "$SPEC" || exit 0

BASE=$(git merge-base origin/main HEAD 2>/dev/null || git merge-base main HEAD 2>/dev/null)
[ -z "$BASE" ] && exit 0
git diff --name-only "$BASE"..HEAD 2>/dev/null | grep -q '^apps/mobile/lib/' || exit 0

# Deferral is never accepted: the Phase 6 verdict is part of THIS ticket's DoD.
# Checked first because "fidelity pass deferred" would satisfy the verdict regex.
if grep -iE 'fidelity' "$SPEC" | grep -qiE 'defer'; then
  cat >&2 <<EOF
BLOCKER: $SPEC defers the design-fidelity pass — deferral is not accepted.
The Phase 6 rendered-comparison verdict is part of this ticket's Definition of
Done. Run the figma-flutter skill Phase 6 now (no emulator? boot one with
'flutter emulators --launch', or record the verdict from component golden
renders — recipes in .claude/skills/figma-flutter/references/). If genuinely
blocked, stop and surface the blocker to the user; the PR waits either way.
EOF
  exit 2
fi

# Scope the verdict check to the "## Evidence" section when one exists: the spec
# template's AC/DoD lines contain the trigger words, so grepping the whole file
# would let an unfilled template pass. Whole-file fallback covers older specs.
EVIDENCE=$(awk '/^## Evidence/{f=1;print;next} /^## /{f=0} f' "$SPEC")
[ -z "$EVIDENCE" ] && EVIDENCE=$(cat "$SPEC")

if ! printf '%s\n' "$EVIDENCE" | grep -qiE 'fidelity (pass|verdict|check)|side-by-side|sweep[ -]table'; then
  cat >&2 <<EOF
BLOCKER: $SPEC is Figma-sourced and apps/mobile/lib changed, but the spec's
Evidence section has no design-fidelity verdict. Run the figma-flutter skill
Phase 6 (Maestro hot-reload loop: .claude/skills/figma-flutter/references/maestro-loop.md),
record the sweep-table verdict in Evidence, then retry PR creation.
Deferring to a follow-up ticket is not accepted — the verdict lands in this ticket.
EOF
  exit 2
fi

# The verdict must reference at least one committed artifact that EXISTS
# (convention: specs/evidence/<TICKET>/fidelity/ — sweep table + side-by-side
# PNGs). An unfilled "[...]" template slot references no real file and fails
# here, as does a prose-only or fabricated verdict.
FID_LINES=$(printf '%s\n' "$EVIDENCE" | grep -iE 'fidelity|side-by-side|sweep')
ART_OK=""
for tok in $(printf '%s\n' "$FID_LINES" | grep -oE '[A-Za-z0-9_./-]+\.(png|jpe?g|webp|md|txt)|specs/evidence/[A-Za-z0-9_./-]*' | sort -u); do
  [ -e "$tok" ] && ART_OK=1 && break
done
if [ -z "$ART_OK" ]; then
  cat >&2 <<EOF
BLOCKER: $SPEC has a design-fidelity entry in Evidence, but it references no
artifact file that exists in the repo. Commit the Phase 6 artifacts under
specs/evidence/${TICKET}/fidelity/ (sweep-table.md + side-by-side PNGs), reference
those paths from the Evidence entry, then retry. A verdict without artifacts
(or an unfilled template placeholder) does not pass this gate.
EOF
  exit 2
fi
exit 0
