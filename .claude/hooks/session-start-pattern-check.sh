#!/bin/bash
# Session-Start Hook: Pattern Library Check
#
# Checks for pattern library updates on session start
# Reminds agents to check patterns_library/ before implementation

PATTERN_DIR="patterns_library"
PATTERN_COUNT=$(find "$PATTERN_DIR" -name "*.md" -type f -not -name "README.md" 2>/dev/null | wc -l | tr -d ' ')

if [ -d "$PATTERN_DIR" ]; then
  echo "📚 Pattern Library Status:"
  echo "   Location: $PATTERN_DIR"
  echo "   Available patterns: $PATTERN_COUNT"
  echo ""
  echo "   Quick Reference:"
  echo "   - API patterns: $PATTERN_DIR/api/"
  echo "   - UI patterns: $PATTERN_DIR/ui/"
  echo "   - Database patterns: $PATTERN_DIR/database/"
  echo "   - Testing patterns: $PATTERN_DIR/testing/"
  echo "   - Security patterns: $PATTERN_DIR/security/"
  echo "   - Config patterns: $PATTERN_DIR/config/"
  echo "   - CI patterns: $PATTERN_DIR/ci/"
  echo ""
  echo "   💡 Remember: Check pattern library BEFORE implementation!"
  echo "   Run: cat $PATTERN_DIR/README.md"
else
  echo "⚠️  Pattern library not found at $PATTERN_DIR"
fi

echo ""
echo "🤖 Agent System Ready"
echo "   11 agents available in .claude/agents/"
echo "   Tool restrictions: ✅ Configured"
echo "   Model selection: ✅ Opus (planning), Sonnet (execution)"
echo ""

exit 0
