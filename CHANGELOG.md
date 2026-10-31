# Changelog

## [0.4.0] - 2026-10-31

### Added

- `go-getter doctor` and the `apply` report print the allow rules a person may add to `.claude/settings.local.json` when the host's own permission layer refuses a command the project frees (`hitl` `free-commands`) or routes through `plan issue` (`tracker` `writes`). go-getter only prints them and never writes the file; `INSTALLING.md` explains when and how to add one.
- `go-getter interview next|validate` moves the setup questions out of the init skill into a pure verb the active agent renders. Packs can offer profiles (named answer bundles) and tier low-stakes questions advanced, an answers file can seed an interview, and `update --accept-defaults` takes the recommended answer for questions no artifact records, after a dry run that lists each one.
- `go-getter mcp serve`, a stdio MCP server (JSON-RPC 2.0) for hosts that restrict or prompt on every shell call. This release ships the transport only; its tool list is empty until the pack tool declarations land.

## [0.3.6] - 2026-10-24

### Fixed

- The generated `.github/workflows/go-getter-checks.yml` can now satisfy projects' CI-hardening rules, which could not be met on a hash-tracked file that must not be edited. An active decision's `go-getter: ci-workflow:` key sets `permissions: per-job`, a `concurrency` block (`group`, `cancel-in-progress`), and the `checkout` and `setup-node` action refs. Without the key the workflow is unchanged. The header comment is the documented marker for recognising generated workflows (#227).

## [0.3.5] - 2026-10-16

### Fixed

- `go-getter update` no longer fails on a project with large build output. Its plan runs on a temporary copy of the project that took everything but `.git` and `node_modules` (a 7 GB Rust `target/` filled the disk); it now copies what git tracks or would add, plus the generated files the manifest owns even when git ignores them.
- `INSTALLING.md` gives an upgrade route that does not need npx, for installs where npm refuses GitHub fetches (`EALLOWGIT`): run `update` from the project's `.go-getter/cli`, the init skill's bundled CLI or a clone of the release tag.

### Upgrading

A project installed before 0.3.4 whose hooks print `EALLOWGIT` runs `update` from a copy of the CLI (see "Updating" in `INSTALLING.md`); that writes `.go-getter/cli` and the hooks stop calling npx.

## [0.3.4] - 2026-10-15

### Fixed

- The generated runner restores a missing `.go-getter/cli` copy from the release tag with plain git, and runs its npx fallback with `npm_config_allow_git=all`, so a fresh clone no longer loses enforcement to `EALLOWGIT` under npm 12.

## [0.3.3] - 2026-10-12

### Added

- A run has an always-human set (decision 0130): force-push, branch and tag deletion, history rewrites, tags, releases, publishing and now repository settings (`repo-settings`: `gh repo edit|delete|…`, `gh secret|variable set|delete`, `gh ruleset …`, and `gh api` writes to protection, rulesets, access, hooks, keys, actions, environments and pages) stay gated whatever a run or a remembered approval says; only `git-push`, `pr-create`, `pr-merge`, `pr-close` and `comment-post` can be granted, and `run start --grant` and `approvals allow` refuse the rest. In a run, `plan issue comment` and `close` on a step of its range no longer ask; `create`, other steps and other plans do.
- Outward commands can be allowed without a prompt by an autonomous run or a remembered approval, and only while their preconditions hold at that use (decision 0130). `hitl` 0.5.0 asks which shapes (`git-push`, `pr-create`, `pr-merge`, `pr-close`, `comment-post`; default the first four) and, on a host whose hook can ask (Claude Code), the hook asks the first time and remembers the shape (`go-getter approvals list`, `allow <shape>`, `revoke <shape>`). A merge needs green checks, the default branch as base and, in a run, a pull request that names an issue of a step in the run's range. Tags, releases and publishing can never be allowed. On a host with a native ask rule and no hook prompt (Kilo, OpenCode) the rule keeps prompting; on a host with neither (Codex, Gemini CLI, Copilot) a run or `approvals allow` is what lets a command through.
- `go-getter run start <plan> [--through N] [--hours H] [--grant <id>] | status | end` records an autonomous run (decision 0130): a plan range a person starts, kept per user outside git beside the approvals store, expiring at its timeout (8 hours by default), one at a time per project. The pre-tool hook refuses an agent's `run start` and `run end` and any call that opens the store. The record does not yet change what a gate allows; that is the next step of the autonomous-run plan.

### Upgrading

`go-getter update` adopts `hitl` 0.5.0: your `.claude/settings.json` loses the static ask rules for `git push`, `gh pr create|merge|close` where the hook now decides them (Claude Code asks on first use and remembers), and gains rules for repository-settings commands. To keep a shape always asking, answer `run-grants` without it. Decision 0135 is proposed as a draft.

## [0.3.2] - 2026-10-11

### Changed

- The `governance` pack is split into `restricted-data`, `sanitization` and `data-policy` (0.6.0, decision 0132), one concern each. Question ids, defaults and answers are unchanged. `go-getter update` moves a project adopted at any `governance` version to the three packs without asking again: it relabels the old decisions and guardrails (`generated-by`) and re-renders; rules and host files stay the same.
- Gated-command ids name the action, not the host: `pr-create`, `pr-merge`, `pr-close`, `release-create`, `comment-post` (decision 0129). A provider table (GitHub first) supplies each action's commands and native ask rules, chosen by `provider=` on `gate-command` (default `github`; an unknown one is refused with the known list). `gh-pr`, `gh-pr-create`, `gh-pr-merge`, `gh-pr-close`, `gh-release-create` and `gh-comment` are still accepted in `free-commands`. `hitl` is 0.4.0 with neutral wording; generated ask rules are unchanged.
- Coverage and review each have one owner. `verification-gate` 0.4.0 asks for a coverage command and a bar (what the command enforces, a minimum percentage, or no drop below the base branch), runs the command where the machine profile places it and passes the bar in `GO_GETTER_COVERAGE_BAR` and `GO_GETTER_COVERAGE_MIN`; projects that do not answer get no coverage check. `verification-gate` states that it owns the review bar and `orchestration` (0.1.1) only the reviewer role.

### Fixed

- Harness pack wording no longer names a hosting provider or pull requests as the place of review (`hitl` 0.4.0, `context` 0.3.1). The README and `INSTALLING.md` say which packs are harness and which are practice, and a test keeps the line.
- `go-getter update` can re-render a project that chose `internal-data: single-provider`: the provider answer is read back from the internal-data decision, where before no artifact recorded it and the pack was left as it was.

### Documentation

- Which packs are harness and which are practice is stated in the README and `INSTALLING.md`; harness packs name no hosting provider (a test keeps it so).
- Decisions 0129 to 0132 settle pack boundaries, neutral ids, how existing adoptions move to the split packs and the order of the next work (0131); 0133 and 0134 record the coverage command and bar.

### Upgrading

Run `go-getter update` in a project that adopted `governance`: it moves the project to `restricted-data`, `sanitization` and `data-policy` with the same answers and enforcement and asks nothing. `render-pack governance` and `reconfigure governance` say the pack was split and name the three; an old answers file works unchanged for each of them (answers a pack does not ask are ignored). A project adopted at `governance` 0.2.0 is not offered `sanitization`; run `go-getter-init` to adopt it.

## [0.3.1] - 2026-10-11

### Added

- A tracker pack: plan steps can live in GitHub Issues or Jira. `go-getter plan status|next|start` take a step's state from its issue (Jira by status category, never by name), a stale cache is labelled, and a step's issue and a branch's issue are `Refs:` targets. `go-getter plan issue create|comment|close` writes to the tracker the project chose; it is asked about once, a dry run needs no network, and only the names of credential variables are recorded, never a value. Jira is proven live for reads and writes (an issue created, commented and closed in a test project). This repository's open plan steps are GitHub Issues.
- Secret files are used without setup (decision 0126). The pre-tool hook recognises go-getter by what a call runs, from any install (on PATH, `.go-getter/bin`, under the home directory, npx, `node <entry>`), and matches a restricted path by what a command opens, not by its text, which ends the false denials for a path mentioned in a commit message or an `echo`.
- A command's first use of a secret file is asked once and remembered. The approval is per user and project, kept outside git, bound to a hash of the command's code and its local imports, and lapses only when that code changes. `go-getter approvals` lists (current or STALE), adds and revokes; an agent cannot add or revoke one or write the store. Only Claude Code prompts on first use, because it is the one host whose pre-tool hook can ask; every other host denies and hands over with the `approvals add` line.
- Projects can free named outward commands from the human gate. The pull request catalog id is split into `gh-pr-create`, `gh-pr-merge` and `gh-pr-close`, so merging can be freed alone; an answer that names `gh-pr` still means all three. hitl 0.3.1.
- Tracker write verbs are gated by what a call runs: the hook prompts once for `plan issue create|comment|close` however go-getter is run, where before only listed spellings were gated. Tracker pack 0.3.0 drops the write-commands question; an answer file from 0.2.0 still renders.

### Fixed

- A push is judged by the refs it sends, not by the checked-out branch, so pushing a tag from a detached HEAD or a branch from master works.
- A pending secret approval lasts 30 minutes (it was two), because a host prompt can wait that long.
- The test run no longer leaves `gg-*` fixtures in the temp directory; a full run had filled a small tmpfs.

### Documentation

- INSTALLING.md and the README describe the tracker pack, Jira settings and how a secret file reaches a command.
- Decisions 0117, 0118 (tracker-backed plans), 0123, 0124, 0126, 0127 and 0128 (v0.4 order, superseding 0068).

## [0.3.0] - 2026-10-11

### Added

- A git-workflow pack: it asks for the branch name pattern, how the default branch is protected and whether `Refs:` trailers are required, encouraged or off. Conventional commit subjects, squash merge with green CI and one change per branch and pull request are fixed rules. A new check fails work done on the default branch; this repository adopts the pack.
- Spec-tool support: OpenSpec is detected through a tool table; a change folder the diff touches is a must-have `Refs:` target, and `conform` accepts a change folder as a target.
- Secret scanning: a shared pattern library serves output redaction and `builtin:secret-scan`, which fails on secrets in the lines a change adds (file, line and kind, never the value). Tier-3 checks can run at the `pre-commit` and `pre-push` stages, and `apply` writes `.githooks/pre-commit` when asked. Governance 0.3.0 asks whether to scan and which paths to skip.
- PII masking: email addresses, payment cards and IBANs (and, when listed, phone numbers and national ids) in tool output are replaced with per-session pseudonyms such as `[email-1]`. The map holds salted hashes, never values, and is deleted when the session ends. Governance 0.4.0 asks about it, and `go-getter coverage` names the hosts that cannot replace tool output.
- `go-getter secret run` passes a secret file to an approved command without the model seeing it, scrubbing the output; `go-getter secret put` fills a sink path from stdin or a declared source. Governance 0.5.0 asks which commands and sources are approved (none by default).
- `go-getter sandbox` prints, per host, the settings snippet that restricts secret paths, marked confirmed or not confirmed. It writes no file.

### Fixed

- `go-getter update` failed in projects that adopted the checkpointing pack because some answers were recorded nowhere it reads. Checkpointing 0.2.0 and hitl 0.2.0 record every answer, and `update` leaves a pack alone when an existing question has no recorded answer.

### Documentation

- README and INSTALLING.md describe the git-workflow pack, spec-tool support and sanitization.
- Decisions 0099 (git-workflow pack), 0105 (no generated runbook form, after a measured spike), 0106 and 0107 (scanning, masking, `secret run` and `put`).

## [0.2.0] - 2026-10-10

### Added

- A checkpointing pack: before a gated command (force-push, hard reset, `rm -rf` and the rest of the catalog) and, optionally, before a plan step, a checkpoint of the working tree is taken, so work lost to a shell command can be restored. You choose who takes it (the pre-tool hook with an instruction fallback, or instruction only), when, and how many to keep (10 or all).
- Checkpoints are hidden git refs under `refs/go-getter/checkpoints` (tracked and untracked files, not ignored ones), written without touching the working tree, index, HEAD or branches.
- `go-getter checkpoint create|list|restore|prune`. `restore` shows what would change and acts only with `--yes`; it puts back the files modified or deleted since the checkpoint and leaves files created since in place, listing them.
- The harness coverage report shows component 9 (checkpointing) at tier 2 on Codex, Cursor, Kilo and OpenCode, where the hook takes the checkpoint, and names the restore commands (Claude Code and Gemini CLI also have their own, which cover file edits only). Copilot stays advisory until its hook payload is confirmed.

### Documentation

- The README and INSTALLING.md describe the checkpointing pack, which checkpoint commands exist, what is and is not saved, and the secret-file caveat.

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
