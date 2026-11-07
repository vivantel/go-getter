---
id: draft-agents-do-their-own-prep
title: An agent does a change's preparation itself and hands a person only gated actions, as questions
status: draft
date: 2026-11-06
tags: [coordination, agent-roles, procedural]
track: product
---

## Decision

Pending the owner's acceptance. Narrows the handoff rule of decision 0130 and the agent-human split of 0154 without changing either.

1. **Preparation is the agent's.** Before a pull request, the agent runs the project's preparation itself: knowledge capture, conformance to decisions and guardrails, lint at a plan phase boundary, and the commit message and description. It fixes what they find.
2. **A person gets only gated actions.** What reaches a person is an approval, a `Human:` step, a write a guardrail gates, or the always-human set (0130 item 4, 0159 item 2). Each is one question, not a list of steps for the person to do.
3. **Questions use the host's question tool** where it has one (options, "Other" for free text); otherwise one plain question. Neutral source names no host tool (`neutral-source-has-no-host-specific-language`).
4. **Both paths say it:** the `autonomous-run` skill and the `git-workflow` procedure `working-a-change`, so an orchestration without a run follows it too.

## Why

An orchestration of three plan steps ended with the agent listing capture, conform, lint and attribute as "next, for you". The product's measure is human minutes per merged outcome (0154); a relay of work the agent can do is the cost it exists to remove. The owner called it out on 2026-11-06.

## Tradeoffs considered

- **A gate (a check that blocks a pull request without a recorded conform and lint):** enforces it, at the cost of recording state per change. Deferred until the instruction alone fails.
- **Keep the list, shorter:** still a relay.
- **Cost accepted:** the agent spends tokens on prep that a person might have skipped.
