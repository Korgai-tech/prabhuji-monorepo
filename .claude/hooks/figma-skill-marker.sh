#!/bin/bash
# PostToolUse (Skill|Read): record that the figma-flutter skill was loaded this
# session. The marker unlocks figma-skill-gate.sh. Counts either a Skill tool
# invocation of figma-flutter or a Read of any file in the skill's directory.

INPUT=$(cat)
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // "global"' 2>/dev/null)
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)

if [ "$TOOL" = "Skill" ]; then
  SKILL=$(printf '%s' "$INPUT" | jq -r '.tool_input.skill // empty' 2>/dev/null)
  [ "$SKILL" = "figma-flutter" ] && touch "/tmp/claude-figma-skill-${SID}"
else
  FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
  case "$FILE" in
    */skills/figma-flutter/*) touch "/tmp/claude-figma-skill-${SID}" ;;
  esac
fi
exit 0
