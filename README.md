# Claude Usage Meter

A Claude Code mod (installed like a plugin) that shows context, 5-hour session and weekly usage on the
footer row, plus a daily budget that tells you whether today's pace fits what is left of the week.

![The meter on the footer: usage climbs while the agent works, hovering shows the labels, the settings pane switches charts and language, and the daily budget turns from on track to over](docs/media/demo.gif)

## What it shows

| Metric       | What it is                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------- |
| Context      | How full the model's context window is. Its colors turn orange at 50%, where compaction usually gets close. |
| Session      | The 5-hour usage limit, with the time it resets.                                                |
| Weekly       | The 7-day usage limit, with the day and hour it resets.                                         |
| Daily budget | Weekly % spent today against today's share: `(100 − weekly % at the start of the day) / days until the reset`. |

The daily budget shows `✓` while you are on track, `◐` past 80% of today's share and `✗` over it.
It can skip Saturdays and Sundays when splitting what is left; today always counts.

## Settings

Click anywhere on the footer or run `/usage-meter` to open the settings pane:

- **Language:** English or Português.
- **Labels:** always shown, shown on hover, or hidden.
- **Colors:** a green-to-red scale per metric, or plain text.
- **Per metric:** visible or hidden; chart as a number, bar (`███░░░░░`), dots (`●●●○○○○○`), level (`▃`) or pie (`◑`);
  the percent; and, for session and weekly, the reset time.

Settings are kept across sessions.

## Several terminals

The usage limits belong to the whole account, but each terminal only hears about them after its own responses.
Every terminal writes its newest reading to `~/.claude/usage-meter/latest-limits.json` (under `CLAUDE_CONFIG_DIR` when set),
and the others pick it up within 10 seconds. No extra API calls are made.

## Install

Requirements: **Claude Code 2.1.29x or newer** (the mod uses the function hooks API, a `hooks.json` module that runs inside Claude Code).

```sh
claude plugin marketplace add natansalvadorligabo/claude-usage-meter
claude plugin install usage-meter@claude-usage-meter
```

Start a new session and the meter appears on the footer.

To try a local clone instead: `claude --plugin-dir /path/to/claude-usage-meter`.

## Develop

```sh
claude plugin validate .
claude plugin test .
tsc -p .            # once Claude Code has loaded the mod and written .claude-plugin/types/
```

## Limitations

- Session and weekly limits only appear on subscription accounts.
- The hover background is `#0c0c0c` (Windows Terminal's Campbell scheme).
- Glyphs such as `◔ ◑ ◕` depend on the terminal font.

## License

[MIT](LICENSE)
