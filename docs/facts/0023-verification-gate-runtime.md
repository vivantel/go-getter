---
id: 0023-verification-gate-runtime
title: The verification gate runs adopted check commands by task class and blocks a stop through the shared hook runtime; four hosts can block, the stop answer shapes of Codex and Cursor are unconfirmed
status: active
date: 2026-10-06
tags: [verification, practice-packs, compiler, hooks]
kind: decision
governed-by: 0031-verification-gate-pack-defaults
---

- `go-getter verify --class <explore|plan|implement|review|debug>` runs the checks of the class (`compiler/src/verify.mjs`): implement and debug run the commands of the adopted decisions (`go-getter.verify-scope`, `verify-<check>-command` for each check of the catalog of decision 0071; an empty command is skipped) whose `verify-where` placement is `local` or `both` (no placement, as adopted before pack 0.2.0: all local); review runs every tier-3 guardrail check when the bar is verdict + conform; explore and plan have none. Exit 0 when all pass or none are configured, 1 on a failure, 2 on a bad class. Check commands run through the shell, with the same trust as a literal guardrail `run` command.
- Each check records one telemetry line (`event: verify:<check>`, `taskClass`, `outcome` pass or fail, `host` when given); check output is shown to the agent and never recorded.
- `go-getter hook stop --host <id>` is a third event of the shared runtime (decision 0025 lists `pre-tool` and `session-start`); it runs the implement checks when the working tree has changes (a question-and-answer session is not gated). While they fail it blocks, at most `go-getter.max-escalations` times per session (default 2, the cost-routing answer of decision 0032), then allows the stop with a hand-over message, records `escalated` and starts the count afresh. State lives in `verify-blocks.json` under the gitignored state directory.
- The gate is the tier-2 entry `builtin:verify-gate` of guardrail `verification-gate-blocks-done`. `apply` installs the stop hook (`Stop` on Claude Code and Codex, `AfterAgent` on Gemini CLI, `stop` on Cursor) only where the capability manifest has `hooks.blockStop`, and installs the pre-tool hook only when a path guardrail exists. Copilot, Kilo and OpenCode stay advisory (tier 1).
- Blocking answer: exit 2 with the reason on stderr (Claude Code, Codex, Gemini CLI); on Cursor, exit 0 with `{"followup_message": <reason>}`.
- Not confirmed against vendor documentation: the Codex `Stop` entry shape in `hooks.json`, and Cursor's `followup_message` field name (fact 0006 says only that the stop hook's follow-up enables verify loops).
