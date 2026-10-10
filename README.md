# go-getter

*Set up a production-grade agent harness and SDLC practices for your AI coding agent — the required quality at minimal token spend, with zero friction.*

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Agent = Model + Harness. go-getter configures the harness around your host agent — orchestration and agent roles, context management, verification loops, guardrails and DLP, human-in-the-loop gates, checkpointing, quality-gated cache-aware model routing, cost control, observability — plus the SDLC practices it works within: branching, worktrees, parallelization, testing, commit and PR rules. Setup is one guided interview; every choice is recorded as a durable, enforceable decision.

Host agents: Claude Code, Codex, Kilo Code, OpenCode, Cursor, Gemini CLI, GitHub Copilot.

## Install

One plugin, seven host agents — see [INSTALLING.md](INSTALLING.md). Then ask your agent to *"set up the agent harness here"*.

## What it sets up

Eight harness packs and one SDLC pack, each a short guided interview with a recommended default per question; every answer becomes a decision or guardrail in `docs/`, and `go-getter apply` generates the enforcement per host agent.

| Pack | Component | What you choose |
|---|---|---|
| `context` | 4 Context management | instruction-file cap, procedure delivery, noisy-work placement, cache hygiene, compaction timing, watcher noise |
| `verification-gate` | 6 Verification loops | which checks mean "done" and where each runs (locally or in CI), the review bar, whether failing checks block completion |
| `governance` | 7 Guardrails & DLP | restricted paths, their access modes and enforcement, whether the lines a change adds are scanned for secrets, whether personal data in tool output is masked, which providers may see internal and confidential data, prompt logging |
| `hitl` | 8 Human-in-the-loop | which shell commands need a human (irreversible, outward-facing, both), project-specific patterns |
| `checkpointing` | 9 Checkpointing | whether work is saved to a hidden git ref before a gated command or a plan step, who takes it (the pre-tool hook or the agent), how many are kept |
| `orchestration` | 10 Multi-agent orchestration | agent roles compiled to each host's native format, worktree isolation, concurrency limit |
| `cost-routing` | 11 Cost & model routing | task classes, starting tiers, escalation bound, headless spend cap, prompt-cache lifetime |
| `telemetry` | 12 Observability | a metadata-only step log, its retention and export |
| `git-workflow` | SDLC (no component) | the branch name pattern, whether the default branch is protected by a git hook and CI, whether `Refs:` trailers are required, encouraged or off; Conventional Commit subjects, squash merge with green CI and one change per branch and pull request are fixed |

### Harness coverage

How each rule ends up enforced, per component and host agent, once all eight packs are adopted (`go-getter coverage` prints this for your project): `hook+ci` = blocked by a host hook and checked in CI, `hook` = blocked or prompted by a host hook or permission rule, `ci` = checked in CI, `advisory` = instruction only, `-` = not covered yet.

| Component | Pack | Claude Code | Codex | Kilo | OpenCode | Cursor | Gemini CLI | Copilot |
|---|---|---|---|---|---|---|---|---|
| 1 Orchestration loop | — | - | - | - | - | - | - | - |
| 2 Tool registry | — | - | - | - | - | - | - | - |
| 3 Execution sandbox | — | - | - | - | - | - | - | - |
| 4 Context management | `context` | ci | ci | ci | ci | ci | ci | ci |
| 5 Memory | — | - | - | - | - | - | - | - |
| 6 Verification loops | `verification-gate` | hook | hook | advisory | advisory | hook | hook | advisory |
| 7 Guardrails & DLP | `governance` | hook+ci | hook+ci | hook+ci | hook+ci | hook+ci | hook+ci | hook+ci |
| 8 Human-in-the-loop | `hitl` | hook | hook | hook | hook | hook | hook | advisory |
| 9 Checkpointing | `checkpointing` | hook | hook | hook | hook | hook | hook | advisory |
| 10 Multi-agent orchestration | `orchestration` | advisory | advisory | advisory | advisory | advisory | advisory | advisory |
| 11 Cost & model routing | `cost-routing` | hook | hook | hook | hook | hook | hook | hook |
| 12 Observability | `telemetry` | - | - | - | - | - | - | - |

Component 7 also reports where tool output is masked (secrets, and personal data when the project masks it): on every host that can replace tool output, which is all but Cursor and OpenCode, so there nothing is masked and the coverage report says so. Prompts and file writes are never masked.

Known gaps (hosts without a blocking stop hook, unconfirmed hook shapes, routing that is advisory where a host has no model lever) are listed under "Known enforcement debt" in the [plan](docs/plans/v0.2-agent-core-hardening.md). Plan-guided work, watcher noise, access modes for restricted paths, local and CI checks, calibration, observability export, human-in-the-loop gates and checkpointing come in v0.2; the git workflow and spec workflow in v0.3; testing practices and memory in v0.4.

## Develop

`npm test` (unit), `npm run build` and `npm run check:generated` (golden output), `npm run eval` (behavior evals), `npm run check:*` (guardrails). Releases are gated on all three layers ([decision 0013](docs/decisions/0013-layered-verification-gate.md)). Decisions and guardrails live in [`docs/`](docs/decisions/); the plan and its status are in [`docs/plans/`](docs/plans/v0.2-agent-core-hardening.md) (`go-getter plan status|next|start|done`).

**Status:** v0.2 in progress.

The name means *one who gets things done* — it has nothing to do with the Go language.
