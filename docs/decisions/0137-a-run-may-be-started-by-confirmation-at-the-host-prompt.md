---
id: 0137-a-run-may-be-started-by-confirmation-at-the-host-prompt
title: A run may be started by the agent when a person confirms it at the host prompt
status: draft
date: 2026-10-12
tags: [hooks, enforcement, roadmap]
track: product
---

## Decision

Draft, for the owner's sign-off. When accepted it amends item 1 of 0130 ("starting a run is the human act"): the human act is the confirmation, not typing the command.

1. **The agent may propose a run.** A request such as "execute it as a batch" triggers the `autonomous-run` skill, which resolves the plan and range, states them, and calls `go-getter run start <plan> [--through N] [--hours H]`.
2. **Where the host's hook can ask, the hook asks instead of denying** (`hooks.askPreTool`, as for the first use of an outward shape in 0126 and 0135). The prompt shows what the command resolves to, not only its text: plan, step range, granted shapes, timeout and spend cap. Confirming starts the run; declining refuses it.
3. **Where the host cannot ask, nothing changes:** the hook denies, and the agent tells the person which command to run.
4. **Grants cannot be widened by the agent.** `--grant` stays refused for an agent; a started run grants the shapes of the project's `run-grants` answer, or fewer.
5. **`run end` is free for the agent.** Ending a run only removes authority. Its report still goes through the tracker's write rules and secret check (0130 item 9).
6. **The record stays unwritable by an agent.** Only the CLI, after the prompt, writes it; the store protection of 0126 is unchanged.
7. **The spend cap must bind first.** This is built only after a run's spend is recorded on the hosts it is used on (the cap reads the telemetry log, 0130 item 6); otherwise a confirmed run is unbounded in spend.

## Why

Typing `go-getter run start …` in a shell is a context switch for a person already talking to the agent, and a free-form request is how they work. The prompt keeps the deliberate act and shows what is being granted, so the protection of 0130 item 1 (an agent cannot grant itself authority unseen) holds, while the typing goes away.

## Tradeoffs considered

- **Keep the human-typed command (0130 as is):** safest and the least work, but every run starts with a shell line outside the conversation.
- **A user-only slash command per host:** keeps a human act and needs no hook change, but the formats differ per host (Claude Code, OpenCode, Kilo, Gemini CLI plausible; Cursor, Codex, Copilot not) and each is a per-host output.
- **The agent starts a run without a prompt:** removes the human act; rejected.
- **Cost accepted:** a prompt-injected agent can put a run in front of the person (the prompt shows range and grants so it can be refused); host modes that skip prompts may defeat the ask, to be tested; hosts without hook asks keep the old path.
