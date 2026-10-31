# The meter shows four numbers and nothing more

The footer shows context, the 5-hour session, the weekly limit and the daily budget, and stops there. People glance at the bar and rarely study it; when they need detail, `/usage` already has it, so every extra item on the footer dilutes the four that matter. A market review in October 2026 found most competing statuslines growing in the opposite direction, which is the gap this mod fills.

## Considered Options

Rejected for the footer, with the reason each one keeps coming back:

- **Session ETA** (when the 5-hour limit runs out at the current pace): the session bar already shows how close you are, and whole-percent readings make early estimates noisy.
- **Compaction warning or marker:** Claude Code now compacts on its own, idle sessions included, so a "will compact" marker arrives late.
- **Cost of the last response** and **per-subagent attribution:** `/usage` covers attribution, and whole-percent readings hide the cost of a single response.
- **Cold-cache icon:** Claude Code warns about it itself.
- **Per-model limits and usage credits:** they only exist on plans the maintainer can't test (Max). Limit kinds other than `five_hour` and `seven_day` are ignored, so a new one never breaks the footer.
- **Other providers (Codex, Cursor, Gemini)** and **switching accounts at the limit:** menu-bar apps such as CodexBar already cover providers, and account switching risks the terms of service.
