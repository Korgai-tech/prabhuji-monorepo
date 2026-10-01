#!/bin/bash
# PreToolUse gate (Write|Edit|MultiEdit): on a Figma-sourced ticket, Flutter UI
# edits are BLOCKED until the figma-flutter skill has been loaded this session
# (marker written by figma-skill-marker.sh). Exit 2 = block, stderr goes to the
# agent.
#
# Fires only when ALL of:
#   - the edited file is a .dart file under apps/mobile/lib/
#     (generated code and the pure data layer are exempt)
#   - the current branch's spec (specs/<TICKET>-*.md) references the Figma package
#     (figma.com URL, figma-links, or a Design Execution Package)
#   - the skill has not been loaded yet this session

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // "global"' 2>/dev/null)

case "$FILE" in
  */apps/mobile/lib/*.dart | apps/mobile/lib/*.dart) : ;;
  *) exit 0 ;;
esac
case "$FILE" in
  */lib/api/generated/* | */lib/*/data/*) exit 0 ;;
esac

[ -f "/tmp/claude-figma-skill-${SID}" ] && exit 0

BRANCH=$(git branch --show-current 2>/dev/null)
TICKET=$(printf '%s' "$BRANCH" | grep -oE '^[A-Z]+-[0-9]+')
[ -z "$TICKET" ] && exit 0
SPEC=$(ls specs/"${TICKET}"-*.md 2>/dev/null | head -1)
[ -z "$SPEC" ] && exit 0
grep -qiE 'figma\.com|figma-links|design execution package' "$SPEC" || exit 0

cat >&2 <<EOF
BLOCKED: $SPEC is Figma-sourced — you MUST load the figma-flutter skill before
editing Flutter UI. Invoke the Skill tool with skill: "figma-flutter" now, follow
its six phases (variables -> geometry -> theme -> assets -> translation -> rendered
comparison), then retry this edit. Do not eyeball the design.
EOF
exit 2
