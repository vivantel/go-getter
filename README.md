# go-getter

*Coordinate humans and AI agents to achieve outcomes — software delivery first, with a production-grade agent harness and SDLC practices for your AI coding agent, the required quality at minimal token spend, and zero friction.*

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

go-getter coordinates humans and agents working many units of work in parallel toward an outcome: a result in the world that a meter can read ([decision 0176](docs/decisions/0176-go-getter-coordinates-humans-and-agents-to-achieve-outcomes-in-any-domain.md)). Software delivery is the first domain and the only one fully supported today; other domains are possible, not yet supported (see [Scope](#scope)).

Agent = Model + Harness. go-getter configures the harness around your host agent — orchestration and agent roles, context management, verification loops, guardrails and DLP, human-in-the-loop gates, checkpointing, quality-gated cache-aware model routing, cost control, observability — plus the SDLC practices it works within: branching, worktrees, parallelization, testing, commit and PR rules. Setup is one guided interview; every choice is recorded as a durable, enforceable decision.

Host agents: Claude Code, Codex, Kilo Code, OpenCode, Cursor, Gemini CLI, GitHub Copilot.

## Scope

Software delivery is fully supported: the harness packs, the verification layers and the SDLC practice packs below are built for it. Another domain is possible with the same units, meters and acceptance, but it is supported only when its units have an `Accept` that someone other than the author can run, its effects are classed, and its meters exist; a worker without git push access takes part through the tracker. Until a domain meets those conditions it is possible, not supported, and starts with fewer checks and more human review than software has. The effect classes are not shipped yet, so no domain other than software meets the conditions today. The name, CLI, plugin and packs are the same in every domain.

## The five parts

The framework splits by what each part owns ([decision 0177](docs/decisions/0177-each-part-of-the-framework-owns-one-artifact-and-one-kind-of-decision.md)):

- **Discover** (`discover` skill): the *outcome brief* in `docs/outcomes/`: the hypothesis, the meter, a target, a window and an attribution method. It says what is worth achieving and how success is read.
- **Decompose** (`roadmap` skill): splits an approved brief into a unit tree with scope and `Accept`.
- **Deliver** (`go-getter work` and `queue`): claims, lifecycle and acceptance of each unit.
- **Measure** (`go-getter measure`): a *meter* in `docs/meters/` names what is read and how; a reading is data, taken by any worker able to take it.
- **Operate**: defined as an operating charter (`go-getter operation check|status`) for what is live after delivery; no skill or verb runs it yet.

## Install

One plugin, seven host agents — see [INSTALLING.md](INSTALLING.md). Then ask your agent to *"set up the agent harness here"*.

## What it sets up

Ten harness packs and two SDLC (practice) packs, each a short guided interview with a recommended default per question; every answer becomes a decision or guardrail in `docs/`, and `go-getter apply` generates the enforcement per host agent.

| Pack | Component | What you choose |
|---|---|---|
| `context` | 4 Context management | instruction-file cap, procedure delivery, noisy-work placement, cache hygiene, compaction timing, watcher noise |
| `verification-gate` | 6 Verification loops | which checks mean "done" (including a coverage command and bar) and where each runs (locally or in CI), the review bar, whether failing checks block completion |
| `restricted-data` | 7 Guardrails & DLP | restricted paths, their access modes and enforcement, how secrets are used and where they may be written, which hosts may handle restricted data |
| `sanitization` | 7 Guardrails & DLP | whether the lines a change adds are scanned for secrets, which paths the scan skips, whether personal data in tool output is masked, whether MCP call arguments are scanned for secrets |
| `data-policy` | 7 Guardrails & DLP | which providers may see internal and confidential data, prompt logging |
| `hitl` | 8 Human-in-the-loop | which shell commands need a human (irreversible, outward-facing, both), project-specific patterns, outward commands that may run unasked, which an autonomous run may grant (see [INSTALLING.md](INSTALLING.md#autonomous-runs)), and which MCP servers and tools agents may use (see [INSTALLING.md](INSTALLING.md#mcp-servers)) |
| `checkpointing` | 9 Checkpointing | whether work is saved to a hidden git ref before a gated command or a plan step, who takes it (the pre-tool hook or the agent), how many are kept |
| `orchestration` | 10 Multi-agent orchestration | agent roles compiled to each host's native format, worktree isolation, concurrency limit |
| `cost-routing` | 11 Cost & model routing | task classes, starting tiers, escalation bound, headless spend cap, prompt-cache lifetime |
| `telemetry` | 12 Observability | a metadata-only step log, its retention and export |
| `git-workflow` | SDLC practice (no component) | the branch name pattern, whether the default branch is protected by a git hook and CI, whether `Refs:` trailers are required, encouraged or off; Conventional Commit subjects, squash merge with green CI and one change per branch and pull request are fixed |
| `tracker` | SDLC practice (no component) | whether plan steps live in the plan files, GitHub Issues or Jira, how Jira is reached (the site, and the names of the variables holding the credentials), and whether go-getter may create, comment on and close issues (off, ask or allow) |

**Harness packs** (the `family` in each `pack.json` is `harness`) configure the twelve components around a host agent. They assume a shell and git as the substrate (checkpoints are hidden git refs, orchestration uses worktrees) and name no hosting provider or language: hosting commands come from a provider table (GitHub first), and `verification-gate` runs whatever check commands the project gives it. **Practice packs** (`family` is `sdlc`: `git-workflow`, `tracker`) set up software-delivery habits (branch names, commit and pull request rules, where plan steps live) and may name GitHub or Jira. A test keeps hosting-provider wording out of harness packs.

### Harness coverage

How each rule ends up enforced, per component and host agent, once all eight packs are adopted (`go-getter coverage` prints this for your project): `hook+ci` = blocked by a host hook and checked in CI, `hook` = blocked or prompted by a host hook or permission rule, `ci` = checked in CI, `advisory` = instruction only, `-` = not covered yet. `(deferred)` = the host's adapter is a wrapper over Claude Code's code, not yet verified against a live host; `(unconfirmed)` = the tier rests on a host shape its source fact marks unconfirmed. The table is generated from `go-getter coverage` (`go-getter check docs-consistency --fix` rewrites it; CI fails when it drifts).

| Component | Pack | Claude Code | Codex | Kilo | OpenCode | Cursor | Gemini CLI | Copilot |
|---|---|---|---|---|---|---|---|---|
| 1 Orchestration loop | — | - | - | - | - | - | - | - |
| 2 Tool registry | — | - | - | - | - | - | - | - |
| 3 Execution sandbox | — | - | - | - | - | - | - | - |
| 4 Context management | `context` | hook+ci | hook+ci (deferred) | hook+ci | hook+ci | hook+ci (deferred) | hook+ci (deferred) | hook+ci (deferred) |
| 5 Memory | — | - | - | - | - | - | - | - |
| 6 Verification loops | `verification-gate` | hook | hook (deferred) | advisory | advisory | hook (deferred) | hook (deferred) | advisory (deferred) |
| 7 Guardrails & DLP | `data-policy`, `restricted-data`, `sanitization` | hook+ci | hook+ci (deferred) | hook+ci | hook+ci | hook+ci (deferred) | hook+ci (deferred) | ci (deferred) |
| 8 Human-in-the-loop | `hitl` | hook | hook (deferred) | hook | hook | hook (deferred) | hook (deferred) | advisory (deferred) |
| 9 Checkpointing | `checkpointing` | hook | hook (deferred, unconfirmed) | hook | hook | hook (deferred) | hook (deferred) | advisory (deferred) |
| 10 Multi-agent orchestration | `orchestration` | ci | ci (deferred) | ci | ci | ci (deferred) | ci (deferred) | ci (deferred) |
| 11 Cost & model routing | `cost-routing` | hook | hook (deferred) | hook | hook | hook (deferred) | hook (deferred) | advisory (deferred) |
| 12 Observability | `telemetry` | - | - | - | - | - | - | - |

Component 7 also reports where tool output is masked (secrets, and personal data when the project masks it): on every host that can replace tool output, which is all but Cursor and OpenCode, so there nothing is masked and the coverage report says so. Prompts and file writes are never masked.

Known gaps (hosts without a blocking stop hook, unconfirmed hook shapes, routing that is advisory where a host has no model lever) are listed under "Known enforcement debt" in the [plan](docs/plans/archive/v0.2-agent-core-hardening.md). Plan-guided work, watcher noise, access modes for restricted paths, local and CI checks, calibration, observability export, human-in-the-loop gates and checkpointing come in v0.2; the git workflow and spec workflow in v0.3; testing practices and memory in v0.4.

## Sanitization

The `sanitization` pack (0.6.0) keeps secrets and personal data away from the model and out of commits:

- **Scanning.** The lines a commit, push or pull request *adds* are scanned for private keys, common token formats, JWTs and labelled `password=…` values; a finding names file, line and kind, never the value. Skip a line with `go-getter:allow-secret` or a path with the `scan-allow-paths` answer. No entropy detection; a token format that is not listed is missed.
- **Masking.** Tool output has secrets replaced by `[redacted by go-getter]` and, if you opt in, email addresses, card numbers and IBANs by stable per-session names (`[email-1]`). Phone and national-ID formats are an opt-in list. Prompts and file writes are never masked, and Cursor and OpenCode cannot replace tool output at all.
- **`go-getter secret run|put`.** A restricted path reaches a command without the model seeing it (`secret run --from <file> -- <command>`); you approve a command once, at the host's prompt, and the approval is remembered per user outside git and lapses when the command's code changes (`go-getter approvals list|revoke`; a project can also share an approved list in `use-commands`). A path in `sink` mode is filled from stdin or a declared command (`secret put`). Output is scrubbed. A secret still reaches a process that could send it elsewhere, so `use` is advisory without a network-restricted sandbox.
- **`go-getter sandbox [--host <h>]`** prints each host's own secret settings built from your restricted paths, marked confirmed or not confirmed, for you to put in your user settings. It writes nothing, and `apply` never writes them. Cursor, Kilo and OpenCode have no such lever.

Not covered: prompts, secrets already in history, values re-encoded by an approved command, and hosts without a blocking pre-tool hook.

## Shipping a change

`go-getter ship --why "<intent>"` takes a branch from working tree to merge with no model: it runs the adopted guardrail checks, writes the commit message and pull request description (intent first, `Refs:` trailers from `go-getter refs`), pushes, opens the pull request, waits for CI and squash-merges on green. It stops on a red check or red CI and leaves the pull request open; `--dry-run` writes nothing and `--review` adds a read-only Claude review of the diff that can stop the run. `go-getter pr` does the same up to and including the CI wait and never merges, for a pull request someone reviews first. It needs `git`, an `origin` and the `gh` CLI, and is gated wherever pushes, pull requests and merges are ([decision 0163](docs/decisions/0163-ship-means-the-whole-way-to-merge-and-pr-is-the-verb-for-stopping-at-the-pull-request.md)).

`go-getter release --batch` releases everything merged since the last tag as one pull request, with no model: it derives the version bump from the Conventional Commit types, writes the changelog entry and version files, runs the three verification layers (`npm test`, `check:generated` and `check:versions`, `npm run eval`), opens the release pull request, waits for CI and squash-merges. The release needs the person's approval, given one of two ways: by asking for it in the chat ("release", "go patch", "ship minor", "release 1.0": a small model reads your short message and the agent's last words; Claude Code saves the request and the CLI takes it, once, if the default branch has not moved since, and lets you raise the version but not lower it), or by recording it with `go-getter approvals release v<version> [<sha>]` (`--dry-run` shows the version, the head sha and the command). If the head moves after the approval it refuses and names both shas; without an approval, or with a failing layer, nothing is pushed. It never tags or publishes ([decision 0094](docs/decisions/0094-gated-actions-need-human-approval.md); the chat request is [decision 0187](docs/decisions/0187-a-release-the-user-asks-for-in-the-chat-is-the-approval-to-merge-it.md) and [0188](docs/decisions/0188-a-release-request-is-read-from-what-the-user-typed-by-a-small-model-and-bounded-by-code.md)).

## Develop

`npm test` (unit), `npm run build` and `npm run check:generated` (golden output), `npm run eval` (behavior evals), `npm run check:*` (guardrails). Releases are gated on all three layers ([decision 0013](docs/decisions/0013-layered-verification-gate.md)). Decisions and guardrails live in [`docs/`](docs/decisions/); the plan and its status are in [`docs/plans/`](docs/plans/archive/v0.2-agent-core-hardening.md) (`go-getter plan status|next|start|done`).

`npm run e2e:lifecycle` runs the whole path with a real Claude Code in an isolated config dir: install the plugin from this checkout, set up a scratch repository through the init skill, run the generated checks and ship a change (a fake `gh` stands in for GitHub; it needs a Claude login and spends under a dollar; the login travels as an access token in the environment, never copied). `npm test` (unit), `npm run build` and `npm run check:generated` (golden output), `npm run eval` (behavior evals), `npm run check:*` (guardrails). Releases are gated on all three layers ([decision 0013](docs/decisions/0013-layered-verification-gate.md)). Decisions and guardrails live in [`docs/`](docs/decisions/); the plan and its status are in [`docs/plans/`](docs/plans/v0.2-agent-core-hardening.md) (`go-getter plan status|next|start|done`).

**Status:** v0.4.1.

The name means *one who gets things done* — it has nothing to do with the Go language.
