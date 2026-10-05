# Changelog

## [0.1.0] - 2026-10-05

### Added

- Behavior evals that catch compiler and renderer regressions across fixture repos without a model or an API key, and settle how evals authenticate on CI.
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
- Vendored knowledge-base tooling 0.15.0 shipped to every host in a single install, with a check that the tree is never hand-edited.
- Mechanical enforcement of neutrality, guardrail declarations, tags and the Node floor, in place of review.
- Per-host adapters, the build command and the drift check, so every supported host installs from this repo and generated files cannot silently diverge.
- Validated per-host capabilities manifests, so adapters and enforcement pick each host's strongest tier mechanically.
- A zero-dependency frontmatter parser and serializer, as decision 0019 forbids a YAML dependency.
- The compiler CLI scaffold and the source and output layout, with every guardrail's npm script wired from day one.

### Changed

- The knowledge-base workflow now runs through go-getter's own plugin, with a per-PR capture, conform and attribute checklist and Conventional Commit subjects enforced in pre-push and CI.
- Unit, golden and deterministic checks run on every PR, as decision 0013 makes layers 1 and 2 a gate on every change.
- Repository bootstrapped with go-getter's own knowledge base and plan, so every later change is checked against recorded intent from commit 0.

### Documentation

- Questions, options and recommended defaults of the six v0.1 harness packs, recorded before building them.
- How routing executes on each host: per-step adaptation through hooks without go-getter owning a runtime.
- Model prices and local endpoint options, with expiry dates, for the cache-aware cost model.
- Node floor set to the oldest supported LTS with fail-open hooks, superseding the Node-only tooling decision.
- Host-agent capability matrix and the harness extension points of Claude Code, Codex, Kilo Code and OpenCode, Cursor, Gemini CLI and GitHub Copilot, sourced from vendor documentation.
- Interim workflow note on attribution lines dropped.
