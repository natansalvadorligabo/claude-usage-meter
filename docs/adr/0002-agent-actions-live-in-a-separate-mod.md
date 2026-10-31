# Anything that acts on the agent lives in a separate mod and never denies tools

The meter only observes. Behaviour that changes what the agent does near a limit (adding to the prompt, checkpointing work) belongs in a separate mod that reads the same `latest-limits.json`, so installing the meter never changes how Claude works. That mod adds instructions and never denies tools: Claude Code already resumes on its own once a limit resets, and blocking tools near the limit would cut off the work that should carry on.

## Considered Options

- **Deny heavy tools (Agent, Workflow) near the limit:** rejected, since it breaks the continuation after the reset.
- **Auto-resume or a task queue at reset:** not needed, since Claude Code already resumes.
- **One-time checkpoint prompt** (around 95% of the session, ask for a WIP commit and a note with the next step, so the state survives even if nobody comes back to resume): still open. Before building it, check that the prompt reaches the right turn and that a whole-percent threshold isn't skipped by one heavy turn (93% → 100%).
