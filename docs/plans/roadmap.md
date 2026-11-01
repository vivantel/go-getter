# Roadmap — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/archive/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Written 2026-11-01 as the one active plan. It replaces the plans `backlog`, `host-adapters`, `mcp-server`, `retrieval-pack`, `third-party-packs`, `throughput-50x`, `host-permission-rules` and `v0.2-agent-core-hardening`, now in `docs/plans/archive/`. It keeps only open steps whose decisions are active and not superseded; done steps stay in the archived plans. Every pending step names its issue (`Issue: #N`); the throughput steps (T1-T10) have none yet, so create theirs with `go-getter plan issue` (a human approves each write).

Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`; at each phase boundary run `go-getter:lint`. Read the guardrails a step governs before changing code: `no-runtime-dependencies`, `owned-files-never-clobbered`, `generated-host-files-not-hand-edited`, `neutral-source-has-no-host-specific-language`, `telemetry-records-metadata-only`, `restricted-paths-denied`.

## Resume protocol (re-entrant, self-checkpointing)

Any session, fresh or interrupted, resumes from this file alone:

1. Read the **Status board** below, then `git worktree list` and `git log master..<branch>` for the step you take. The board and git must agree; if they do not, git wins and you fix the board first.
2. Take the first step that is `[~]` (finish it), else the first `[ ]` whose `Needs` are all `[x]`. Never start a step whose branch is on the board; continue it in that worktree.
3. Every active step carries a `Progress` line: `date · branch · worktree · last commit · done · next`. Rewrite it in the same commit as the work, so a commit is a checkpoint and a crash loses at most the uncommitted diff.
4. Mark `[~]` on the first commit. Mark `[x]` when the step's `Check` passes; the board's `Merged` column says whether it has landed. A step done on a branch but unmerged stays `[x]`; do not redo it.
5. Before stopping for any reason, commit (a `wip:` commit on the step branch is fine), update the `Progress` line and the board row, and write the next action as something a fresh session can run.

**Status board (2026-11-01, from `git worktree list` and `git log master..`)**

| Step | Marker | Branch | Worktree (`../go-getter-wt/…`) | Merged | Next action |
|---|---|---|---|---|---|
| T1 throughput report | `[x]` | `feat/state-checking-gate` | `state-checking-gate` | yes (#245, `a84e8d9`) | none; create its issue with `go-getter plan issue` |
| T2 dogfood install | `[~]` | `feat/dogfood-install` | `dogfood-install` | no | run `go-getter doctor` on a fresh clone; check the stale-pin test; PR |
| T3 ship verb | `[~]` | `feat/ship-verb` | `ship` | no | run the Check; add any missing Done-when case; squash the duplicate-titled commits |
| decision 0159 (ask only when unrecoverable) | draft, uncommitted | `docs/automation-first-gates` | `automation-first` | no | commit it; then re-read 0155 and T7 against it |
| interview follow-ups (#233-#237) | plan added | `feat/pack-tiers-and-profiles` | `pack-tiers` | no | outside this roadmap; land or rebase |
| T4-T10, Phases 2-6 | `[ ]` | none | none | no | see each step |

## Held (not steps; each waits for something outside the plan)

- **Retrieval pack** (#214 skeleton and MCP entry, #215 injection hook, #216 index governance, #218 adopt): decision 0145 holds the whole pack until a virage release conforms (V2). Plan text is in `docs/plans/archive/retrieval-pack.md`, steps 3, 4, 5, 7; move them back here when V2 is done.
- **Foreign packs** (#184 manifest entry, digest and vendoring; #185 content rule; #186 author guide; #187 adopt): decision 0142 waits for someone who asks to write a pack. Plan text is in `docs/plans/archive/third-party-packs.md`, steps 3 to 6. Budgets (W1, W2) are not held.
- **Helper protocol** (#189): waits for a second implementation of a kind or a third party who asks (0142). Text in `docs/plans/archive/backlog.md`, L.18.
- **Start a run by confirmation** (#166): needs draft decision 0137 accepted and softens the human-only start of a run; postponed 2026-10-12. Text in `docs/plans/archive/backlog.md`, L.16.

---

## Phase 1 — Throughput: human minutes per merged outcome (50x stretch)

Written from an interview with the repo owner (`sergemso`) who works about 20 h a day with a host agent and wants 5-50x more outcome per human minute at the same quality. Read first: `docs/facts/0040-oct-31-throughput-baseline-and-friction.md` (baseline and friction), then decisions `0154` (metric), `0155` (human gates, default-and-log), `0156` (10 agents), `0157` (ship verb, redirect) and `0158` (gate stack, audit). Owner-side procedure: `docs/skills/reviewing-the-daily-digest.md`. Guardrail: `docs/guardrails/raw-commands-redirect-to-verbs.md`.

The owner's attention was the bottleneck on 2026-10-31: they relayed one-word answers, approved every merge and release, and watched agents do by hand what go-getter verbs should do. After this phase: a deterministic metric (T1); this repo runs on its own plugin (T2) and routine actions are verbs (`ship`, `release --batch`; T3, T5) that a hook enforces (T4); up to 10 agents run in worktrees (T6); decisions default and log (T7); a gate stack and a sampled audit replace per-PR review (T8); a plan is drafted from a one-line goal (T9); the result is measured against the baseline (T10).

**Rules the design fixes (do not re-decide):** quality gates are never dropped for speed; releases stay human-approved (batched); the four ask-triggers of 0155 are the only reasons an agent stops to ask; the metric comes from a deterministic report, never an agent estimate; no new runtime dependency.

### T1 Throughput report — [x] ‖
Class: implement · Needs: none · Check: `node --test compiler/test/metrics-day.test.mjs`
Context: fact 0040 was measured by hand from host transcripts (`~/.claude/projects/<project>/*.jsonl`) and `gh pr list`. The telemetry code is in `compiler/src/telemetry/`; command files are in `compiler/src/commands/` (see `telemetry.mjs`, `watch.mjs` for the shape). Transcripts hold metadata (timestamps, tool names, whether a turn is a human text turn); prompt text must not be stored (`telemetry-records-metadata-only`).
Do: add `go-getter metrics day [--date D]` printing, for the date: active minutes (gaps under 10 min), wall minutes, human text turns, merged PRs, lines added and removed, median open-to-merge minutes, and human minutes per merged PR. Read transcripts through the existing host readers where they exist; read PRs through the tracker/`gh` adapter. Counts and times only, no message text.
Done-when: the test feeds fixture transcripts and PR JSON and gets the exact figures above; the report prints no prompt text; running it for 2026-10-31 on a machine with the transcripts reproduces fact 0040's counts.
Progress 2026-11-01 · `feat/state-checking-gate` · `../go-getter-wt/state-checking-gate` · `a84e8d9` · done: `metrics day` in `compiler/src/metrics/day.mjs`; `metrics-day.test.mjs` 5/5 pass; reproduces fact 0040 (5 PRs, +2193/-158); merged as #245 · next: none.

### T2 Dogfood install — [~] ‖
Class: implement · Needs: none · Check: `go-getter doctor`
Context: on 2026-10-31 the plugin was not installed in this repo, so `/go-getter:*` skills were missing and the plugin cache (0.3.6) lagged the repo. Decision 0010 (self-hosting ratchet) says this repo uses go-getter. Do not clobber uncommitted host files (`owned-files-never-clobbered`).
Do: make `go-getter apply` the way this repo gets its host files, enable the repo's own plugin at its current version in the project settings, and make `go-getter doctor` report a plugin/CLI version mismatch with the fix. Add a CI check that fails when the repo's pinned plugin version is older than its latest tag.
Done-when: in a fresh clone, `go-getter apply` followed by starting the host lists the `go-getter:*` skills; `go-getter doctor` exits 0 and prints no version mismatch; the CI check fails on a deliberately stale pin in a test.
Progress 2026-11-01 · `feat/dogfood-install` · `../go-getter-wt/dogfood-install` · `fc8de1d` · done (committed, not yet re-run by me): project settings pin the repo's own plugin to a release tag; `plugin-pin` check, CI step and `plugin-pin.test.mjs`; `apply` and `doctor` changed; a decision for it · next: verify each Done-when item by running it, then PR.

### T3 The ship verb — [~] ‖
Class: implement · Effort: high · Needs: none · Check: `node --test compiler/test/ship.test.mjs`
Context: decision 0157; branch `feat/ship-verb` already holds 3 commits toward it, so start from there. Existing pieces: `go-getter watch` (`compiler/src/watch.mjs`, `--until done` for CI), the tracker adapter (`compiler/src/trackers/`), `refs` (`commands/refs.mjs`), `checkpoint`. `docs/skills/working-a-change.md` fixes branch, commit and merge rules (Conventional Commit title, squash merge with green CI, never on `master`).
Do: add `go-getter ship [--plan P --step S]`: verify branch name and a clean worktree, run the step's `Check`, build the commit message and PR body from the diff, the step and the `Refs:` of artifacts the diff touches, push, open the PR, watch CI to a conclusion, squash-merge only on green, and print a one-line result. It takes a checkpoint first, stops without merging on any red check, and is an approved-once gated action per run (0130), not per call. No model is used.
Done-when: tests with a fake `gh` show the happy path merging once, a red check leaving the PR open, a bad branch name refused, and a checkpoint taken before the push.
Progress 2026-11-01 · `feat/ship-verb` · `../go-getter-wt/ship` · `6d3bc4d` · done (committed, not yet re-run by me): `compiler/src/ship.mjs` and `commands/ship.mjs`, a `gate.mjs` change, attribute-skill note, CI status errors read as errors, staged refs listed in the PR body · next: run the Check and map its tests to the four Done-when cases; `fe164f2` and `e7bc5be` share a title, so squash on merge.

### T4 Redirect hook and allow-rules — [ ]
Class: implement · Needs: T3, H2 · Check: `node --test compiler/test/redirect-hook.test.mjs`
Context: decision 0157; guardrail `raw-commands-redirect-to-verbs`. The hook machinery is `compiler/src/hook.mjs` and `compiler/src/checkpoint-trigger.mjs`; H2 moves `hook.mjs` behind the adapter registry first, so this step does not conflict with it. `go-getter doctor` already prints allow rules for commands a host layer blocks (PR #238).
Do: add a pre-tool rule that denies raw `git push`, `gh pr create`, `gh pr merge` and release sequences when `ship` or `release` covers them, with a message naming the verb; give `ship` and `release --batch` entries in the doctor allow-rule output; the git-hook floor (0009) covers hosts with no blocking hook. Keep a documented escape: a human may run the raw command.
Done-when: tests show each raw sequence denied with the verb named, the verbs themselves allowed, and the doctor output listing the allow-rules; `go-getter verify` passes with the guardrail's `enforcement` raised from tier 1 to tier 2 with a `run`.

### T5 Batched release — [ ]
Class: implement · Needs: T3 · Check: `node --test compiler/test/release-batch.test.mjs`
Context: on 2026-10-31 two of five PRs were release chores. Releases are gated actions needing a human (0094, `release-requires-passing-gate`). The `changelog` skill and `docs/skills/working-a-change.md` define the release PR today.
Do: add `go-getter release --batch`: collect merged-since-last-tag changes, compute the version bump from Conventional Commit types, write the changelog entry and version files, open the release PR, run the three verification layers, and merge only after a recorded human approval (`approvals`). Never run without that approval.
Done-when: tests show the bump derived from commit types, a refusal without approval, a refusal when a verification layer fails, and one release PR covering several merged changes.

### T6 Ten agents with conflict-aware scheduling — [ ] ‖
Class: implement · Needs: none · Check: `node --test compiler/test/worktree.test.mjs compiler/test/run-next.test.mjs`
Context: decision 0156 supersedes 0042; the pack answer is `max-concurrent` in the orchestration pack (see `docs/skills/adding-a-practice-pack.md`); the guardrail `max-concurrent-agents-rule` and `go-getter worktree new` (`compiler/src/worktree.mjs`) enforce the limit. `go-getter run next` (`compiler/src/runs/next.mjs`) picks the next ready step.
Do: add `10` as a pack option for `max-concurrent`, reconfigure this repo so 0042 becomes `superseded` with `superseded-by: 0156-up-to-10-agents-run-at-once-each-in-its-own-worktree` and the guardrail text follows; make `run next` return up to the free slots, never two steps whose `Do` text names the same file path, and never a step whose `Needs` are not `[x]`.
Done-when: tests show `worktree new` allowing 10 and refusing the 11th, `run next` returning disjoint parallel steps, and `go-getter lint` passing with 0042 superseded.

### T7 Default-and-log and the digest — [ ] ‖
Class: implement · Needs: none · Check: `node --test compiler/test/digest.test.mjs`
Context: decision 0155, procedure `reviewing-the-daily-digest`. Interview skills (`plugins/go-getter/skills/`) ask one question at a time and wait. Draft decisions use `status: draft`.
Do: add an unattended mode to the interview verbs (`--defaults`): take the recommended option, write a `draft` decision or fact with the reason, and stop only on the four triggers of 0155 (hard to reverse, changes a committed decision, data-class or security impact, spend over budget). Add `go-getter digest` listing logged defaults, stopped triggers, merged PRs, spend and the audit sample since the last digest.
Done-when: tests show a defaulted answer writing a draft artifact, each trigger stopping the run with a clear reason, and the digest listing all five kinds of item from fixtures.

### T8 Gate-stack runner and audit picker — [ ]
Class: implement · Needs: T3 · Check: `node --test compiler/test/gate-stack.test.mjs`
Context: decision 0158. The reviewer agent is read-only (`reviewer-read-only`); the verification gate is `compiler/src/gate.mjs` and `verify.mjs`; `conform` is a plugin skill that checks a diff against decisions and guardrails.
Do: make `ship` run, in order, the step `Check`, a conform pass, a reviewer pass on a fresh context given only the diff, brief and decisions, then CI, and record each result in the run record; add `go-getter audit pick` choosing about 20% of merged PRs at random plus every PR the reviewer flagged, written to the digest. A failed audit must be recordable as a new check, guardrail or reviewer instruction (`audit fail <pr> --as check|guardrail|instruction`).
Done-when: tests show `ship` refusing to merge when any gate fails, the reviewer pass receiving no author transcript, the picker including all flagged PRs and a seeded random sample, and an audit failure creating the follow-up artifact stub.

### T9 Plan drafting from a one-line goal — [ ]
Class: implement · Needs: T7 · Check: `node --test compiler/test/plan-draft.test.mjs`
Context: today the owner interviews, then hand-writes prompts for new sessions. The roadmap skill produces plans in the `go-getter plan` format; the planner agent is read-only. `go-getter run` hands the next step to a session.
Do: add `go-getter plan draft "<goal>"`: run the unattended interview (T7) through the planner and reviewer agents, write the plan with `Check` commands and `‖` markers, and stop at the single plan approval of 0155. Make `go-getter run next` emit a self-contained brief for a fresh session from a step, so no prompt is hand-written.
Done-when: tests show a goal producing a plan that `go-getter plan next` parses, every step having a `Check`, an approval recorded before any step starts, and `run next` printing a brief that names files, the why and the done-when.

### T10 Measure against the baseline — [ ]
Class: review · Needs: T1, T4, T5, T6, T8, T9 · Human: needs a week of real use before the figures mean anything · Check: `go-getter metrics day`
Context: baseline in fact 0040 (about 45 man-hours for about 20 h of attention on 2026-10-31); target in decision 0154 (floor 5-10x fewer human minutes per merged outcome, stretch 50x, quality unchanged).
Do: after a week, run `go-getter metrics day` for each day, compare human minutes per merged outcome with the baseline, count audit failures and escaped defects, and record the result as a fact. If the floor is missed, name the bottleneck from the data and plan the next change; if audit failures exceed the agreed error rate, tighten gates (0158) before more speed.
Done-when: a fact records the measured multiple and the audit-failure count, `go-getter:lint` passes, and the next bottleneck is named here as a new step.

---

## Phase 2 — Host adapter boundary

Decision `docs/decisions/0118-extension-architecture-core-and-edges.md` (host-adapter paragraph) fixes the design; read it first. A host is spread through the core today: per-host branches in `compiler/src/apply.mjs`, renderers in `agents.mjs`, payload parsing in `hook.mjs`, the matrix in `capabilities.mjs` and `coverage.mjs`. This phase makes a host one module behind a registry. Scope: Claude Code first, then OpenCode and Kilo (shared fork format, fact 0005); Codex, Cursor, Gemini CLI and Copilot are deferred, reached through the registry by a wrapper with no change in output.

**Rules the design fixes (do not re-decide):** generated output is byte-identical before and after (golden and drift checks must not change); the enforcement path stays in-process; the registry is internal, not a public contract (0118); a host's unconfirmed shapes stay marked in its fact. A step is done only when `npm run check:generated` and `npm test` pass without updating any golden file.

### H2 Registry, conformance test and the Claude Code adapter — [ ]
Issue: #85
Class: implement · Effort: high · Needs: none · Check: `npm run check:generated && npm test`
Do: add the adapter registry and a conformance test that runs every registered adapter through the interface (outputs are deterministic, owned files are marked, a missing capability is reported and never guessed). Move Claude Code's code behind an adapter module; `apply`, `agents`, `hook` and `coverage` reach it through the registry. Leave every other host on its present code through a wrapper adapter. The registry obeys decision 0119: an adapter takes and returns plain data, with no callbacks and no shared state, and the conformance test checks a JSON round trip.
Done-when: no golden file changes; the conformance test passes for the Claude Code adapter and the wrapper and shows inputs and outputs unchanged by a JSON round trip; `go-getter apply --check` is clean in this repository.

### H3 OpenCode and Kilo adapters — [ ] ‖
Issue: #86
Class: implement · Effort: high · Needs: H2 · Check: `npm run check:generated && npm test`
Do: move OpenCode and Kilo behind adapters sharing one fork base (their agent and plugin formats differ only in paths and the plugin file location, fact 0005).
Done-when: no golden file changes; both pass the conformance test; the Kilo-only differences (the plugin directory, the question tool, fact 0034) live in the Kilo module.

### H4 Deferred hosts on the registry — [ ] ‖
Issue: #87
Class: implement · Needs: H2 · Check: `npm run check:generated && npm test`
Do: register Codex, Cursor, Gemini CLI and Copilot through wrapper adapters that call today's code, mark them `deferred` in the registry, and make `go-getter coverage` say so beside their unconfirmed shapes.
Done-when: no golden file changes; the four hosts pass the conformance test through their wrappers; `coverage` shows them deferred.

### H5 Contributor path — [ ]
Issue: #88
Class: implement · Needs: H3, H4 · Check: `npm run check:guardrails && npm test`
Do: add a fact template for a host's integration surface (what it accepts, what is confirmed and from which source and date, what is not), rewrite `docs/skills/adding-a-host-agent.md` as "write one adapter module, one fact, pass the conformance test", and add a scaffold command or a copyable skeleton module with a failing conformance case that names what is missing.
Done-when: following the procedure from the skeleton produces an adapter that passes the conformance test for a fake host used in the tests; the skill names no step that edits `apply`, `agents` or `hook`.

### H6 Host adapters: docs and lint — [ ]
Issue: #89
Class: review · Needs: H5 · Check: `npm run check:plans && npm run check:guardrails`
Do: describe the adapter boundary and the deferred hosts in README and INSTALLING.md and run the full `go-getter:lint` skill.
Done-when: lint reports no errors and the README and INSTALLING.md describe the boundary.

---

## Phase 3 — go-getter as an MCP server

Decision `docs/decisions/0139-go-getter-serves-adopted-pack-verbs-as-read-only-mcp-tools-over-stdio.md` fixes the design; read it first. It sits on `0119-helper-contract-v0.md` (a separate surface) and `0138-mcp-servers-are-allowlisted-and-their-calls-classed-masked-and-scanned.md` (the allowlist that lists this server). The stdio server (`go-getter mcp serve`, #176) is done.

**Rules the design fixes (do not re-decide):** version 1 ships read tools only, enforced by a fixed read-only function list at run time; `run start|end`, `approvals add|allow|revoke` and `secret` are never exposed; stdio only; off by default; a tool prints what its CLI verb prints after the secret and personal-data check; the tools listed are those of adopted packs only.

### M2 Pack tool declarations and the never-list — [ ]
Issue: #177
Class: implement · Effort: medium · Needs: none · Check: `node --test compiler/test/mcp-declarations.test.mjs`
Do: add an optional `mcp` section to the pack format (name, description, input schema of ids and enumerated values only, a named read-only function, class `read|write`) with schema validation; the registry lists the tools of the adopted packs only and refuses at load any declaration whose function is not on the fixed in-code list of read-only functions (so a vendored pack cannot widen it); a test guards the list against `run start|end`, `approvals`, `secret` and every writing verb, and fails if a shipped tool is not `read`.
Done-when: tests show a pack's tools listed when adopted and absent when not, an invalid declaration rejected, a declaration naming a writing verb or a path input refused, and the read-only list enforced.

### M3 The read tools — [ ]
Issue: #178
Class: implement · Effort: high · Needs: M2 · Check: `node --test compiler/test/mcp-tools.test.mjs`
Do: declare and serve, in the owning packs, plan status and next, refs, coverage, run status and next, and reading the knowledge base (list and get decisions, facts, guardrails and skills); each verb's logic is refactored where needed into a function that returns data (the CLI prints it, the server returns it), because the CLI verbs print and return exit codes and would corrupt the protocol stream; output passes stateless masking (a label per kind, no numbering), and inputs are ids resolved under `docs/` and `docs/plans/`, never paths.
Done-when: tests show each tool returning the same data its CLI verb prints, nothing but protocol messages on stdout, a secret in a result masked, a path or `../` input refused, and a project without the pack not offered the tool.

### M4 Opt-in wiring — [ ]
Issue: #179
Class: implement · Effort: high · Needs: M2 · Check: `npm run check:generated && node --test compiler/test/mcp-wiring.test.mjs`
Do: add the `mcp-server` answer (default off; pack home `orchestration` unless the build finds a better one); with it on, `apply` writes the server entry in each host's MCP configuration (locations from step 1 of `docs/plans/archive/mcp-governance.md`), owned and removable, and the allowlist of 0138 lists `go-getter` when that answer exists, with its tools classed `read` from their pack declarations. Hosts whose configuration is unconfirmed are marked so in their fact.
Done-when: tests show the entry written, removed on update or when the answer is off, not hand-editable by the owned-files rule, and the allowlist listing `go-getter` automatically.

### M5 Adopt, document and dogfood — [ ]
Issue: #180
Class: implement · Effort: medium · Needs: M3, M4 · Check: `npm run check:self-adoption && npm run check:generated`
Do: adopt the answer in this repository, regenerate, describe the server in INSTALLING.md and the README, call it once from a host that reads project MCP configuration, and record in the result line what was friction.
Done-when: the checks pass and the result line states what was found.

### M6 MCP native deny rules — [ ]
Issue: #173
Class: implement · Effort: medium · Needs: none · Human: confirm the host rule forms (fact 0036) and that a Cursor project needs the allowlist; held 2026-10-12 · Check: `npm run check:generated && node --test compiler/test/mcp-native.test.mjs`
Do: where a host can deny an MCP server natively, `apply` writes a deny rule for each server of the project's MCP configuration that is off the allowlist (never for tool classes: a native rule would defeat approve-once and run grants), owned and removable like the other rules. Cursor, whose hook shows no server, is the case that needs it.
Done-when: tests show the rules written, removed on update, and not hand-editable by the owned-files rule.

---

## Phase 4 — Work-source budgets

Decision `docs/decisions/0140-foreign-packs-and-helpers-are-vendored-pinned-and-held-to-the-cores-budgets.md` fixes the design; read it first (with 0118 and 0119). Budgets go in the one function every work source passes through, so in-tree sources prove them first. Code: `compiler/src/trackers/worksource.mjs` (`callSource`), `compiler/src/trackers/overlay.mjs` (cache), `compiler/test/support/worksource-contract.mjs`.

### W1 Answer budgets in callSource — [ ]
Issue: #182
Class: implement · Effort: high · Needs: none · Check: `node --test compiler/test/worksource-budgets.test.mjs`
Do: in `callSource`, cap text fields, the bytes of an answer and the items of `list`. A capped field is cut and counted; a `list` over its cap is `unavailable`, and `plan status` and `plan next` refuse to report on it. `list` returns the step summary `plan next` and `plan status` read (id, title, state, parallel, class, needs, issue, `doneWhen` capped), never bodies; detail comes from `get`; loosen `isStep` only as far as that summary needs. Every typed text field passes the secret and personal-data patterns and loses control characters (as `cleanTitle` does for titles). Cache a network source's reads for a time limit and clear them on a write through the core; a local source is not cached. Choose the initial limits from the measured size of the file, GitHub and Jira sources and record them in the contract comment.
Done-when: tests show an oversized field cut with the count, a `list` over its cap making `plan next` refuse, a `list` carrying no bodies, a secret and an email in a title masked, a cached read not reaching the source and cleared by a write, and `plan next` output unchanged for the three in-tree sources.

### W2 Contract suite carries the budgets — [ ]
Issue: #183
Class: implement · Effort: medium · Needs: W1 · Check: `node --test compiler/test/worksource.test.mjs compiler/test/tracker-github.test.mjs compiler/test/tracker-jira.test.mjs`
Do: extend `compiler/test/support/worksource-contract.mjs` so any source of the kind is also tested for the W1 budgets, the dry-run form of writes (prints the request, sends nothing) and the cache behaviour (a repeated read within its limit does not reach a network source, and a write clears it); keep the suite importable by a source outside the tree.
Done-when: the three in-tree sources pass, and a test double that returns a body in `list`, exceeds a cap or sends on a dry run fails.

---

## Phase 5 — Runs, spend and install

### R1 Run polish: report gaps and plan-step stops — [ ] ‖
Issue: #167
Class: implement · Effort: medium · Needs: none · Check: `node --test compiler/test/run-report.test.mjs compiler/test/run-stops.test.mjs`
Do: the frictions the first dogfood run found (`docs/plans/archive/autonomous-run.md`, step 6 result): build a report for a run that timed out (today `run end` finds no active run); list merged pull requests from the default branch whatever branch `run end` runs on; print the end reason once and list only the approvals the run used, not every remembered shape; and decide whether a `Class: plan` step stops a run by default, since a design drafted for the owner's sign-off is not stopped unless it carries `Human:`. Also: a run whose plan was moved to `docs/plans/archive/` fails to build its report (`run end` reads the old path).
Done-when: tests show the timed-out report, the merged list from another branch, the corrected report lines, and the chosen plan-step rule.

### R2 Spend readers driven by capability data — [ ] ‖
Issue: #220
Class: implement · Effort: medium · Needs: none · Check: `node --test compiler/test/spend-transcript.test.mjs compiler/test/spend-sessions.test.mjs compiler/test/run-spend-source.test.mjs`
Do: a design review of the readers built for `docs/plans/archive/run-spend.md` found host knowledge hardcoded in three places (`PARSERS` in `spend/transcript.mjs`, `COMMANDS` in `spend/sessions.mjs`, the source branches in `spend/index.mjs`) where fact 0035 says capability rows are the only data-driven part. Make the row say how (`spendSource: {kind, format, command}`) and have a registry map a kind to its reader, so a new host edits data; split recording from deciding (`settleSpend(project, run)` called by `run next` and the report, so `nextInRun` stays a read); add a `coverage` field to the spend record (`lower-bound`, `shared-directory`) that the report prints beside the figure; cache `detect()` per call and give `spend.json` a schema version.
Done-when: tests show a host added by a capability row alone, `nextInRun` writing nothing when `settleSpend` was not called, the report line carrying the coverage note, and an old `spend.json` read.

### P1 Print the allow rules for freed and approved commands — [~]
Class: implement · Effort: medium · Needs: none · Human: accept draft decision 0152 (decision 0091); no issue yet, create it with `go-getter plan issue create` once the owner has added the allow rule to their `.claude/settings.local.json` · Check: `node --test compiler/test/allow-rules.test.mjs`
Context: decision 0152 fixes the design (go-getter prints allow rules and never writes them; an agent never writes `.claude/settings.local.json`; the rules come from the catalog and the plan-issue verbs, not a second list); `doctor` printing landed in PR #238. T4 extends the same output.
Do: finish `go-getter doctor` and the same output in the `apply` report, `permissions.userAllow` in the capability schema and `claude-code.json`, the INSTALLING.md section, and tests (answer combinations, nothing freed, no file written, no wildcard wider than the command).
Done-when: `doctor` and `apply` print the matching rules for a project that frees `pr-merge` or enables tracker writes and nothing otherwise, the project tree is unchanged by both, the checks pass, and a pull request is open.

### S1 Install smoke test per host — [~]
Class: debug · Needs: none · Human: the host steps need the owner's sessions on Kilo and OpenCode
Progress 2026-10-09: static checks ran for all seven hosts and passed. Claude Code part 2 ran on a scratch repo: `tested`, with defects #18 (stale plugin cache while the version stays 0.0.0) and #19 (generated runner enforces nothing when npm blocks git fetches and `GO_GETTER_CLI` is unset). Kilo and OpenCode wait for the owner's sessions.
Do: follow `docs/skills/install-smoke-test.md`; run its host steps on Kilo and OpenCode (`tested`); Codex, Cursor, Gemini CLI and Copilot stay `static-only`, said so in the release notes with a request for testers. File a GitHub issue per defect. `INSTALLING.md` marks every install untested until this runs.
Done-when: a seven-row table (host / status / init works / defects) is in the description of the PR that completes this step and is copied into the release notes; every `tested` row has no unexplained failures; every `static-only` row says what was checked.

---

## Phase 6 — Retrieval pack, the two live steps

The pack waits for virage (see Held); these two steps run now. Facts and decisions first: `docs/facts/0038-virage-integration-surface.md` and `docs/decisions/0145-retrieval-tools-follow-a-go-getter-contract.md`.

### V2 Virage conforms — [~]
Issue: #213
Class: plan · Needs: none · Human: the changes are made in the virage repository (the owner's); this repository waits for a release · Check: `npm run check:plans`
Do: track the virage issues vivantel/virage#435 (conformance mode and declaration), #436 (read the index policy), #437 (pre-index secret scan), #438 (warm loopback endpoint) and #439 (uninstall cleanup). Record here the release that meets them; then move the held retrieval steps back into this plan.
Done-when: this step's result line names the release that conforms.

### V6 Decide whether to reverse the hold on an earlier retrieval slice — [ ]
Issue: #217
Class: plan · Needs: none · Human: the owner has not decided (2026-10-12: "need to consult"); reversing needs a superseding decision of item 3 of 0145 · Check: `npm run check:plans`
Do: take the owner's answer on whether a slice ships before virage conforms. Candidates: `detect` reporting virage; a prefill of `mcp-servers` with `virage` and a note that every virage tool counts as write; a `coverage` line that a retrieval tool's own prompt hook injects chunks outside tool-call governance. If a slice should ship earlier, supersede item 3 of 0145 and add one step per slice with its done-when; if not, mark this step done with that result.
Done-when: the result line records the owner's answer and any added steps.
