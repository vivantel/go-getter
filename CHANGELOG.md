# Changelog

## [0.1.0] - 2026-10-10

### Added

- A human-in-the-loop pack: irreversible and outward-facing shell commands (force-push, hard reset, `rm -rf`, pushes, pull requests, releases, publishing) need a human, through native ask rules on Claude Code, Kilo and OpenCode and a pre-tool hook hand-over on the other hosts.
- A manifest of everything `apply` writes, with `update` and `apply --remove`, so upgrades and removal never overwrite or delete what the user edited or owns.
- The `go-getter-init` skill carries its own copy of the CLI, so setup needs no network, npx or environment variable.
- `apply` vendors the CLI into `.go-getter/cli` and the generated runner runs it before npx, so hooks and CI enforce where npm cannot fetch from GitHub.
- Plan, watch, refs and CI-status commands (`plan status|next|start|done`, `watch`, `refs`, `ci status`), so plan steps, noisy watchers, candidate `Refs:` and a pushed branch's CI result no longer depend on the agent remembering.
- Verification checks placed locally or in CI, with a CI job written for each, and a stop gate that holds a pushed branch with failing CI.
- Tool-output redaction on Claude Code, Codex, Copilot, Gemini CLI and Kilo, and access modes for restricted paths, so DLP covers what an agent reads, not only what it writes.
- Routing calibrated from telemetry and routed by host-accepted model values; host OpenTelemetry settings where project config accepts them (Gemini CLI).
- A watcher-noise question in the context pack, and plan-step fields written by the `roadmap` and `refactor-plan` skills.

### Fixed

- The init interview now asks through the host's question tool when it has one, one question per message, instead of printing numbered options (seen on Kilo).
- The generated runner uses a local CLI and says when npx cannot run, instead of failing without a word.
- The pre-tool hook no longer denies questions, skill arguments and messages that only name a restricted pattern, and scans only the path-carrying fields of known tools.
- Claude Code delegations are routed by model alias, not full id.
- Git hook variables and the working directory no longer break enforcement, and the commit-subject guardrail and CI follow the default branch.

### Documentation

- The `go-getter:` frontmatter key is documented as go-getter's own format.
- Each host has an honest install status (tested or static-only) instead of all seven being required, with the Claude Code smoke test recorded. Installs made before this release keep a stale Claude Code plugin cache because the version stayed 0.0.0: run `/plugin uninstall go-getter`, delete `~/.claude/plugins/cache/go-getter`, and reinstall.
- Findings from adopting go-getter in a second repository, and the plans for manifest-based update and removal.

- Behavior evals that catch compiler and renderer regressions across fixture repos without a model or an API key, and settle how evals authenticate on CI.
- A release workflow that publishes only when the unit, golden-output, eval and deterministic-check jobs pass, a check that every generated manifest and the release tag carry the package version, and per-host install steps (untested until the install smoke test).
- Cost-routing pack and an expected-cost router: a step runs where its total expected cost is lowest (cache state, output, handoff, escalation risk) among models its data class allows, escalating one tier at a time until a bound sends it to a human.
- Verification-gate pack and stop gate: a failing step escalates instead of ending as "done", bounded per session, then hands over to a human.
- Telemetry pack and metadata recorder, so routing can be calibrated on every host without telemetry becoming a leak channel.
- Governance pack and model eligibility by data class, so DLP does not depend on agent compliance and cost routing never reaches a model its class forbids.
- Orchestration pack and the worktree command: roles, isolation and a handoff contract, with one native agent file per role per host.
- Context pack, adopted in this repo: a small always-loaded context and a stable prompt cache, with the 150-line instruction-file cap enforced in CI.
- Typed pack answers (text and list), detected commands and exactly-one-recommended choices, so project-specific values fit the interview and "accept the defaults" always has an answer.
- Self-adoption gate: no pack ships before this repo runs on it.
- Project-local skills for hosts without a plugin install, so vendored skills keep their shared and template references.
- Harness coverage report per component and host, showing honestly where a rule blocks on one host and is only advisory on another.
- Reconfiguration of adopted packs by superseding decisions, since accepted decisions are immutable.
- Guardrail enforcement materialized into host hooks, git hooks and CI, through a runner that fails open where Node is missing.
- Rendering of pack answers into decisions and guardrails, and the `go-getter-init` skill that drives the one-question-at-a-time interview.
- Repository detection to prefill the interview instead of asking what can be looked up.
- Practice-pack schema and validator, so every pack is uniform data a deterministic renderer can turn into artifacts.
- The knowledge-base skills, templates and session nudge scripts ship to every host in a single install, as go-getter's own source (first vendored, then owned outright).
- Mechanical enforcement of neutrality, guardrail declarations, tags and the Node floor, in place of review.
- Per-host adapters, the build command and the drift check, so every supported host installs from this repo and generated files cannot silently diverge.
- Validated per-host capabilities manifests, so adapters and enforcement pick each host's strongest tier mechanically.
- A zero-dependency frontmatter parser and serializer, as decision 0019 forbids a YAML dependency.
- The compiler CLI scaffold and the source and output layout, with every guardrail's npm script wired from day one.

### Fixed

- Pushes from a linked worktree no longer corrupt the main checkout: tier-3 checks run without the git hook's repository variables, so a check that runs `git init` can no longer re-initialise the pushed repository as bare.
- Host hook commands find the runner from any subdirectory of the project, with or without a shell, name the project to the runtime, and fail open with a warning when no runner exists.

### Changed

- The knowledge-base workflow now runs through go-getter's own plugin, with a per-PR capture, conform and attribute checklist and Conventional Commit subjects enforced in pre-push and CI.
- Unit, golden and deterministic checks run on every PR, as decision 0013 makes layers 1 and 2 a gate on every change.
- Repository bootstrapped with go-getter's own knowledge base and plan, so every later change is checked against recorded intent from commit 0.
- Kilo Code and OpenCode are two host agents, each with its own capabilities manifest, adapter, detection signals and output paths, instead of one combined host that hid unconfirmed paths.
- go-getter owns its knowledge-base tooling and artifact format instead of syncing a vendored copy, which removes the sync script, lockfile and drift check.

### Documentation

- Questions, options and recommended defaults of the six v0.1 harness packs, recorded before building them.
- How routing executes on each host: per-step adaptation through hooks without go-getter owning a runtime.
- Model prices and local endpoint options, with expiry dates, for the cache-aware cost model.
- Node floor set to the oldest supported LTS with fail-open hooks, superseding the Node-only tooling decision.
- Host-agent capability matrix and the harness extension points of Claude Code, Codex, Kilo Code and OpenCode, Cursor, Gemini CLI and GitHub Copilot, sourced from vendor documentation.
- Interim workflow note on attribution lines dropped.
- Wording across the knowledge base and the plan describes the tooling as go-getter's own, and accepted decisions and facts may be corrected in place for wording and factual errors (0067).
