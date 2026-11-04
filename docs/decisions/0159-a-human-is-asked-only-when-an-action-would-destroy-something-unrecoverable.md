---
id: 0159-a-human-is-asked-only-when-an-action-would-destroy-something-unrecoverable
title: A human is asked only when an action would destroy something unrecoverable, judged from the repository's state
status: active
date: 2026-11-01
tags: [positioning, hooks, enforcement, guardrail, roadmap]
track: product
accepted-by: sergemso
---

## Decision

go-getter automates first, guides second and stops a human last. The primary user is a solo power user working hours a day with a host agent; defaults free-run and control is opt-in.

1. **State, not command name.** A gated command runs without a human unless the repository's actual state shows it would destroy something that cannot be recovered. A branch whose tip is on the remote or in a merged pull request deletes freely; uncommitted work, a force-push over commits others may hold and `rm -rf` outside a temporary directory still ask. The pre-tool hook reads the state; the native ask rules, which are prefix globs an allow rule cannot override, are written only for commands whose danger is not state-dependent.
2. **Outward-facing production actions stay gated; other channels are free.** Production release, package publish and repository settings or secrets need a human (releases batched, 0155). The project declares its free channels in a pack answer (for example a prerelease version, an npm dist-tag, a stage environment); every channel not listed is production. Creating a tag is free.
3. **A hook-less host runs free.** A host whose hook cannot ask a person (or that has none) gets the git-hook floor and a checkpoint before a state-dependent action, not extra prompts, so the experience is the same on every host.
4. **A stop is a guide.** Every stop names what would be lost, offers the safe path (a verb, or a checkpoint taken first) and offers a one-step approve-and-remember, so the same case never asks twice. Each stop is logged as metadata.
5. **A budget.** At most one go-getter approval prompt per merged pull request, reported by `go-getter metrics day` (0154). A week in which the rate rises is a regression to fix before more gates ship. Prompts of the host agent itself are not counted.
6. **A new gate names what it protects.** A gate that only ever produces approvals is flagged for removal in the audit.

This supersedes 0120, whose rule that irreversible commands "stay gated whatever the list says" is replaced by item 1. It narrows 0095 (gates both classes) and the guardrail `gated-actions-need-human-approval`; both are regenerated from the `hitl` pack once the pack follows this decision (roadmap phase 0).

## Why

Friction decides adoption. On 2026-10-31 the owner approved every merge and release and relayed one-word answers (fact 0040), and a blanket gate on `git branch -D` asked for branches whose commits were already on `origin`. A command-name rule asks where nothing is at risk and cannot see the cases that are: deleting a merged branch loses nothing, while `reset --hard` on a dirty tree does. Gating by state puts the stop where the loss is.

## Tradeoffs considered

- **A shorter fixed command list:** simple, but still blind to state, so it asks on safe cases and misses unsafe ones outside the list.
- **A daily prompt budget alone:** targets the metric but says nothing about whether one action is dangerous; kept only as the success measure.
- **Extra prompts on hook-less hosts:** safer, but a different experience per host; the git-hook floor and checkpoints cover recovery instead.
- **Cost accepted:** a wrong "safe" verdict from the state check loses work, so the check is tested first on branches with unpushed commits and on a dirty tree; and a project that lists a production channel as free publishes without a human.
