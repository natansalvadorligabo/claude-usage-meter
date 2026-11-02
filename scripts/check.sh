#!/bin/sh
# Every check a change must pass: run locally before a PR, and in CI on each push.
set -eu
cd "$(dirname "$0")/.."

claude plugin validate .
claude plugin test .

# Claude Code writes .claude-plugin/types/ only when it loads the mod from this folder (`claude --plugin-dir .`), never in CI or a fresh worktree.
if [ -f .claude-plugin/types/tsconfig.json ]; then
  npx --yes -p typescript@5.6.3 tsc -p .
else
  echo "typecheck skipped: .claude-plugin/types/ is missing; run 'claude --plugin-dir .' once to write it"
fi
