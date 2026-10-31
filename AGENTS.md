# AGENTS.md

Claude Code mod (installed like a plugin, distributed through this repo's own marketplace) that draws context, 5-hour session, weekly usage and a daily budget on the footer. `README.md` covers what users see.

## Shipping a change

Every change reaches `main` through a pull request, never a direct commit:

1. Branch off an up-to-date `main` (`fix/…`, `feat/…`, `chore/…`).
2. Make the change with tests; `claude plugin validate .` and `claude plugin test .` both pass.
3. Bump `version` in `.claude-plugin/plugin.json` in the same branch, as semver: patch for fixes, minor for new metrics or settings, major when saved settings stop loading.
4. Open the PR with the `pr` skill's template (Summary, Evidence with before/after, Merge Danger).

The version bump is what makes the release: installed copies are keyed by `version`, so a change merged without a bump never reaches anyone who installed from the marketplace. Third-party marketplaces also don't auto-update by default, so users still run `/plugin marketplace update claude-usage-meter` (or turn on auto-update) to pick it up.

When two open PRs both append tests to the end of `hooks/register.test.tsx`, the second to merge conflicts there; keep both blocks and re-run the tests.

## Commands

```sh
claude plugin validate .   # manifest and hooks.json
claude plugin test .       # every *.test.tsx; there is no filter for a single test
tsc -p .                   # needs .claude-plugin/types/, written once Claude Code has loaded the mod
claude --plugin-dir .      # run a local clone
```

## Architecture

All code is `hooks/register.tsx`, loaded through `hooks/hooks.json` as a function-hooks module; `types/index.d.ts` holds the domain types and the `PluginState` atoms (`config`, `usage`, `baseline`).

- **Data in:** `session.start` seeds from `$.session.usage()`, `session.measure` updates after each response, `session.compact` recomputes the context from `tokensAfter`. No API calls are made.
- **Several terminals:** limits belong to the account, so each terminal publishes its newest reading to `~/.claude/usage-meter/latest-limits.json` (under `CLAUDE_CONFIG_DIR` when set) and every 10 s `syncLimits` adopts a newer one and drops readings past their `resetsAt`. A writer never replaces a newer `measuredAt`.
- **Settings:** stored under `settings.v2` in `$.store`, which all terminals share. Pane changes read the saved value, apply the change and write it back, queued per terminal, so one terminal never undoes another's choice. Changing the shape needs a new key or a migration in `mergeWithDefaults`.
- **Daily budget:** `dayBaseline` in the store records the weekly percent at the start of each local day.
- **UI:** `ui.render` for `SessionMode` draws the footer; for `Pane` the settings. Text lives in `MESSAGES` (`en`, `pt-BR`); add both.

Tests use `claude-code/testing`: `answerEngine` stubs the store, files and clock, so time-based behaviour is tested with `clock.advance`.
