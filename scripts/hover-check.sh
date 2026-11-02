#!/usr/bin/env bash
# Human-in-the-loop check of the footer hover (docs/adr/0003), which no test can see:
# `claude plugin test` checks the element tree, not what the terminal paints.
# Prints KEY=VALUE lines at the end for an agent to read.
set -euo pipefail
cd "$(dirname "$0")/.."

step() {
  printf '\n>>> %s\n' "$1"
  read -r -p "    [Enter when done] " _
}

capture() {
  local var="$1" question="$2" answer
  printf '\n>>> %s\n' "$question"
  read -r -p "    > " answer
  printf -v "$var" '%s' "$answer"
}

step "In another terminal window, run: claude --plugin-dir $(pwd)   and send one short prompt so the footer has numbers."

step "Switch that terminal to a LIGHT color scheme."
capture LIGHT_BLOCK "Hover the meter on the footer. Is any part painted with a dark or off-color block? (y/n)"
capture LIGHT_INVERT "Put the pointer right on a number. Do its colors swap (inverted text)? (y/n)"

step "Switch that terminal to a DARK scheme other than Campbell (e.g. One Half Dark, Solarized Dark)."
capture DARK_BLOCK "Hover the meter on the footer. Is any part painted with an off-color block? (y/n)"
capture DARK_INVERT "Put the pointer right on a number. Do its colors swap (inverted text)? (y/n)"

capture TERMINAL "Which terminal and version? (e.g. Windows Terminal 1.25)"

printf '\n--- Captured ---\n'
printf 'CLAUDE_CODE=%s\n' "$(claude --version 2>/dev/null || echo unknown)"
printf 'TERMINAL=%s\n' "$TERMINAL"
printf 'LIGHT_BLOCK=%s\nLIGHT_INVERT=%s\n' "$LIGHT_BLOCK" "$LIGHT_INVERT"
printf 'DARK_BLOCK=%s\nDARK_INVERT=%s\n' "$DARK_BLOCK" "$DARK_INVERT"
printf 'PASS=%s\n' "$([ "$LIGHT_BLOCK$LIGHT_INVERT$DARK_BLOCK$DARK_INVERT" = nnnn ] && echo yes || echo no)"
