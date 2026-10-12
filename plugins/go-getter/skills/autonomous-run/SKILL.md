---
name: autonomous-run
description: Works through an autonomous run a person started on a plan range, following `go-getter run next` until it finishes or stops and hands over. Use when a run is active, e.g. "continue the run", "work through the plan range", "go-getter run status shows an active run".
---

A run is a plan range a person started (`go-getter run start`). You cannot start or end one. Inside it the granted outward commands and the run's step comments and closes need no asking; the always-human set (force-push, history rewrites, settings, tags, releases, publishing) stays with a person.

## Loop

1. `go-getter run status`. No active run: stop, nothing is granted.
2. `go-getter run next`. It prints the next step, or `stop (<code>)` with a reason and exits 1.
3. On a step: follow `docs/skills/working-a-change.md` for it (start, change, checks, pull request, merge when its checks are green, close the step's issue). Then go to 2.
4. On a stop: do not work around it. Write what you did and why you stopped for the person, and finish the turn.

## Stops (never skip one, never take a later step instead)

- `spend-cap`: the cap is reached.
- `human-needed`: the step carries `Human:` or is blocked.
- `red-attempts`: two fix attempts failed on one step.
- `repeated-denial`: a guardrail denied the same kind of call twice on one step.
- `needs-open`: the step needs one that is not done.
- Range finished: report it; a person ends the run.

## Red checks

When CI or a step check fails, fix the cause and run `go-getter run attempt <step>` once per failed attempt. After the second, run `go-getter run next`; it stops. Never merge a red pull request.

## After a denial

A denial is recorded. Take another permitted route to the same end (a different command shape, a pull request instead of a push); never retry the same call, rephrase it to pass a pattern, or edit the guardrail. A second denial by the same guardrail on a step stops the run.
